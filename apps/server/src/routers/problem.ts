import { TRPCError } from "@trpc/server";
import { and, asc, eq, like, sql, type SQL } from "drizzle-orm";
import { problemFilterSchema } from "@ailab/contracts";
import { z } from "zod";
import { db } from "../db/client.js";
import { contents, problems, userProgress } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

function jsonContains(column: SQL | unknown, value: string): SQL {
  return sql`JSON_CONTAINS(${column as SQL}, JSON_QUOTE(${value}))`;
}

export const problemRouter = router({
  /** 题目列表：难度 / 来源 / 评测方式 / 标签 / 知识点筛选，并联 user_progress 标记是否已 AC */
  list: authedProcedure.input(problemFilterSchema).query(async ({ input, ctx }) => {
    const conditions: SQL[] = [eq(contents.status, "active")];
    if (input.difficulty) conditions.push(eq(problems.difficulty, input.difficulty));
    if (input.source) conditions.push(eq(problems.source, input.source));
    if (input.judgeType) conditions.push(eq(problems.judgeType, input.judgeType));
    if (input.tag) conditions.push(jsonContains(contents.tags, input.tag));
    if (input.knowledgePoint) conditions.push(jsonContains(contents.knowledgePoints, input.knowledgePoint));
    if (input.search) conditions.push(like(contents.title, `%${input.search}%`));
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

    const total = items.length;
    const start = (input.page - 1) * input.pageSize;
    return { items: items.slice(start, start + input.pageSize), total, page: input.page, pageSize: input.pageSize };
  }),

  /** 题目详情：元数据 + 评测字段 + 当前用户进度 */
  get: authedProcedure
    .input(z.object({ id: z.string().min(1).max(128) }))
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
});
