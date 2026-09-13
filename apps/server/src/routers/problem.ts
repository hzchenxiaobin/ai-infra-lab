import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";
import {
  contestSessionParamSchema,
  problemFacetsSchema,
  problemFilterSchema,
  problemListSlugParamSchema,
  unifiedIdParamSchema,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { contents, problemLists, problems, questions, userProgress } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

function jsonContains(column: SQL | unknown, value: string): SQL {
  return sql`JSON_CONTAINS(${column as SQL}, JSON_QUOTE(${value}))`;
}

/** 面试题库（共享 questions，category=leetcode）对应的题目统一 ID：从 source "LeetCode N" 解析为 lc:NNNN。
 *  按 id 而非 number 过滤：lc:lcof:N（剑指 Offer）与 lc:NNNN 会撞 number，但 id 不撞。 */
async function interviewProblemIds(): Promise<string[]> {
  const rows = await db
    .select({ source: questions.source })
    .from(questions)
    .where(
      and(
        isNull(questions.userId),
        eq(questions.category, "leetcode"),
        eq(questions.stale, 0),
      ),
    );
  const ids = new Set<string>();
  for (const { source } of rows) {
    const m = /^LeetCode (\d+)$/.exec(source);
    if (m) ids.add(`lc:${m[1].padStart(4, "0")}`);
  }
  return [...ids];
}

/** interview 过滤条件：只保留面试题库子集；题库为空时返回永假条件（inArray 不接受空数组） */
async function interviewCondition(): Promise<SQL> {
  const ids = await interviewProblemIds();
  return ids.length > 0 ? inArray(problems.id, ids) : sql`1 = 0`;
}

/**
 * GPU 面试选题（leetcode 分区的 interview 过滤走 questions 表动态推导；
 * GPU 没有对应的面试题↔题目映射列，这里静态维护，来源：
 * packages/content/problems-gpu/cuda-interview-notes.md §五 LeetGPU 对照表的高频+中频题，共 34 题）
 */
const GPU_INTERVIEW_IDS = [
  // 高频：Softmax / online softmax / Reduce / LayerNorm / RMSNorm
  "gpu:m:005", "gpu:m:006", "gpu:m:004", "gpu:m:115", "gpu:m:040", "gpu:m:105", "gpu:m:050", "gpu:m:116",
  // 中频：SGEMM（含量化路径）
  "gpu:e:002", "gpu:m:022", "gpu:m:030", "gpu:m:057", "gpu:m:032", "gpu:m:081",
  // 中频：transpose / GEMV
  "gpu:e:003", "gpu:m:114", "gpu:m:017", "gpu:m:018", "gpu:m:075",
  // 中频：attention 各变体
  "gpu:h:109", "gpu:h:053", "gpu:h:012", "gpu:h:026", "gpu:m:080", "gpu:h:059", "gpu:h:056", "gpu:m:112", "gpu:m:111",
  // 中频：scan / top-k / histogram
  "gpu:m:016", "gpu:m:070", "gpu:m:029", "gpu:m:060", "gpu:m:067", "gpu:m:013",
];

/** interview 过滤分发：leetcode → 面试题库动态推导；leetgpu → 静态选题集 */
async function interviewFilter(source?: string): Promise<SQL> {
  if (source === "leetgpu") return inArray(problems.id, GPU_INTERVIEW_IDS);
  return interviewCondition();
}

/** 按统一 ID 列表取题目（保持传入顺序，联 contents + user_progress） */
async function problemRowsByIds(ids: string[], userId: number) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: problems.id,
      source: problems.source,
      number: problems.number,
      difficulty: problems.difficulty,
      languages: problems.languages,
      judgeType: problems.judgeType,
      externalUrl: problems.externalUrl,
      title: contents.title,
      url: contents.url,
      tags: contents.tags,
      knowledgePoints: contents.knowledgePoints,
      progressStatus: userProgress.status,
      note: userProgress.note,
    })
    .from(problems)
    .innerJoin(contents, eq(problems.id, contents.id))
    .leftJoin(
      userProgress,
      and(eq(userProgress.contentId, problems.id), eq(userProgress.userId, userId)),
    )
    .where(and(inArray(problems.id, ids), eq(contents.status, "active")));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return []; // 成员无对应 active 行（未同步/已 stale）时跳过
    return [{ ...r, progressStatus: r.progressStatus ?? ("unseen" as const), ac: r.progressStatus === "ac" }];
  });
}

export const problemRouter = router({
  /** 题目列表：难度 / 来源 / 评测方式 / 标签 / 知识点筛选，并联 user_progress 标记是否已 AC；
   *  interview=true 时限制在面试题库（questions 表 leetcode 共享题）对应的题号子集内 */
  list: authedProcedure.input(problemFilterSchema).query(async ({ input, ctx }) => {
    const conditions: SQL[] = [eq(contents.status, "active")];
    if (input.difficulty) conditions.push(eq(problems.difficulty, input.difficulty));
    if (input.source) conditions.push(eq(problems.source, input.source));
    if (input.judgeType) conditions.push(eq(problems.judgeType, input.judgeType));
    if (input.tag) conditions.push(jsonContains(contents.tags, input.tag));
    if (input.knowledgePoint) conditions.push(jsonContains(contents.knowledgePoints, input.knowledgePoint));
    if (input.search) conditions.push(like(contents.title, `%${input.search}%`));
    if (input.interview) conditions.push(await interviewFilter(input.source));
    const where = and(...conditions);

    const rows = await db
      .select({
        id: problems.id,
        source: problems.source,
        number: problems.number,
        difficulty: problems.difficulty,
        languages: problems.languages,
        judgeType: problems.judgeType,
        externalUrl: problems.externalUrl,
        title: contents.title,
        url: contents.url,
        tags: contents.tags,
        knowledgePoints: contents.knowledgePoints,
        progressStatus: userProgress.status,
        note: userProgress.note,
      })
      .from(problems)
      .innerJoin(contents, eq(problems.id, contents.id))
      .leftJoin(
        userProgress,
        and(eq(userProgress.contentId, problems.id), eq(userProgress.userId, ctx.userId)),
      )
      .where(where)
      .orderBy(asc(problems.source), asc(problems.number));

    let items = rows.map((r) => ({
      ...r,
      progressStatus: r.progressStatus ?? ("unseen" as const),
      ac: r.progressStatus === "ac",
    }));
    if (input.solved != null) items = items.filter((i) => i.ac === input.solved);
    if (input.progress) items = items.filter((i) => i.progressStatus === input.progress);

    const total = items.length;
    const start = (input.page - 1) * input.pageSize;
    return { items: items.slice(start, start + input.pageSize), total, page: input.page, pageSize: input.pageSize };
  }),

  /** 题目详情：元数据 + 评测字段 + 当前用户进度 */
  get: authedProcedure
    .input(unifiedIdParamSchema)
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select({
          problem: problems,
          content: contents,
          progressStatus: userProgress.status,
          progressScore: userProgress.score,
        })
        .from(problems)
        .innerJoin(contents, eq(problems.id, contents.id))
        .leftJoin(
          userProgress,
          and(eq(userProgress.contentId, problems.id), eq(userProgress.userId, ctx.userId)),
        )
        .where(eq(problems.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "题目不存在" });
      const { problem, content, progressStatus, progressScore } = rows[0];
      return {
        problem,
        content,
        progress: { status: progressStatus ?? ("unseen" as const), score: progressScore },
      };
    }),

  /** 筛选候选项：题库（可按分区）出现过的标签与知识点及计数，供下拉筛选；interview=true 时只统计面试题库子集 */
  facets: authedProcedure.input(problemFacetsSchema).query(async ({ input }) => {
    const conditions: SQL[] = [eq(contents.status, "active")];
    if (input.source) conditions.push(eq(problems.source, input.source));
    if (input.interview) conditions.push(await interviewFilter(input.source));
    const rows = await db
      .select({ tags: contents.tags, knowledgePoints: contents.knowledgePoints })
      .from(problems)
      .innerJoin(contents, eq(problems.id, contents.id))
      .where(and(...conditions));

    const tagCounts = new Map<string, number>();
    const kpCounts = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      for (const k of r.knowledgePoints) kpCounts.set(k, (kpCounts.get(k) ?? 0) + 1);
    }
    const toList = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-Hans"));
    return { tags: toList(tagCounts), knowledgePoints: toList(kpCounts) };
  }),

  /** 题单索引（/problems/lists 入口卡片） */
  lists: authedProcedure.query(async () => {
    const rows = await db.select().from(problemLists);
    return rows
      .map((r) => {
        const slug = r.id.split(":")[2] ?? "";
        return { id: r.id, slug, title: r.title, url: r.url, problemCount: r.problemIds.length };
      })
      .filter((r) => r.slug !== "")
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }),

  /** 题单详情：成员题目（保持题单顺序）+ AC 状态 */
  getList: authedProcedure
    .input(problemListSlugParamSchema)
    .query(async ({ input, ctx }) => {
      const id = `lc:list:${input.slug}`;
      const rows = await db.select().from(problemLists).where(eq(problemLists.id, id)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "题单不存在" });
      const list = rows[0];
      const items = await problemRowsByIds(list.problemIds, ctx.userId);
      return {
        list: {
          id: list.id,
          slug: input.slug,
          title: list.title,
          url: list.url,
          problemCount: list.problemIds.length,
        },
        items,
      };
    }),

  /** 周赛场次列表（lc:contest:{场次}q{n} 按场次聚合，新→旧） */
  contestSessions: authedProcedure.query(async () => {
    const rows = await db
      .select({ id: problems.id })
      .from(problems)
      .innerJoin(contents, eq(problems.id, contents.id))
      .where(and(eq(problems.source, "contest"), eq(contents.status, "active")));
    const bySession = new Map<number, number>();
    for (const r of rows) {
      const m = /^lc:contest:(\d+)q\d+$/.exec(r.id);
      if (!m) continue;
      bySession.set(+m[1], (bySession.get(+m[1]) ?? 0) + 1);
    }
    return [...bySession.entries()]
      .map(([session, problemCount]) => ({ session, problemCount }))
      .sort((a, b) => b.session - a.session);
  }),

  /** 单场周赛题目（按 Q1..Qn 顺序）+ AC 状态 */
  contestProblems: authedProcedure
    .input(contestSessionParamSchema)
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select({ id: problems.id })
        .from(problems)
        .where(and(eq(problems.source, "contest"), like(problems.id, `lc:contest:${input.session}q%`)));
      const ordered = rows
        .map((r) => ({ id: r.id, q: Number(/^lc:contest:\d+q(\d+)$/.exec(r.id)?.[1] ?? 0) }))
        .sort((a, b) => a.q - b.q)
        .map((r) => r.id);
      return { session: input.session, items: await problemRowsByIds(ordered, ctx.userId) };
    }),
});
