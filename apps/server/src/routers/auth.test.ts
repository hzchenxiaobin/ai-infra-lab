import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  checkVerificationCode,
  generateVerificationCode,
  hashPassword,
  hashVerificationCode,
  signSession,
  VERIFICATION_CODE_MAX_ATTEMPTS,
  verifyPassword,
  verifySession,
} from "../auth.js";
import { db } from "../db/client.js";
import { emailVerifications, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { SlidingWindowLimiter } from "../rate-limit.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// 纯函数单测（无 DB 依赖）
// ---------------------------------------------------------------------------

describe("scrypt 密码哈希", () => {
  it("hash/verify 往返一致", () => {
    const hash = hashPassword("correct-horse-battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct-horse-battery", hash)).toBe(true);
  });

  it("错误密码 / 非法格式拒绝", () => {
    const hash = hashPassword("p@ssw0rd!!");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
    expect(verifyPassword("p@ssw0rd!!", "not-a-hash")).toBe(false);
    expect(verifyPassword("p@ssw0rd!!", "scrypt$1$2$3$4$5")).toBe(false);
  });

  it("同一密码两次哈希不同（随机 salt）", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });
});

describe("验证码", () => {
  it("生成 6 位数字", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it("code 只存哈希，同 email+code 哈希稳定、跨 email 不同", () => {
    const h1 = hashVerificationCode("a@b.com", "123456");
    expect(h1).toBe(hashVerificationCode("a@b.com", "123456"));
    expect(h1).not.toBe(hashVerificationCode("c@d.com", "123456"));
    expect(h1).not.toContain("123456");
  });

  const record = (overrides: Partial<Parameters<typeof checkVerificationCode>[0]> = {}) => ({
    codeHash: hashVerificationCode("a@b.com", "123456"),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    ...overrides,
  });

  it("校验通过 / 码错误 / 过期 / attempts 上限", () => {
    expect(checkVerificationCode(record(), "a@b.com", "123456")).toEqual({ ok: true });
    expect(checkVerificationCode(record(), "a@b.com", "654321")).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(
      checkVerificationCode(record({ expiresAt: new Date(Date.now() - 1000) }), "a@b.com", "123456"),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      checkVerificationCode(
        record({ attempts: VERIFICATION_CODE_MAX_ATTEMPTS }),
        "a@b.com",
        "123456",
      ),
    ).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("attempts 超限优先于码匹配（锁定后即使码对也拒绝）", () => {
    const r = record({ attempts: VERIFICATION_CODE_MAX_ATTEMPTS });
    expect(checkVerificationCode(r, "a@b.com", "123456").ok).toBe(false);
  });
});

describe("session token（签名 cookie）", () => {
  it("sign/verify 往返", () => {
    const token = signSession(42);
    const v = verifySession(token);
    expect(v?.userId).toBe(42);
  });

  it("篡改 payload 或签名拒绝", () => {
    const token = signSession(42);
    const [payload] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: 1, exp: Date.now() + 1000 })).toString("base64url");
    expect(verifySession(`${forged}.${token.split(".")[1]}`)).toBeNull();
    expect(verifySession(`${payload}.bad-signature`)).toBeNull();
    expect(verifySession("garbage")).toBeNull();
  });

  it("过期拒绝", () => {
    const past = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    const token = signSession(42, past);
    expect(verifySession(token)).toBeNull();
  });

  it("剩余有效期不足一半时给出滑动续期 token", () => {
    // 签发时间在 4 天前（剩余约 3 天 < 3.5 天阈值）
    const issuedAt = new Date(Date.now() - 4 * 24 * 3600 * 1000);
    const v = verifySession(signSession(7, issuedAt));
    expect(v?.userId).toBe(7);
    expect(v?.renewToken).toBeTruthy();
    expect(verifySession(v!.renewToken!)?.userId).toBe(7);
  });
});

describe("滑动窗口限流器", () => {
  it("窗口内达到上限即拒绝", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowLimiter(2, 60_000, () => now);
    expect(limiter.tryConsume("k")).toBe(true);
    expect(limiter.tryConsume("k")).toBe(true);
    expect(limiter.tryConsume("k")).toBe(false);
    expect(limiter.used("k")).toBe(2);
  });

  it("不同 key 互不影响", () => {
    const limiter = new SlidingWindowLimiter(1, 60_000, () => 1_000_000);
    expect(limiter.tryConsume("a")).toBe(true);
    expect(limiter.tryConsume("b")).toBe(true);
    expect(limiter.tryConsume("a")).toBe(false);
  });

  it("窗口滑动后额度恢复", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowLimiter(1, 60_000, () => now);
    expect(limiter.tryConsume("k")).toBe(true);
    expect(limiter.tryConsume("k")).toBe(false);
    now += 61_000; // 滑出窗口
    expect(limiter.tryConsume("k")).toBe(true);
    expect(limiter.used("k")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// register/login 流程集成测试：MySQL 可用才跑（沿用 interview.test.ts 的跳过模式）
// ---------------------------------------------------------------------------

async function dbAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

const available = await dbAvailable();
const run = available ? describe : describe.skip;

run("auth register/login 流程（集成）", () => {
  const email = `test-${Date.now()}@example.com`;
  const password = "test-password-1";
  const code = "424242";

  function caller(userId: number | null = null) {
    return appRouter.createCaller({ userId, ip: "127.0.0.1" });
  }

  async function seedVerification(c: string, expiresInMs = 60_000) {
    await db.delete(emailVerifications).where(eq(emailVerifications.email, email));
    await db.insert(emailVerifications).values({
      email,
      codeHash: hashVerificationCode(email, c),
      expiresAt: new Date(Date.now() + expiresInMs),
      attempts: 0,
    });
  }

  it("错误验证码拒绝且 attempts 递增；正确验证码注册成功", async () => {
    await seedVerification(code);
    await expect(caller().auth.register({ email, password, code: "000000" })).rejects.toThrow(
      "验证码错误",
    );
    const rows = await db
      .select({ attempts: emailVerifications.attempts })
      .from(emailVerifications)
      .where(eq(emailVerifications.email, email));
    expect(rows[0].attempts).toBe(1);

    const { user } = await caller().auth.register({ email, password, code });
    expect(user.email).toBe(email);
    expect(user.emailVerified).toBe(true);
    expect(user.tier).toBe("free");
  });

  it("重复注册冲突；登录校验密码；me 返回当前用户", async () => {
    await seedVerification(code);
    await expect(caller().auth.register({ email, password, code })).rejects.toThrow("已注册");

    await expect(caller().auth.login({ email, password: "wrong-password" })).rejects.toThrow(
      "邮箱或密码错误",
    );
    const { user } = await caller().auth.login({ email, password });
    expect(user.email).toBe(email);

    const me = await caller(user.id).auth.me();
    expect(me.user.id).toBe(user.id);
  });

  it("过期验证码拒绝注册", async () => {
    const email2 = `expired-${Date.now()}@example.com`;
    await db.delete(emailVerifications).where(eq(emailVerifications.email, email2));
    await db.insert(emailVerifications).values({
      email: email2,
      codeHash: hashVerificationCode(email2, code),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
    });
    await expect(caller().auth.register({ email: email2, password, code })).rejects.toThrow(
      "已过期",
    );
  });

  it("清理测试用户", async () => {
    await db.delete(users).where(eq(users.email, email));
  });
});
