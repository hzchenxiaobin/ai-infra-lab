import { and, desc, eq, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  bankImportSchema,
  CATEGORIES,
  questionInputSchema,
  questionListFilterSchema,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { questions } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";
import { contentHash } from "../sync/index.js";
import { SEED_QUESTIONS } from "../seed.js";

export const questionRouter = router({
  list: authedProcedure.input(questionListFilterSchema).query(async ({ input, ctx }) => {
    const conditions = [eq(questions.userId, ctx.userId), eq(questions.stale, 0)];
    if (input.category) conditions.push(eq(questions.category, input.category));
    if (input.difficulty) conditions.push(eq(questions.difficulty, input.difficulty));
    if (input.search) conditions.push(like(questions.title, `%${input.search}%`));
    const where = and(...conditions);

    const [items, total] = await Promise.all([
      db
        .select()
        .from(questions)
        .where(where)
        .orderBy(desc(questions.updatedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ count: sql<number>`count(*)` }).from(questions).where(where),
    ]);
    return { items, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
  }),

  stats: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ category: questions.category, count: sql<number>`count(*)` })
      .from(questions)
      .where(and(eq(questions.userId, ctx.userId), eq(questions.stale, 0)))
      .groupBy(questions.category);
    const byCategory: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    for (const r of rows) byCategory[r.category] = Number(r.count);
    return { byCategory, total: Object.values(byCategory).reduce((a, b) => a + b, 0) };
  }),

  /** ai-infra-notes 的考察范围（Dashboard 开始面试用）：按周/天（daily）与按专题（topics）。
   *  同时统计规则同步（ai-infra-notes:）与 LLM 题库（bank:ai-infra-notes:）两种 sourceKey。 */
  scopes: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ sourceKey: questions.sourceKey })
      .from(questions)
      .where(
        and(
          eq(questions.userId, ctx.userId),
          eq(questions.stale, 0),
          like(questions.sourceKey, "%ai-infra-notes:aiinfra/%"),
        ),
      );
    const topics = new Map<string, number>();
    const weeks = new Map<string, number>();
    const days = new Map<string, number>();
    for (const { sourceKey } of rows) {
      const m = /^(?:bank:)?ai-infra-notes:aiinfra\/(topics|daily)\/([^/]+)\//.exec(sourceKey);
      if (!m) continue;
      const map = m[1] === "topics" ? topics : weeks;
      map.set(m[2], (map.get(m[2]) ?? 0) + 1);
      const d = /^(?:bank:)?ai-infra-notes:aiinfra\/daily\/(week\d+)\/(day\d+)\//.exec(sourceKey);
      if (d) days.set(`${d[1]}/${d[2]}`, (days.get(`${d[1]}/${d[2]}`) ?? 0) + 1);
    }
    const toList = (map: Map<string, number>, prefix: string) =>
      [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([name, count]) => ({ name, count, scope: `ai-infra-notes:aiinfra/${prefix}/${name}/` }));
    const dayList = [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([key, count]) => {
        const [week, day] = key.split("/");
        return { week, day, count, scope: `ai-infra-notes:aiinfra/daily/${week}/${day}/` };
      });
    return { topics: toList(topics, "topics"), weeks: toList(weeks, "daily"), days: dayList };
  }),

  create: authedProcedure.input(questionInputSchema).mutation(async ({ input, ctx }) => {
    const inserted = await db
      .insert(questions)
      .values({ ...input, userId: ctx.userId, sourceKey: `manual:${crypto.randomUUID()}` })
      .$returningId();
    return { id: inserted[0].id };
  }),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: questionInputSchema.partial() }))
    .mutation(async ({ input, ctx }) => {
      const result = await db
        .update(questions)
        .set(input.data)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.userId)));
      if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  remove: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await db
        .delete(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.userId)));
      if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  bulkImport: authedProcedure
    .input(z.object({ items: z.array(questionInputSchema).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.insert(questions).values(
        input.items.map((item) => ({
          ...item,
          userId: ctx.userId,
          sourceKey: `manual:${crypto.randomUUID()}`,
        })),
      );
      return { imported: input.items.length };
    }),

  /** 播种内置题库（幂等，README §7.5） */
  seed: authedProcedure.mutation(async ({ ctx }) => {
    const existing = await db
      .select({ sourceKey: questions.sourceKey })
      .from(questions)
      .where(eq(questions.userId, ctx.userId));
    const existingKeys = new Set(existing.map((r) => r.sourceKey));
    const toInsert = SEED_QUESTIONS.filter((q) => !existingKeys.has(`seed:${q.title}`));
    if (toInsert.length > 0) {
      await db.insert(questions).values(
        toInsert.map((q) => ({ ...q, userId: ctx.userId, sourceKey: `seed:${q.title}` })),
      );
    }
    return { seeded: toInsert.length, skipped: SEED_QUESTIONS.length - toInsert.length };
  }),

  /**
   * LLM 题库导入（cli bank:import 调用，dev/server.md §7 sourceKey+contentHash 幂等）：
   * 未变跳过、变了更新、源里消失标 stale（不物理删除，保护历史场次快照）；
   * 落库后把同源规则解析题标记 stale（LLM 版替代规则版）。
   */
  bankImport: authedProcedure.input(bankImportSchema).mutation(async ({ input, ctx }) => {
    const { items, bankSourceKeyPrefix, replaceSourceKeyPrefix } = input;
    const STALE_PREFIX = "[已失效] ";
    const INSERT_CHUNK = 100;

    const existing = await db
      .select()
      .from(questions)
      .where(
        and(eq(questions.userId, ctx.userId), like(questions.sourceKey, `${bankSourceKeyPrefix}%`)),
      );
    const bySourceKey = new Map(existing.map((row) => [row.sourceKey, row]));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const toInsert: Array<typeof questions.$inferInsert> = [];
    const seenKeys = new Set<string>();

    for (const q of items) {
      seenKeys.add(q.sourceKey);
      const hash = contentHash(q);
      const row = bySourceKey.get(q.sourceKey);
      if (row && row.contentHash === hash && row.stale === 0) {
        unchanged += 1;
        continue;
      }
      if (row) {
        await db
          .update(questions)
          .set({
            category: q.category,
            title: q.title,
            content: q.content,
            difficulty: q.difficulty,
            tags: q.tags,
            followUps: q.followUps,
            keyPoints: q.keyPoints,
            source: row.source.startsWith(STALE_PREFIX) ? row.source.slice(STALE_PREFIX.length) : q.source,
            contentHash: hash,
            stale: 0,
          })
          .where(and(eq(questions.id, row.id), eq(questions.userId, ctx.userId)));
        updated += 1;
      } else {
        toInsert.push({ ...q, userId: ctx.userId, contentHash: hash });
      }
    }
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      await db.insert(questions).values(toInsert.slice(i, i + INSERT_CHUNK));
    }
    inserted = toInsert.length;

    // 题库文件中已删除的条目 → stale
    let bankStale = 0;
    for (const row of existing) {
      if (seenKeys.has(row.sourceKey) || row.stale === 1) continue;
      await db
        .update(questions)
        .set({
          stale: 1,
          source: row.source.startsWith(STALE_PREFIX) ? row.source : `${STALE_PREFIX}${row.source}`,
        })
        .where(and(eq(questions.id, row.id), eq(questions.userId, ctx.userId)));
      bankStale += 1;
    }

    // 替代语义：同源规则解析题全部标记 stale
    let replacedStale = 0;
    if (replaceSourceKeyPrefix) {
      const ruleRows = await db
        .select({ id: questions.id, source: questions.source })
        .from(questions)
        .where(
          and(
            eq(questions.userId, ctx.userId),
            like(questions.sourceKey, `${replaceSourceKeyPrefix}%`),
            eq(questions.stale, 0),
          ),
        );
      for (const row of ruleRows) {
        await db
          .update(questions)
          .set({
            stale: 1,
            source: row.source.startsWith(STALE_PREFIX) ? row.source : `${STALE_PREFIX}${row.source}`,
          })
          .where(and(eq(questions.id, row.id), eq(questions.userId, ctx.userId)));
      }
      replacedStale = ruleRows.length;
    }

    return { inserted, updated, unchanged, bankStale, replacedStale };
  }),
});
