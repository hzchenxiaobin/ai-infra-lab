// verdict.ts —— 评测结果结构与终态映射（dev/judge-worker.md §6）。
// server（in-process worker）与 judge-worker（Docker 沙箱）共用，
// 保证两端对同一份用例明细产出一致的提交终态。

export interface CaseResult {
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
  /** 运行错误（超时/运行时错误），通过时为 null */
  error: string | null;
}

export interface JudgeRunResult {
  status: "ok" | "compile_error" | "no_cases";
  compileError?: string;
  cases: CaseResult[];
  passed: number;
  total: number;
}

/** 提交终态（对齐 contracts SubmissionStatus 的终态子集，judge-core 保持零依赖） */
export type TerminalStatus = "ac" | "wa" | "ce" | "tle" | "mle" | "ie";

/** JudgeRunResult → 提交终态 */
export function terminalStatus(result: JudgeRunResult): TerminalStatus {
  if (result.status === "compile_error") return "ce";
  if (result.status === "no_cases") return "ie";
  if (result.passed === result.total) return "ac";
  if (result.cases.some((c) => c.error != null && c.error.includes("超时"))) return "tle";
  return "wa";
}
