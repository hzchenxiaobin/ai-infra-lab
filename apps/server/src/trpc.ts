import { initTRPC, TRPCError } from "@trpc/server";
import type { Context as HonoContext } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import superjson from "superjson";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_TTL_MS, signSession, verifySession } from "./auth.js";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { env } from "./env.js";

export type Context = {
  /** 登录用户 id；未登录为 null（2026-09-11 收紧：自动 provision 回落已删除） */
  userId: number | null;
  /** 客户端 IP（限流用）；CLI/createCaller 场景可不传 */
  ip?: string | null;
  /** HTTP 请求上下文（写 session cookie 用）；createCaller 场景为 undefined */
  hono?: HonoContext;
};

export async function createContext(_opts: unknown, c?: HonoContext): Promise<Context> {
  const ip =
    c?.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c?.req.header("cf-connecting-ip") ??
    null;

  if (c) {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const session = verifySession(token);
      if (session) {
        // 滑动续期：剩余有效期不足一半时重新签发
        setSessionCookie(c, session.renewToken ?? token);
        return { userId: session.userId, ip, hono: c };
      }
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
    }
  }
  // 未登录即 null：authedProcedure 抛 UNAUTHORIZED（CLI 走 --user 显式身份）
  return { userId: null, ip, hono: c };
}

/** 种 session cookie（httpOnly，7 天，滑动续期由 createContext 负责） */
export function setSessionCookie(c: HonoContext, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: HonoContext) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export { signSession };

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * 要求登录：userId 为 null 即 UNAUTHORIZED，下游 ctx.userId 收窄为 number。
 * 封禁检查（cli user:ban）：banned_at 非空即拒绝——session 是无状态签名 cookie，
 * 无法主动吊销，封禁在此生效（代价是每个已认证请求一次主键查询）。
 * 注：users 无删除路径，行缺失只出现在 createCaller 合成 userId（测试/CLI）场景，
 * 此时视作未封禁放行。
 */
const enforceUser = middleware(async ({ ctx, next }) => {
  if (ctx.userId == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  }
  const rows = await db
    .select({ bannedAt: users.bannedAt })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  if (rows[0]?.bannedAt) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "账号已被封禁" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const authedProcedure = publicProcedure.use(enforceUser);

/**
 * 管理员：users.email 命中 ADMIN_EMAILS 环境变量（2026-09-11 收紧：
 * email 为 NULL 的遗留用户不再天然是管理员——遗留数据经 user:claim 认领后，
 * 用绑定邮箱加入 ADMIN_EMAILS 获得管理身份）。
 */
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  const email = rows[0]?.email ?? null;
  const admins = env.ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (email == null || !admins.includes(email)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  }
  return next();
});
