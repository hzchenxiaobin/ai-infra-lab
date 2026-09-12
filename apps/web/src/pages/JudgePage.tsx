import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { BackArrowIcon, Button, Card, DifficultyBadge, ErrorBox, Loading, PageHeader, SegmentedControl, buttonClass } from "../components/ui";
import { JudgeResultView } from "../components/JudgeResult";
import { POLL_INTERVAL_MS } from "../lib/judge";

type Language = "cpp" | "python";

const LANG_LABELS: Record<Language, string> = { cpp: "C++", python: "Python" };

export default function JudgePage() {
  const { id } = useParams();
  const problemId = id ?? "";
  // 兼容旧链接 /judge/:numericId（数据源切换前的 question 自增 id）——直接回题库
  const isLegacyNumeric = /^\d+$/.test(problemId);
  const problem = useQuery({
    ...trpc.judge.getProblem.queryOptions({ problemId }),
    enabled: !isLegacyNumeric && problemId !== "",
  });

  const [language, setLanguage] = useState<Language>("cpp");
  const [code, setCode] = useState<Record<Language, string>>({ cpp: "", python: "" });
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

  if (isLegacyNumeric) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        评测入口已升级为统一题目 ID，请从
        <Link to="/problems/algo" className="mx-1 text-accent-600 underline">题库</Link>
        或<Link to="/bank" className="mx-1 text-accent-600 underline">面试题库</Link>
        重新进入。
      </div>
    );
  }
  if (problem.isLoading) return <Loading text="加载题目…" />;
  if (problem.error) {
    return (
      <div className="space-y-3">
        <ErrorBox error={problem.error} />
        <Link to="/problems/algo" className="inline-flex items-center gap-1 text-xs text-muted transition-colors duration-150 hover:text-ink">
          <BackArrowIcon className="size-3.5" />
          返回题库
        </Link>
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
    submit.mutate({ problemId, language, code: code[language] });
  };
  const running = submit.isPending || result.data?.status === "pending" || result.data?.status === "running";

  return (
    <div className="space-y-6">
      <PageHeader
        label="Judge · 评测"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {data.problem.number > 0 && (
              <span className="font-mono text-base font-normal text-faint">#{data.problem.number}</span>
            )}
            {data.problem.title}
            <DifficultyBadge difficulty={data.problem.difficulty} />
          </span>
        }
        description="评测用例为题面示例（LeetCode 不公开完整测试集）"
        actions={
          <Link to="/problems/algo" className={buttonClass("ghost", "sm")}>
            返回题库
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左：示例用例 + 题面入口 */}
        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">
                示例用例（{data.examples.length}）
              </span>
              <a
                href={data.problem.url}
                className="text-xs text-accent-600 transition-colors duration-150 hover:text-accent-700"
              >
                题面与完整题解（docs 站）↗
              </a>
            </div>
            <div className="max-h-none overflow-y-auto pr-1 sm:max-h-[55vh]">
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
            </div>
          </Card>
        </div>

        {/* 右：编辑器 + 结果 */}
        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <SegmentedControl
                value={language}
                onChange={setLanguage}
                itemClassName="px-3 py-1 text-xs"
                options={(Object.keys(LANG_LABELS) as Language[]).map((l) => ({
                  value: l,
                  label: LANG_LABELS[l],
                  disabled: !data[l].available,
                  title: data[l].available ? undefined : (data[l].reason ?? ""),
                }))}
              />
            </div>
            {!langState.available && (
              <div className="mb-2 rounded-lg border border-line bg-page px-3 py-2 text-xs text-muted">{langState.reason}</div>
            )}
            <textarea
              value={code[language]}
              onChange={(e) => setCode((prev) => ({ ...prev, [language]: e.target.value }))}
              spellCheck={false}
              className="input h-80 w-full resize-y font-mono text-xs leading-relaxed"
            />
            <div className="mt-3 flex items-center gap-3">
              <Button
                onClick={onSubmit}
                disabled={running || !langState.available || data.examples.length === 0}
              >
                {running ? "评测中…" : "提交评测"}
              </Button>
              {running && <span className="text-xs text-muted">已入队，等待评测完成…</span>}
              {submit.error && <span className="text-xs text-accent-400">{submit.error.message}</span>}
            </div>
          </Card>

          {result.data && (
            <Card>
              <JudgeResultView result={result.data} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
