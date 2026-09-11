import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";
import { env } from "./env.js";

// ---------------------------------------------------------------------------
// 按邮箱寻址（CLI --user / AILAB_USER 的身份解析，dev/cli.md §2）
// ---------------------------------------------------------------------------

/** 查用户 id；不存在返回 null（CLI 侧据此报错提示先在 web 注册） */
export async function getUserIdByEmail(email: string): Promise<number | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** 生成可读随机密码（无歧义字符集，12 位；user:claim 未显式传密码时用） */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ---------------------------------------------------------------------------
// 密码哈希（node:crypto scrypt，格式：scrypt$N$r$p$saltB64$hashB64）
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false; // 非法参数 / 畸形哈希一律视为校验失败
  }
}

// ---------------------------------------------------------------------------
// 邮箱验证码（6 位数字，只存 sha256 哈希，10 分钟过期，attempts ≤ 5）
// ---------------------------------------------------------------------------

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_CODE_MAX_ATTEMPTS = 5;

export function generateVerificationCode(): string {
  // 000000-999999，均匀分布
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function hashVerificationCode(email: string, code: string): string {
  // 以 email 作 salt，避免相同 code 跨账号产生相同哈希
  return createHmac("sha256", "email-verification").update(`${email}:${code}`).digest("hex");
}

export interface VerificationRecord {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "too_many_attempts" | "mismatch" };

/** 纯函数：校验验证码记录（失败时由调用方负责 attempts++ 落库） */
export function checkVerificationCode(
  record: VerificationRecord,
  email: string,
  code: string,
  now: Date = new Date(),
): VerifyCodeResult {
  if (record.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }
  if (record.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (record.codeHash !== hashVerificationCode(email, code)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// session cookie（签名 token，服务端不落库会话表，7 天过期，滑动续期）
// token = base64url(JSON{uid,exp}) + "." + base64url(hmac-sha256)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "ailab_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 剩余有效期低于一半时滑动续期 */
const SESSION_RENEW_BELOW_MS = SESSION_TTL_MS / 2;

// SESSION_SECRET 未配置时使用进程内随机密钥：开发可登录但重启后 session 失效
const sessionSecret = env.SESSION_SECRET || randomBytes(32).toString("hex");
if (!env.SESSION_SECRET) {
  console.warn("[auth] SESSION_SECRET 未配置，使用进程内随机密钥（重启后所有 session 失效）");
}

function sign(data: string): string {
  return createHmac("sha256", sessionSecret).update(data).digest("base64url");
}

export function signSession(userId: number, now: Date = new Date()): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: now.getTime() + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export interface VerifiedSession {
  userId: number;
  /** 需要滑动续期（剩余有效期 < 一半）时为重新签发的 token */
  renewToken: string | null;
}

export function verifySession(token: string, now: Date = new Date()): VerifiedSession | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: { uid?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed.uid !== "number" || typeof parsed.exp !== "number") return null;
  if (parsed.exp < now.getTime()) return null;
  const renewToken =
    parsed.exp - now.getTime() < SESSION_RENEW_BELOW_MS ? signSession(parsed.uid, now) : null;
  return { userId: parsed.uid, renewToken };
}
