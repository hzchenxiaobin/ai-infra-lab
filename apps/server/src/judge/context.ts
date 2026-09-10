import { readFile } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { questions } from "../db/schema.js";
import { env } from "../env.js";
import {
  extractReferenceCode,
  parseCppSignature,
  parseExamples,
  parsePythonSignature,
  type MethodSpec,
} from "./parse.js";

// ---------------------------------------------------------------------------
// 判题上下文装配：题目行 + 题面示例用例 + 各语言参考代码/签名。
// judge router（getProblem/submit 校验）与 judge worker（执行）共用。
// 数据源切换（problems.testcases 入库）后此模块整体退役（backlog P0）。
// ---------------------------------------------------------------------------

export type QuestionRow = typeof questions.$inferSelect;

export interface JudgeContext {
  question: QuestionRow;
  examples: ReturnType<typeof parseExamples>;
  cppSpec: MethodSpec | null;
  cppReference: string | null;
  pySpec: Omit<MethodSpec, "returnType"> | null;
  pyReference: string | null;
}

export async function loadJudgeContext(questionId: number, userId: number): Promise<JudgeContext> {
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.userId, userId)))
    .limit(1);
  const question = rows[0];
  if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "题目不存在" });
  if (question.category !== "leetcode" || !question.sourceKey.startsWith("leetcode:")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "仅 leetcode 方向的同步题支持在线评测" });
  }
  const rel = question.sourceKey.slice("leetcode:".length);
  const md = await readFile(path.join(env.LEETCODE_REPO_DIR, rel), "utf8").catch(() => null);
  if (!md) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `本地仓库缺少题解文件 ${rel}（LEETCODE_REPO_DIR=${env.LEETCODE_REPO_DIR}）`,
    });
  }
  const cppReference = extractReferenceCode(md, "cpp");
  const pyReference = extractReferenceCode(md, "python");
  return {
    question,
    examples: parseExamples(question.content),
    cppSpec: cppReference ? parseCppSignature(cppReference) : null,
    cppReference,
    pySpec: pyReference ? parsePythonSignature(pyReference) : null,
    pyReference,
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

export function pyStarter(spec: Omit<MethodSpec, "returnType">): string {
  const params = ["self", ...spec.params.map((p) => p.name)].join(", ");
  return ["class Solution:", `    def ${spec.name}(${params}):`, "        pass", ""].join("\n");
}
