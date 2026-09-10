import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import {
  judgeProblemParamSchema,
  judgeRunSchema,
  submissionIdParamSchema,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { contents, submissions, userProgress } from "../db/schema.js";
import { cppStarter, loadProblemJudgeContext, pyStarter } from "../judge/context.js";
import { quotaFor } from "../middleware/quota.js";
import { authedProcedure, router } from "../trpc.js";

export const judgeRouter = router({
  /** 评测题目详情：元数据 + 示例用例 + 各语言 starter（题面与完整题解在 docs 站，见 url） */
  getProblem: authedProcedure
    .input(judgeProblemParamSchema)
    .query(async ({ input }) => {
      const ctx = await loadProblemJudgeContext(input.problemId);
      // Python harness 只需方法名，类型转换由 json 运行时处理；
      // 仅当 C++ 签名存在且类型不支持时 Python 同样受限（原同步评测路径语义）
      const cppReason = ctx.cppSpec == null ? "题解中未找到 C++ 参考代码或签名" : ctx.cppUnsupported;
      const pyReason = ctx.pythonAvailable
        ? ctx.cppUnsupported
        : "题解中未找到 Python 参考代码或签名";
      return {
        problem: {
          id: ctx.problem.id,
          title: ctx.title,
          difficulty: ctx.problem.difficulty,
          source: ctx.problem.source,
          number: ctx.problem.number,
          url: ctx.url,
          externalUrl: ctx.problem.externalUrl,
        },
        examples: ctx.examples,
        cpp: {
          available: ctx.cppSpec != null && ctx.cppUnsupported == null,
          reason: cppReason,
          starter: ctx.cppSpec && ctx.cppUnsupported == null ? cppStarter(ctx.cppSpec) : null,
        },
        python: {
          available: ctx.pythonAvailable && pyReason == null,
          reason: pyReason,
          starter: ctx.pythonAvailable && pyReason == null ? pyStarter(ctx.meta) : null,
        },
      };
    }),

  /**
   * 提交代码进评测队列（dev/judge-worker.md §1：insert submissions status=pending，
   * worker 异步执行）。结果轮询 judge.getResult。
   * 入队前同步校验（快速失败，不产生队列垃圾）：站内评测题 + 有用例 + 语言签名可用。
   */
  submit: authedProcedure
    .use(quotaFor("judge"))
    .input(judgeRunSchema)
    .mutation(async ({ input, ctx }) => {
      const judgeCtx = await loadProblemJudgeContext(input.problemId);
      if (judgeCtx.examples.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该题未解析到示例用例，无法评测" });
      }
      if (input.language === "cpp") {
        if (judgeCtx.cppSpec == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "该题无 C++ 参考签名" });
        }
        if (judgeCtx.cppUnsupported) {
          throw new TRPCError({ code: "BAD_REQUEST", message: judgeCtx.cppUnsupported });
        }
      } else if (!judgeCtx.pythonAvailable) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该题无 Python 参考签名" });
      } else if (judgeCtx.cppUnsupported) {
        throw new TRPCError({ code: "BAD_REQUEST", message: judgeCtx.cppUnsupported });
      }

      const inserted = await db
        .insert(submissions)
        .values({
          userId: ctx.userId,
          problemId: input.problemId,
          language: input.language,
          code: input.code,
          status: "pending",
        })
        .$returningId();
      return { submissionId: inserted[0].id };
    }),

  /**
   * 轮询评测结果（web 1–2s 间隔，终态 ac/wa/ce/tle/mle/ie 停止轮询）。
   * verdictDetail 为 JudgeVerdict（contracts）。
   * AC 联动 user_progress（dev/judge-worker.md §6：server 读到 ac 时顺手标记，
   * worker 不写用户进度表；mastered 不被降级；统一 ID 形态外的遗留 problemId 跳过）。
   */
  getResult: authedProcedure
    .input(submissionIdParamSchema)
    .query(async ({ input, ctx }) => {
      const rows = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, input.submissionId), eq(submissions.userId, ctx.userId)))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "评测记录不存在" });

      if (row.status === "ac" && isUnifiedId(row.problemId)) {
        const exists = await db
          .select({ id: contents.id })
          .from(contents)
          .where(eq(contents.id, row.problemId))
          .limit(1);
        if (exists.length > 0) {
          await db
            .insert(userProgress)
            .values({ userId: row.userId, contentId: row.problemId, status: "ac" })
            .onDuplicateKeyUpdate({
              set: {
                status: sql`IF(${userProgress.status} = 'mastered', ${userProgress.status}, 'ac')`,
              },
            });
        }
      }

      return {
        submissionId: row.id,
        status: row.status,
        language: row.language,
        verdictDetail: row.verdictDetail,
        runtimeMs: row.runtimeMs,
        createdAt: row.createdAt,
      };
    }),
});

/** 统一 ID 形态（lc:0001 / gpu:m:007）：区分数据源切换前的 question 自增 id 遗留行 */
function isUnifiedId(problemId: string): boolean {
  return /^[a-z]+:/.test(problemId);
}
