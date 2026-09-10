import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  adminQuotaSetSchema,
  adminUserEmailParamSchema,
  QUOTA_KINDS,
  type QuotaKind,
  type QuotaUsage,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { usageQuotas, users } from "../db/schema.js";
import { currentPeriod, defaultQuota } from "../middleware/quota.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

/** 当前 + 历史用量聚合（quota.me 与 adminGet 共享） */
async function quotaOverview(userId: number) {
  const rows = await db
    .select()
    .from(usageQuotas)
    .where(eq(usageQuotas.userId, userId))
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
}

export const quotaRouter = router({
  /** 当前用户各 kind 的用量（当前周期 + 历史记录），未建行时返回默认值 */
  me: authedProcedure.query(async ({ ctx }) => quotaOverview(ctx.userId)),

  /** 查看指定用户配额（dev/cli.md §3：cli quota:get <email>，admin） */
  adminGet: adminProcedure.input(adminUserEmailParamSchema).query(async ({ input }) => {
    const userId = await requireUserIdByEmail(input.email);
    return { email: input.email, ...(await quotaOverview(userId)) };
  }),

  /**
   * 调整指定用户当前周期配额（dev/cli.md §3：cli quota:set <email> <kind> <n|unlimited>）。
   * 只写当前周期行（quota 值），used 保留；后续周期回落 env 默认值。
   */
  adminSet: adminProcedure.input(adminQuotaSetSchema).mutation(async ({ input }) => {
    const userId = await requireUserIdByEmail(input.email);
    const period = currentPeriod();
    await db
      .insert(usageQuotas)
      .values({ userId, kind: input.kind, period, used: 0, quota: input.quota })
      .onDuplicateKeyUpdate({ set: { quota: input.quota } });
    return { email: input.email, kind: input.kind, period, quota: input.quota };
  }),
});

async function requireUserIdByEmail(email: string): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
  return rows[0].id;
}
