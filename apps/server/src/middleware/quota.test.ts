import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { QuotaKind } from "@ailab/contracts";
import { consumeQuota, currentPeriod, type QuotaRow, type QuotaStore } from "./quota.js";

/** 内存 QuotaStore：与 drizzle 实现同语义（get / upsert increment） */
class MemoryQuotaStore implements QuotaStore {
  rows = new Map<string, QuotaRow>();

  private key(userId: number, kind: QuotaKind, period: string) {
    return `${userId}:${kind}:${period}`;
  }

  async get(userId: number, kind: QuotaKind, period: string) {
    return this.rows.get(this.key(userId, kind, period));
  }

  async increment(userId: number, kind: QuotaKind, period: string, quota: number | null) {
    const k = this.key(userId, kind, period);
    const row = this.rows.get(k);
    if (row) row.used += 1;
    else this.rows.set(k, { used: 1, quota });
  }
}

describe("配额计量（计量先行、限额后置）", () => {
  it("quota NULL = 不限：累加 used 但永不拒绝", async () => {
    const store = new MemoryQuotaStore();
    store.rows.set("1:judge:2026-09-09", { used: 999, quota: null });
    for (let i = 0; i < 10; i++) {
      await consumeQuota(store, 1, "judge", "2026-09-09");
    }
    expect(store.rows.get("1:judge:2026-09-09")!.used).toBe(1009);
  });

  it("未建行时按默认值建行（默认不限），used 从 1 开始累加", async () => {
    const store = new MemoryQuotaStore();
    const r1 = await consumeQuota(store, 7, "interview", "2026-09-09");
    expect(r1).toEqual({ used: 1, quota: null });
    const r2 = await consumeQuota(store, 7, "interview", "2026-09-09");
    expect(r2.used).toBe(2);
  });

  it("有限额时用满即 FORBIDDEN，且拒绝后不计数", async () => {
    const store = new MemoryQuotaStore();
    store.rows.set("2:judge:2026-09-09", { used: 0, quota: 2 });
    await consumeQuota(store, 2, "judge", "2026-09-09");
    await consumeQuota(store, 2, "judge", "2026-09-09");
    const err = await consumeQuota(store, 2, "judge", "2026-09-09").catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
    expect(store.rows.get("2:judge:2026-09-09")!.used).toBe(2);
  });

  it("不同 kind / period / user 相互隔离", async () => {
    const store = new MemoryQuotaStore();
    store.rows.set("3:judge:2026-09-09", { used: 0, quota: 1 });
    await consumeQuota(store, 3, "judge", "2026-09-09");
    await expect(consumeQuota(store, 3, "judge", "2026-09-09")).rejects.toThrow("配额已用完");
    // 换 kind / 换 period / 换用户均不受限
    await consumeQuota(store, 3, "interview", "2026-09-09");
    await consumeQuota(store, 3, "judge", "2026-09-10");
    await consumeQuota(store, 4, "judge", "2026-09-09");
  });

  it("period 为 UTC 日粒度 YYYY-MM-DD", () => {
    expect(currentPeriod(new Date("2026-09-09T08:00:00Z"))).toBe("2026-09-09");
  });
});
