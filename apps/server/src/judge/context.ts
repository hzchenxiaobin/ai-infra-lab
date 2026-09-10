import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { ProblemJudgeMeta, ProblemTestcase } from "@ailab/contracts";
import {
  unsupportedReason,
  type ExampleCase,
  type MethodSpec,
} from "@ailab/judge-core";
import { db } from "../db/client.js";
import { contents, problems } from "../db/schema.js";

// ---------------------------------------------------------------------------
// 判题上下文装配（judge 数据源切换，2026-09-10 第六批）：
// problems ⋈ contents（统一 ID 主键）——testcases 与参考签名均由 content-kit
// 构建期解析入库（problems.testcases / problems.judge_meta），不再读本地
// leetcode 仓库。judge router（getProblem/submit 校验）与 worker（执行）共用。
// ---------------------------------------------------------------------------

export type ProblemRow = typeof problems.$inferSelect;

export interface ProblemJudgeContext {
  problem: ProblemRow;
  /** contents 联表行（title/url：题面与完整题解在 docs 站） */
  title: string;
  url: string;
  testcases: ProblemTestcase[];
  /** 由 testcases 派生的评测用例（input 为展示文本，args/expected 同 testcases） */
  examples: ExampleCase[];
  meta: ProblemJudgeMeta;
  cppSpec: MethodSpec | null;
  /** C++ 类型不支持的检查结果（cppSpec 存在时非空）；null = 无问题。
   *  Python harness 无类型转换，仅当 C++ 签名存在且类型不支持时同样受限 */
  cppUnsupported: string | null;
  pythonAvailable: boolean;
}

export async function loadProblemJudgeContext(problemId: string): Promise<ProblemJudgeContext> {
  const rows = await db
    .select({
      problem: problems,
      title: contents.title,
      url: contents.url,
    })
    .from(problems)
    .innerJoin(contents, eq(problems.id, contents.id))
    .where(and(eq(problems.id, problemId), eq(contents.status, "active")))
    .limit(1);
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "题目不存在" });
  const { problem } = row;
  if (problem.judgeType === "leetgpu-com") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "GPU 题不支持站内评测，请前往 leetgpu.com 提交",
    });
  }
  if (problem.judgeType !== "internal" || !problem.judgeMeta) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "该题不支持站内评测（无示例用例或参考签名）" });
  }

  const meta = problem.judgeMeta;
  const cppSpec: MethodSpec | null = meta.cppAvailable
    ? {
        name: meta.methodName,
        params: meta.cppParams.map((p) => ({ ...p, raw: `${p.type} ${p.name}` })),
        returnType: meta.cppReturnType,
      }
    : null;
  return {
    problem,
    title: row.title,
    url: row.url,
    testcases: problem.testcases,
    examples: problem.testcases.map((t) => ({
      input: t.args.map((a) => `${a.name} = ${a.value}`).join(", "),
      args: t.args,
      expected: t.expected,
    })),
    meta,
    cppSpec,
    cppUnsupported: cppSpec ? unsupportedReason(cppSpec) : null,
    pythonAvailable: meta.pythonAvailable,
  };
}

export function cppStarter(spec: MethodSpec): string {
  const params = spec.params.map((p) => p.raw).join(", ");
  return [
    "class Solution {",
    "public:",
    `    ${spec.returnType} ${spec.name}(${params}) {`,
    "        // TODO: 在这里实现",
    "    ",
    "    }",
    "};",
    "",
  ].join("\n");
}

/** Python starter：参数名与 C++ 签名一致（leetgpu/leetcode 题解双语言同签名） */
export function pyStarter(meta: ProblemJudgeMeta): string {
  const params = ["self", ...meta.cppParams.map((p) => p.name)].join(", ");
  return ["class Solution:", `    def ${meta.methodName}(${params}):`, "        pass", ""].join("\n");
}
