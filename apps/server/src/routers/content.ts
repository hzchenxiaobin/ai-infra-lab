import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, like, sql, type SQL } from "drizzle-orm";
import {
  contentFilterSchema,
  contentImportSchema,
  unifiedIdParamSchema,
  type ContentImportInput,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { contents, problemLists, problems } from "../db/schema.js";
import { adminProcedure, authedProcedure, router } from "../trpc.js";

/** tag / knowledgePoint 筛选：MySQL JSON 数组包含判断 */
function jsonContains(column: SQL | unknown, value: string): SQL {
  return sql`JSON_CONTAINS(${column as SQL}, JSON_QUOTE(${value}))`;
}

export const contentRouter = router({
  /** 内容元数据列表：按 type / 分区（ID 前缀）/ tag / 知识点 / 关键词筛选，分页 */
  list: authedProcedure.input(contentFilterSchema).query(async ({ input }) => {
    const conditions: SQL[] = [eq(contents.status, input.status)];
    if (input.type) conditions.push(eq(contents.type, input.type));
    if (input.partition) conditions.push(like(contents.id, `${input.partition}:%`));
    if (input.tag) conditions.push(jsonContains(contents.tags, input.tag));
    if (input.knowledgePoint) conditions.push(jsonContains(contents.knowledgePoints, input.knowledgePoint));
    if (input.search) conditions.push(like(contents.title, `%${input.search}%`));
    const where = and(...conditions);

    const [items, total] = await Promise.all([
      db
        .select()
        .from(contents)
        .where(where)
        .orderBy(desc(contents.updatedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ count: sql<number>`count(*)` }).from(contents).where(where),
    ]);
    return { items, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
  }),

  get: authedProcedure
    .input(unifiedIdParamSchema)
    .query(async ({ input }) => {
      const rows = await db.select().from(contents).where(eq(contents.id, input.id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "内容不存在" });
      return { content: rows[0] };
    }),

  /**
   * content-kit 产出（contents.json / problems.json）幂等入库（admin，CLI 经 createCaller 调用）。
   * 幂等键为统一 ID，contentHash 判变更：未变跳过、变了更新、源里消失标 stale（不物理删除）。
   */
  import: adminProcedure.input(contentImportSchema).mutation(async ({ input }) => {
    return importContents(input);
  }),
});

export async function importContents(input: ContentImportInput) {
  const stats = { inserted: 0, updated: 0, unchanged: 0, stale: 0, problemsUpserted: 0, listsUpserted: 0 };

  // 全量读出已有行建 Map<id, row>（沿用 import-aiinfra-bank 模式）
  const existing = new Map(
    (await db.select().from(contents)).map((r) => [r.id, r] as const),
  );
  const seen = new Set<string>();

  for (const item of input.contents) {
    seen.add(item.id);
    const row = existing.get(item.id);
    if (!row) {
      await db.insert(contents).values({ ...item, status: "active" });
      stats.inserted += 1;
    } else if (row.contentHash !== item.contentHash || row.status !== "active") {
      await db
        .update(contents)
        .set({
          type: item.type,
          title: item.title,
          tags: item.tags,
          knowledgePoints: item.knowledgePoints,
          url: item.url,
          contentHash: item.contentHash,
          status: "active",
        })
        .where(eq(contents.id, item.id));
      stats.updated += 1;
    } else {
      stats.unchanged += 1;
    }
  }

  // 源里消失的标 stale（仅当本次导入非空时执行，避免空调用误标全表）
  if (input.contents.length > 0) {
    const staleIds = [...existing.keys()].filter((id) => !seen.has(id));
    for (const batch of chunk(staleIds, 100)) {
      const result = await db
        .update(contents)
        .set({ status: "stale" })
        .where(and(inArray(contents.id, batch), eq(contents.status, "active")));
      stats.stale += result[0].affectedRows;
    }
  }

  // problems 子集：随内容 upsert（problem 的 hash 变化由 contents 行承载）
  const validIds = new Set(input.contents.map((c) => c.id));
  for (const p of input.problems) {
    if (!validIds.has(p.id)) continue; // 无对应 contents 行的 problem 跳过（frontmatter 不对称属数据错误）
    await db
      .insert(problems)
      .values(p)
      .onDuplicateKeyUpdate({
        set: {
          source: p.source,
          number: p.number,
          difficulty: p.difficulty,
          languages: p.languages,
          judgeType: p.judgeType,
          testcases: p.testcases,
          judgeMeta: p.judgeMeta,
          externalUrl: p.externalUrl,
        },
      });
    stats.problemsUpserted += 1;
  }

  // 题单：随内容 upsert（成员为统一 ID 有序数组；题单源里消失不标 stale，
  // 留旧行无害——题单页只是导航视图，无历史场次依赖）
  for (const l of input.lists) {
    await db
      .insert(problemLists)
      .values(l)
      .onDuplicateKeyUpdate({
        set: { title: l.title, url: l.url, problemIds: l.problemIds, contentHash: l.contentHash },
      });
    stats.listsUpserted += 1;
  }

  return stats;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
