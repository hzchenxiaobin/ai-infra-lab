import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  judgeRunSchema,
  questionIdParamSchema,
  submissionIdParamSchema,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { submissions } from "../db/schema.js";
import {
  cppStarter,
  loadJudgeContext,
  pyStarter,
} from "../judge/context.js";
import { unsupportedReason } from "../judge/parse.js";
import { quotaFor } from "../middleware/quota.js";
import { authedProcedure, router } from "../trpc.js";

export const judgeRouter = router({
  /** 评测题目详情：题面 + 示例用例 + 各语言 starter/参考代码 */
  getProblem: authedProcedure
    .input(questionIdParamSchema)
    .query(async ({ input, ctx }) => {
      const { question, examples, cppSpec, cppReference, pySpec, pyReference } =
        await loadJudgeContext(input.questionId, ctx.userId);
      const cppReason = cppSpec
        ? unsupportedReason(cppSpec)
        : "题解中未找到 C++ 参考代码或签名";
      // Python 签名不含类型注解解析，参数类型与 C++ 一致，复用其支持性判断
      const pyReason = pySpec == null ? "题解中未找到 Python 参考代码或签名" : cppReason;
      return {
        question: {
          id: question.id,
          title: question.title,
          difficulty: question.difficulty,
          content: question.content,
          source: question.source,
        },
        examples,
        cpp: {
          available: cppSpec != null && cppReason == null,
          reason: cppReason,
          starter: cppSpec ? cppStarter(cppSpec) : null,
          reference: cppReference,
        },
        python: {
          available: pySpec != null && pyReason == null,
          reason: pyReason,
          starter: pySpec ? pyStarter(pySpec) : null,
          reference: pyReference,
        },
      };
    }),

  /**
   * 提交代码进评测队列（dev/judge-worker.md §1：insert submissions status=pending，
   * worker 异步执行；原同步 exec 路径已下线）。结果轮询 judge.getResult。
   * 入队前同步校验（快速失败，不产生队列垃圾）：题面有示例用例 + 语言签名可用。
   */
  submit: authedProcedure
    .use(quotaFor("judge"))
    .input(judgeRunSchema)
    .mutation(async ({ input, ctx }) => {
      const { examples, cppSpec, pySpec } = await loadJudgeContext(input.questionId, ctx.userId);
      if (examples.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未从题面解析到示例用例，无法评测" });
      }
      if (input.language === "cpp") {
        if (!cppSpec) throw new TRPCError({ code: "BAD_REQUEST", message: "该题无 C++ 参考签名" });
        const reason = unsupportedReason(cppSpec);
        if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
      } else {
        if (!pySpec) throw new TRPCError({ code: "BAD_REQUEST", message: "该题无 Python 参考签名" });
        const reason = cppSpec ? unsupportedReason(cppSpec) : null;
        if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
      }

      const inserted = await db
        .insert(submissions)
        .values({
          userId: ctx.userId,
          // 数据源切换前存面试题库 question 自增 id（文本）；切换后为统一 ID
          problemId: String(input.questionId),
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
   * 注：AC 联动 user_progress 待 judge 数据源切到 problems（统一 ID）后补——
   * 现在判的是面试题库 question，无对应 contents 行可标记（dev/judge-worker.md §6）。
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
