// judge-extract.ts —— 判题数据提取（构建期）：从题解 md 解析示例用例与参考签名，
// 产出 problems.testcases 与 problems.judge_meta（judge 数据源切换，2026-09-10 第六批）。
// 解析函数全部复用 @ailab/judge-core（单一事实源）：构建期入库与运行期 harness
// 生成使用同一套解析器，杜绝两端规则漂移（入库用例与运行期期望不一致的静默故障）。
import {
  extractReferenceCode,
  parseCppSignature,
  parsePythonSignature,
  parseExamples,
} from "@ailab/judge-core";
import type { ProblemJudgeMeta, ProblemTestcase } from "@ailab/contracts";

export interface JudgeExtract {
  testcases: ProblemTestcase[];
  judgeMeta: ProblemJudgeMeta | null;
}

/** 从题解 md 提取判题数据：示例用例 + 参考签名元数据（无任何参考签名时 meta 为 null） */
export function extractJudgeData(md: string): JudgeExtract {
  const cppReference = extractReferenceCode(md, "cpp");
  const pyReference = extractReferenceCode(md, "python");
  const cppSpec = cppReference ? parseCppSignature(cppReference) : null;
  const pyName = pyReference ? (parsePythonSignature(pyReference)?.name ?? null) : null;

  let judgeMeta: ProblemJudgeMeta | null = null;
  if (cppSpec || pyName) {
    judgeMeta = {
      methodName: cppSpec?.name ?? pyName!,
      cppAvailable: cppSpec != null,
      // DB 只存 {name, type}（contracts ProblemJudgeMeta）；raw 由运行期从 type+name 重建
      cppParams: cppSpec ? cppSpec.params.map(({ name, type }) => ({ name, type })) : [],
      cppReturnType: cppSpec?.returnType ?? "",
      pythonAvailable: pyName != null,
    };
  }
  return {
    // judge-core 的 ExampleCase 多保留原始输入文本（界面展示用），入库只取判题必需字段
    testcases: parseExamples(md).map(({ args, expected }) => ({ args, expected })),
    judgeMeta,
  };
}

/**
 * judge_type 推导（构建期能力判定，frontmatter 的 internal/none 被实际解析能力覆盖；
 * leetgpu-com 等显式外站评测保留）：有示例用例且有参考签名 → internal，否则 none。
 */
export function deriveJudgeType(
  frontmatterJudge: string,
  { testcases, judgeMeta }: JudgeExtract,
): "internal" | "leetgpu-com" | "none" {
  if (frontmatterJudge === "leetgpu-com") return "leetgpu-com";
  return testcases.length > 0 && judgeMeta != null ? "internal" : "none";
}
