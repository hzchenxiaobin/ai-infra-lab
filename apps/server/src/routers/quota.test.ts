import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageQuotas } from "../db/schema.js";
import { currentPeriod } from "../middleware/quota.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// quota.me 集成测试：MySQL 可用才跑（沿用 learn.test.ts 跳过模式）。
// 覆盖当前周期用量、默认值（无限额）与历史记录分区。
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

const TEST_USER = 987_654_324;

run("quota.me（集成）", () => {
  it("当前周期用量 + 历史记录；无行 kind 返回默认不限额", async () => {
    const period = currentPeriod();
    const historyPeriod = currentPeriod(new Date(Date.now() - 86_400_000));
    await db.delete(usageQuotas).where(eq(usageQuotas.userId, TEST_USER));
    await db.insert(usageQuotas).values([
      { userId: TEST_USER, kind: "judge", period, used: 3, quota: 10 },
      { userId: TEST_USER, kind: "judge", period: historyPeriod, used: 7, quota: 10 },
    ]);

    try {
      const caller = appRouter.createCaller({ userId: TEST_USER });
      const data = await caller.quota.me();

      const judge = data.current.find((u) => u.kind === "judge");
      expect(judge?.period).toBe(period);
      expect(judge?.used).toBe(3);
      expect(judge?.quota).toBe(10);

      // 无行的 kind：used=0，quota 为默认（测试环境未配 QUOTA_DEFAULT_* → 不限）
      const interview = data.current.find((u) => u.kind === "interview");
      expect(interview?.used).toBe(0);
      expect(interview?.quota).toBeNull();

      // 历史周期进 history
      expect(data.current.every((u) => u.period === period)).toBe(true);
      expect(data.history.some((u) => u.kind === "judge" && u.period === historyPeriod && u.used === 7)).toBe(
        true,
      );
    } finally {
      await db.delete(usageQuotas).where(eq(usageQuotas.userId, TEST_USER));
    }
  });
});
