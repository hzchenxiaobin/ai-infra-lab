import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type JudgeVerdict } from "@ailab/contracts";
import { trpc } from "../lib/trpc";
import { Markdown } from "../components/Markdown";
import { Card, DifficultyBadge } from "../components/ui";

type Language = "cpp" | "python";

const LANG_LABELS: Record<Language, string> = { cpp: "C++", python: "Python" };

/** 轮询间隔（dev/judge-worker.md §6：web 端 1–2s） */
const POLL_INTERVAL_MS = 1500;

function BackArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13.5 8h-10" />
      <path d="M7 4l-4 4 4 4" />
    </svg>
  );
}

export default function JudgePage() {
  const { id } = useParams();
  const questionId = Number(id);
  const problem = useQuery(trpc.judge.getProblem.queryOptions({ questionId }));

  const [language, setLanguage] = useState<Language>("cpp");
  const [code, setCode] = useState<Record<Language, string>>({ cpp: "", python: "" });
  const [showReference, setShowReference] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [submissionId, setSubmissionId] = useState<number | null>(null);

  // 提交进队列后轮询结果，终态（ac/wa/ce/tle/mle/ie）停止
  const result = useQuery(
    trpc.judge.getResult.queryOptions(
      { submissionId: submissionId ?? 0 },
      {
        enabled: submissionId != null,
        refetchInterval: (query) => {
          const status = query.state.data?.status;
          return status == null || status === "pending" || status === "running"
            ? POLL_INTERVAL_MS
            : false;
        },
      },
    ),
  );

  const submit = useMutation(
    trpc.judge.submit.mutationOptions({
      onSuccess: (data) => setSubmissionId(data.submissionId),
    }),
  );

  if (problem.isLoading) return <div className="py-20 text-center text-sm text-muted">加载中…</div>;
  if (problem.error) {
    return (
      <div className="py-20 text-center text-sm text-red-600">
        {problem.error.message}（<Link to="/bank" className="underline">返回题库</Link>）
      </div>
    );
  }
  const data = problem.data!;

  // 首次拿到 starter code 后填入编辑器
  if (!initialized) {
    setCode({ cpp: data.cpp.starter ?? "", python: data.python.starter ?? "" });
    if (!data.cpp.available && data.python.available) setLanguage("python");
    setInitialized(true);
  }

  const langState = data[language];
  const onSubmit = () => {
    setSubmissionId(null);
    submit.mutate({ questionId, language, code: code[language] });
  };
  const status = result.data?.status;
  const detail = result.data?.verdictDetail;
  const verdict: JudgeVerdict | undefined =
    detail != null && "cases" in detail ? (detail as unknown as JudgeVerdict) : undefined;
  const internalError =
    detail != null && "error" in detail ? String((detail as { error: unknown }).error) : null;
  const running = submit.isPending || status === "pending" || status === "running";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/bank"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors duration-150 hover:text-ink"
          >
            <BackArrowIcon className="size-3.5" />
            题库
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{data.question.title}</h1>
          <DifficultyBadge difficulty={data.question.difficulty} />
        </div>
        <span className="text-xs text-muted">{data.question.source} · 评测用例为题面示例（LeetCode 不公开完整测试集）</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左：题面 + 用例 */}
        <div className="space-y-4">
          <Card className="p-5">
            <Markdown text={data.question.content} />
          </Card>
          <Card className="p-5">
            <div className="mb-2 text-xs font-medium text-muted">示例用例（{data.examples.length}）</div>
            <div className="space-y-2">
              {data.examples.map((c, i) => (
                <div key={i} className="rounded-lg bg-page p-2 font-mono text-xs text-ink">
                  <div>输入：{c.input}</div>
                  <div>输出：{c.expected}</div>
                </div>
              ))}
              {data.examples.length === 0 && (
                <div className="text-xs text-muted">未从题面解析到示例用例，无法评测。</div>
              )}
            </div>
          </Card>
        </div>

        {/* 右：编辑器 + 结果 */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex gap-0.5 rounded-full bg-divider p-1">
                {(Object.keys(LANG_LABELS) as Language[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLanguage(l)}
                    disabled={!data[l].available}
                    className={`rounded-full px-3 py-1 text-xs transition-colors duration-150 ${
                      language === l
                        ? "bg-ink font-medium text-white"
                        : data[l].available
                          ? "text-muted hover:text-ink"
                          : "cursor-not-allowed text-faint"
                    }`}
                    title={data[l].available ? undefined : (data[l].reason ?? "")}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowReference((v) => !v)}
                className="text-xs text-muted transition-colors duration-150 hover:text-ink"
              >
                {showReference ? "隐藏参考代码" : "查看参考代码"}
              </button>
            </div>
            {!langState.available && (
              <div className="mb-2 rounded-lg border border-line bg-page px-3 py-2 text-xs text-muted">{langState.reason}</div>
            )}
            <textarea
              value={code[language]}
              onChange={(e) => setCode((prev) => ({ ...prev, [language]: e.target.value }))}
              spellCheck={false}
              className="h-80 w-full resize-y rounded-lg bg-ink p-3 font-mono text-xs leading-relaxed text-white/90 outline-none"
            />
            {showReference && langState.reference && (
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-page p-3 font-mono text-xs text-ink">
                {langState.reference}
              </pre>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onSubmit}
                disabled={running || !langState.available || data.examples.length === 0}
                className="rounded-full bg-accent-600 px-4 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-700 disabled:bg-accent-300"
              >
                {running ? "评测中…" : "提交评测"}
              </button>
              {running && <span className="text-xs text-muted">已入队，等待评测完成…</span>}
              {submit.error && <span className="text-xs text-red-600">{submit.error.message}</span>}
            </div>
          </Card>

          {result.data && (
            <Card className="p-5">
              {status === "pending" || status === "running" ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-muted" />
                  {status === "pending" ? "排队中…" : "评测运行中…"}
                </div>
              ) : status === "ie" || verdict == null || verdict.status === "no_cases" ? (
                <div>
                  <div className="text-sm font-medium text-red-600">评测服务异常（{status}），请稍后重试。</div>
                  {internalError && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-red-100 bg-red-50/60 p-3 font-mono text-xs text-red-700">
                      {internalError}
                    </pre>
                  )}
                </div>
              ) : verdict.status === "compile_error" ? (
                <div>
                  <div className="mb-2 text-sm font-medium text-red-600">编译失败</div>
                  <pre className="max-h-60 overflow-auto rounded-lg border border-red-100 bg-red-50/60 p-3 font-mono text-xs text-red-700">
                    {verdict.compileError}
                  </pre>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-baseline justify-between text-sm font-medium">
                    {verdict.passed === verdict.total ? (
                      <span className="text-ink">全部通过（{verdict.passed}/{verdict.total}）</span>
                    ) : (
                      <span className="text-accent-600">通过 {verdict.passed}/{verdict.total}</span>
                    )}
                    {result.data.runtimeMs != null && (
                      <span className="text-xs font-normal text-muted">耗时 {result.data.runtimeMs} ms</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {verdict.cases.map((c, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-2 font-mono text-xs ${
                          c.pass ? "border-line bg-page" : "border-red-100 bg-red-50/60"
                        }`}
                      >
                        <div className={c.pass ? "text-ink" : "text-red-700"}>
                          用例 {i + 1}：{c.pass ? "通过" : "未通过"}
                        </div>
                        <div className="mt-1 text-muted">输入：{c.input}</div>
                        <div className="text-muted">期望：{c.expected}</div>
                        <div className="text-muted">实际：{c.actual || "（无输出）"}</div>
                        {c.error && <div className="mt-1 whitespace-pre-wrap text-red-600">{c.error}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
