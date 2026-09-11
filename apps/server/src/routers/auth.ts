import { TRPCError } from "@trpc/server";
import { desc, eq, like, or, sql } from "drizzle-orm";
import {
  adminUserBanSchema,
  adminUserClaimSchema,
  adminUserEmailParamSchema,
  adminUserListSchema,
  authLoginSchema,
  authRegisterSchema,
  authSendCodeSchema,
  type CurrentUser,
} from "@ailab/contracts";
import {
  checkVerificationCode,
  generatePassword,
  generateVerificationCode,
  hashPassword,
  hashVerificationCode,
  signSession,
  VERIFICATION_CODE_TTL_MS,
  verifyPassword,
} from "../auth.js";
import { db } from "../db/client.js";
import { emailVerifications, users } from "../db/schema.js";
import { sendVerificationCodeEmail } from "../mailer.js";
import { emailPerDayLimiter, emailPerMinuteLimiter, ipPerHourLimiter } from "../rate-limit.js";
import { adminProcedure, authedProcedure, clearSessionCookie, publicProcedure, router, setSessionCookie } from "../trpc.js";

type UserRow = typeof users.$inferSelect;

function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
    tier: row.tier,
    emailVerified: row.emailVerified === 1,
  };
}

/** 登录成功：种 session cookie（createCaller/CLI 场景无 hono 上下文则跳过） */
function grantSession(ctx: { hono?: import("hono").Context }, userId: number) {
  if (ctx.hono) setSessionCookie(ctx.hono, signSession(userId));
}

export const authRouter = router({
  /** 发送注册验证码：按 IP + 邮箱双维度限流（开放注册下唯一的闸门） */
  sendCode: publicProcedure.input(authSendCodeSchema).mutation(async ({ input, ctx }) => {
    const email = input.email;
    if (!emailPerMinuteLimiter.tryConsume(`email:min:${email}`)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "发送太频繁，请 1 分钟后再试" });
    }
    if (!emailPerDayLimiter.tryConsume(`email:day:${email}`)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "该邮箱今日验证码发送次数已达上限" });
    }
    const ip = ctx.ip ?? "unknown";
    if (!ipPerHourLimiter.tryConsume(`ip:hour:${ip}`)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" });
    }

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    // 每个邮箱只保留最新一条：重发即作废旧码
    await db.delete(emailVerifications).where(eq(emailVerifications.email, email));
    await db.insert(emailVerifications).values({
      email,
      codeHash: hashVerificationCode(email, code),
      expiresAt,
      attempts: 0,
    });
    await sendVerificationCodeEmail(email, code);
    return { ok: true as const };
  }),

  /** 注册：邮箱 + 密码（scrypt）+ 验证码；成功即视为邮箱已验证并种 session */
  register: publicProcedure.input(authRegisterSchema).mutation(async ({ input, ctx }) => {
    const email = input.email;

    const rows = await db
      .select()
      .from(emailVerifications)
      .where(eq(emailVerifications.email, email))
      .orderBy(desc(emailVerifications.id))
      .limit(1);
    const record = rows[0];
    if (!record) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请先获取验证码" });
    }
    const verdict = checkVerificationCode(record, email, input.code);
    if (!verdict.ok) {
      if (verdict.reason === "mismatch") {
        await db
          .update(emailVerifications)
          .set({ attempts: record.attempts + 1 })
          .where(eq(emailVerifications.id, record.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误" });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: verdict.reason === "expired" ? "验证码已过期，请重新获取" : "验证码尝试次数过多，请重新获取",
      });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "该邮箱已注册，请直接登录" });
    }

    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashPassword(input.password),
        emailVerified: 1,
        name: input.name ?? email.split("@")[0],
      })
      .$returningId();
    const userId = inserted[0].id;
    // 验证码一次性使用
    await db.delete(emailVerifications).where(eq(emailVerifications.email, email));

    grantSession(ctx, userId);
    const me = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return { user: toCurrentUser(me[0]) };
  }),

  login: publicProcedure.input(authLoginSchema).mutation(async ({ input, ctx }) => {
    const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const user = rows[0];
    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "邮箱或密码错误" });
    }
    if (user.bannedAt) {
      throw new TRPCError({ code: "FORBIDDEN", message: "该账号已被封禁，如有疑问请联系管理员" });
    }
    grantSession(ctx, user.id);
    return { user: toCurrentUser(user) };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    if (ctx.hono) clearSessionCookie(ctx.hono);
    return { ok: true as const };
  }),

  me: authedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
    return { user: toCurrentUser(rows[0]) };
  }),

  /** 用户管理（dev/cli.md §3：cli user:list，admin）——不返回 password_hash */
  userList: adminProcedure.input(adminUserListSchema).query(async ({ input }) => {
    const where = input.search
      ? or(like(users.email, `%${input.search}%`), like(users.name, `%${input.search}%`))
      : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          tier: users.tier,
          emailVerified: users.emailVerified,
          bannedAt: users.bannedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ count: sql<number>`count(*)` }).from(users).where(where),
    ]);
    return { items, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
  }),

  /** 封禁/解封（dev/cli.md §6：破坏性操作，CLI 侧要求 --yes 确认） */
  userSetBanned: adminProcedure.input(adminUserBanSchema).mutation(async ({ input }) => {
    const result = await db
      .update(users)
      .set({ bannedAt: input.banned ? new Date() : null })
      .where(eq(users.email, input.email));
    if (result[0].affectedRows === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
    }
    return { email: input.email, banned: input.banned };
  }),

  /** 按 email 取单个用户（CLI 内部寻址用，admin） */
  userByEmail: adminProcedure.input(adminUserEmailParamSchema).query(async ({ input }) => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        tier: users.tier,
        emailVerified: users.emailVerified,
        bannedAt: users.bannedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
    return rows[0];
  }),

  /**
   * 认领遗留用户（email 为 NULL 的单用户时代数据，dev/cli.md §3 user:claim）：
   * 绑定邮箱 + 初始密码，历史面试/提交/进度原地保留（数据零迁移）。
   * password 缺省时生成随机密码，仅在本次返回值中出现一次。
   */
  userClaim: adminProcedure.input(adminUserClaimSchema).mutation(async ({ input }) => {
    const rows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    const legacy = rows[0];
    if (!legacy) {
      throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
    }
    if (legacy.email != null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `用户 #${legacy.id} 已绑定邮箱 ${legacy.email}，仅 email 为空的遗留用户可认领`,
      });
    }
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (taken.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "该邮箱已注册，请换一个或直接登录既有账号" });
    }

    const password = input.password ?? generatePassword();
    await db
      .update(users)
      .set({
        email: input.email,
        passwordHash: hashPassword(password),
        // 管理员操作视同已验证；昵称保留原名（可用 web 资料页修改）
        emailVerified: 1,
      })
      .where(eq(users.id, legacy.id));
    const updated = (
      await db.select().from(users).where(eq(users.id, legacy.id)).limit(1)
    )[0]!;
    return {
      user: toCurrentUser(updated),
      /** 仅未显式传密码时非空：生成的初始密码，只显示这一次 */
      generatedPassword: input.password ? null : password,
    };
  }),
});
