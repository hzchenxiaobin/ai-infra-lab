// ---------------------------------------------------------------------------
// 评测结果卡片（JudgePage 与面试间内嵌评测器共用）：
// 排队/运行中 → spinner；ie/no_cases → 服务异常；compile_error → 编译输出；
// 其余 → 逐用例 输入/期望/实际/错误 明细。
// ---------------------------------------------------------------------------

import { isJudgeVerdict } from "../lib/judge";

export interface JudgeResultData {
  status: string;
  runtimeMs: number | null;
  verdictDetail: unknown;
}

export function JudgeResultView({ result }: { result: JudgeResultData }) {
  const { status, runtimeMs, verdictDetail } = result;
  const verdict = isJudgeVerdict(verdictDetail) ? verdictDetail : undefined;
  const internalError =
    verdictDetail != null && typeof verdictDetail === "object" && "error" in verdictDetail
      ? String((verdictDetail as { error: unknown }).error)
      : null;

  if (status === "pending" || status === "running") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-muted" />
        {status === "pending" ? "排队中…" : "评测运行中…"}
      </div>
    );
  }
  if (status === "ie" || verdict == null || verdict.status === "no_cases") {
    return (
      <div>
        <div className="text-sm font-medium text-accent-400">评测服务异常（{status}），请稍后重试。</div>
        {internalError && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-accent-600/30 bg-accent-600/10 p-3 font-mono text-xs text-accent-300">
            {internalError}
          </pre>
        )}
      </div>
    );
  }
  if (verdict.status === "compile_error") {
    return (
      <div>
        <div className="mb-2 text-sm font-medium text-accent-400">编译失败</div>
        <pre className="max-h-60 overflow-auto rounded-lg border border-accent-600/30 bg-accent-600/10 p-3 font-mono text-xs text-accent-300">
          {verdict.compileError}
        </pre>
      </div>
    );
  }
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between text-sm font-medium">
        {verdict.passed === verdict.total ? (
          <span className="text-ink">全部通过（{verdict.passed}/{verdict.total}）</span>
        ) : (
          <span className="text-accent-600">通过 {verdict.passed}/{verdict.total}</span>
        )}
        {runtimeMs != null && (
          <span className="text-xs font-normal text-muted">耗时 {runtimeMs} ms</span>
        )}
      </div>
      <div className="space-y-2">
        {verdict.cases.map((c, i) => (
          <div
            key={i}
            className={`rounded-lg border p-2 font-mono text-xs ${
              c.pass ? "border-line bg-page" : "border-accent-600/30 bg-accent-600/10"
            }`}
          >
            <div className={c.pass ? "text-ink" : "text-accent-300"}>
              用例 {i + 1}：{c.pass ? "通过" : "未通过"}
            </div>
            <div className="mt-1 text-muted">输入：{c.input}</div>
            <div className="text-muted">期望：{c.expected}</div>
            <div className="text-muted">实际：{c.actual || "（无输出）"}</div>
            {c.error && <div className="mt-1 whitespace-pre-wrap text-accent-400">{c.error}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
