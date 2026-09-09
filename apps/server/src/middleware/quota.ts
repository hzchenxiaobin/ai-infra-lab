import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import type { QuotaKind } from "@ailab/contracts";
import { db } from "../db/client.js";
import { usageQuotas } from "../db/schema.js";
import { env } from "../env.js";
import { middleware } from "../trpc.js";

/** 计费周期：UTC 日粒度（YYYY-MM-DD） */
export function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 配额默认值（空/未配置 = 不限，上线初期默认） */
export function defaultQuota(kind: QuotaKind): number | null {
  return kind === "judge" ? (env.QUOTA_DEFAULT_JUDGE ?? null) : (env.QUOTA_DEFAULT_INTERVIEW ?? null);
}

export interface QuotaRow {
  used: number;
  quota: number | null;
}

/** 可替换的存储接口：生产用 drizzle 实现，测试用内存实现 */
export interface QuotaStore {
  get(userId: number, kind: QuotaKind, period: string): Promise<QuotaRow | undefined>;
  /** used++；行不存在时以 defaultQuota 建行（used=1） */
  increment(userId: number, kind: QuotaKind, period: string, quota: number | null): Promise<void>;
}

/**
 * 计量先行、限额后置（dev/server.md §8）：
 * quota 为 NULL = 不限，但 used 无论是否限额都累加。
 */
export async function consumeQuota(
  store: QuotaStore,
  userId: number,
  kind: QuotaKind,
  period: string = currentPeriod(),
): Promise<QuotaRow> {
  const row = await store.get(userId, kind, period);
  const quota = row ? row.quota : defaultQuota(kind);
  const used = row?.used ?? 0;
  if (quota != null && used >= quota) {
    throw new TRPCError({ code: "FORBIDDEN", message: "配额已用完" });
  }
  await store.increment(userId, kind, period, quota);
  return { used: used + 1, quota };
}

export const drizzleQuotaStore: QuotaStore = {
  async get(userId, kind, period) {
    const rows = await db
      .select({ used: usageQuotas.used, quota: usageQuotas.quota })
      .from(usageQuotas)
      .where(
        and(
          eq(usageQuotas.userId, userId),
          eq(usageQuotas.kind, kind),
          eq(usageQuotas.period, period),
        ),
      )
      .limit(1);
    return rows[0];
  },
  async increment(userId, kind, period, quota) {
    await db
      .insert(usageQuotas)
      .values({ userId, kind, period, used: 1, quota })
      .onDuplicateKeyUpdate({ set: { used: sql`${usageQuotas.used} + 1` } });
  },
};

/**
 * 配额中间件（挂在 authedProcedure 之后）：
 * judge.run（评测提交）与 interview.start（LLM 面试场次创建）各挂一个。
 */
export function quotaFor(kind: QuotaKind) {
  return middleware(async ({ ctx, next }) => {
    // 中间件设计为接在 enforceUser 之后；防御 null 直接放行鉴权错误
    if (ctx.userId != null) {
      await consumeQuota(drizzleQuotaStore, ctx.userId, kind);
    }
    return next();
  });
}
