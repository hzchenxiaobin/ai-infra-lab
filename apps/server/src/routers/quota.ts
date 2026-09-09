import { desc, eq } from "drizzle-orm";
import { QUOTA_KINDS, type QuotaKind, type QuotaUsage } from "@ailab/contracts";
import { db } from "../db/client.js";
import { usageQuotas } from "../db/schema.js";
import { currentPeriod, defaultQuota } from "../middleware/quota.js";
import { authedProcedure, router } from "../trpc.js";

export const quotaRouter = router({
  /** 当前用户各 kind 的用量（当前周期 + 历史记录），未建行时返回默认值 */
  me: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(usageQuotas)
      .where(eq(usageQuotas.userId, ctx.userId))
      .orderBy(desc(usageQuotas.period));

    const period = currentPeriod();
    const current: QuotaUsage[] = QUOTA_KINDS.map((kind: QuotaKind) => {
      const row = rows.find((r) => r.kind === kind && r.period === period);
      return {
        kind,
        period,
        used: row?.used ?? 0,
        quota: row ? row.quota : defaultQuota(kind),
      };
    });
    const history = rows
      .filter((r) => r.period !== period)
      .map((r) => ({ kind: r.kind, period: r.period, used: r.used, quota: r.quota }));
    return { current, history };
  }),
});
