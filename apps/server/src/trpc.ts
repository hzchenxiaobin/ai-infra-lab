import { initTRPC, TRPCError } from "@trpc/server";
import type { Context as HonoContext } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import superjson from "superjson";
import { eq } from "drizzle-orm";
import {
  getCurrentUserId,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  signSession,
  verifySession,
} from "./auth.js";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { env } from "./env.js";

export type Context = {
  /** 登录用户 id；未登录为 null。当前因有自动 provision 回落，实际恒非 null（见下） */
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

  // TODO(M2 完成后删除)：无 session 时回落到单用户自动 provision。
  // CLI 与现有 interview/question/judge 路由仍依赖这个行为；M2 全量切换登录后
  // 删除此回落（未登录 userId 即为 null），并同步删除 auth.ts 的 provision 段。
  const userId = await getCurrentUserId();
  return { userId, ip, hono: c };
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

/** 要求登录：userId 为 null 即 UNAUTHORIZED，下游 ctx.userId 收窄为 number */
const enforceUser = middleware(({ ctx, next }) => {
  if (ctx.userId == null) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const authedProcedure = publicProcedure.use(enforceUser);

/**
 * 管理员：users.email 命中 ADMIN_EMAILS 环境变量。
 * 例外：自动 provision 的遗留单用户（email 为 NULL）在 dev 单用户模式下视为管理员，
 * 以便 CLI 经 createCaller 调 content.import。
 * TODO(M2)：provision 删除后收紧为仅 ADMIN_EMAILS 匹配。
 */
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  const email = rows[0]?.email ?? null;
  const admins = env.ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isLegacyProvisionedUser = email == null;
  if (!isLegacyProvisionedUser && !admins.includes(email)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  }
  return next();
});
