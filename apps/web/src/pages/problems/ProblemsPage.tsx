import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { DIFFICULTIES, JUDGE_TYPES, type Difficulty, type JudgeType } from "@ailab/contracts";
import { queryClient, trpc, type ProblemListData } from "../../lib/trpc";
import { Button, DifficultyBadge, EmptyBox, ErrorBox, Loading } from "../../components/ui";
import { DIFFICULTY_LABELS, JUDGE_TYPE_LABELS } from "../../lib/format";

type ProblemItem = ProblemListData["items"][number];

const PAGE_SIZE = 50;

const PARTITIONS = {
  gpu: {
    label: "GPU",
    title: "GPU 题库",
    source: "leetgpu" as const,
    desc: "CUDA 编程题（LeetGPU 106 题），站内浏览题解，评测跳转 leetgpu.com。",
  },
  algo: {
    label: "算法",
    title: "算法题库",
    source: "leetcode" as const,
    desc: "LeetCode 算法题解（4042 题），按题号浏览，标记刷题进度。",
  },
};

export function ProblemsPage({ partition }: { partition: keyof typeof PARTITIONS }) {
  const meta = PARTITIONS[partition];
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [solved, setSolved] = useState<"all" | "ac" | "unac">("all");
  const [tag, setTag] = useState("");
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [judgeType, setJudgeType] = useState<"all" | JudgeType>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const facets = useQuery(
    trpc.problem.facets.queryOptions({ source: meta.source }),
  );

  const list = useQuery(
    trpc.problem.list.queryOptions({
      source: meta.source,
      difficulty: difficulty === "all" ? undefined : difficulty,
      solved: solved === "all" ? undefined : solved === "ac",
      tag: tag || undefined,
      knowledgePoint: knowledgePoint || undefined,
      judgeType: judgeType === "all" ? undefined : judgeType,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const acTotal = useQuery(
    trpc.problem.list.queryOptions({
      source: meta.source,
      solved: true,
      page: 1,
      pageSize: 1,
    }),
  );

  const mark = useMutation(
    trpc.progress.mark.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
          Problems · 刷题
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">{meta.title}</h1>
        <p className="mt-2 text-sm text-muted">{meta.desc}</p>
      </section>

      {/* 分区切换 + 筛选 */}
      <section
        className="flex animate-fade-up flex-wrap items-center gap-3"
        style={{ animationDelay: "0.16s" }}
      >
        <div className="flex gap-0.5 rounded-full bg-divider p-1">
          {(Object.keys(PARTITIONS) as Array<keyof typeof PARTITIONS>).map((p) => (
            <Link
              key={p}
              to={`/problems/${p}`}
              replace
              className={`rounded-full px-3 py-1 text-sm transition-colors duration-150 ${
                partition === p ? "bg-ink font-medium text-white" : "text-muted hover:text-ink"
              }`}
            >
              {PARTITIONS[p].label}
            </Link>
          ))}
        </div>
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value as "all" | Difficulty);
            setPage(1);
          }}
          className="input"
        >
          <option value="all">全部难度</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <select
          value={solved}
          onChange={(e) => {
            setSolved(e.target.value as "all" | "ac" | "unac");
            setPage(1);
          }}
          className="input"
        >
          <option value="all">全部状态</option>
          <option value="ac">已 AC</option>
          <option value="unac">未 AC</option>
        </select>
        <select
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(1);
          }}
          className="input max-w-44"
        >
          <option value="">全部标签</option>
          {facets.data?.tags.map((t) => (
            <option key={t.value} value={t.value}>
              {t.value}（{t.count}）
            </option>
          ))}
        </select>
        <select
          value={knowledgePoint}
          onChange={(e) => {
            setKnowledgePoint(e.target.value);
            setPage(1);
          }}
          className="input max-w-44"
        >
          <option value="">全部知识点</option>
          {facets.data?.knowledgePoints.map((k) => (
            <option key={k.value} value={k.value}>
              {k.value}（{k.count}）
            </option>
          ))}
        </select>
        <select
          value={judgeType}
          onChange={(e) => {
            setJudgeType(e.target.value as "all" | JudgeType);
            setPage(1);
          }}
          className="input"
        >
          <option value="all">全部评测方式</option>
          {JUDGE_TYPES.map((j) => (
            <option key={j} value={j}>
              {JUDGE_TYPE_LABELS[j]}
            </option>
          ))}
        </select>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索标题…"
          className="input w-48"
        />
        <span className="ml-auto text-xs text-muted">
          共 {list.data?.total ?? "…"} 题 · 已 AC {acTotal.data?.total ?? "…"}
        </span>
      </section>

      {/* 列表 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.24s" }}>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox error={list.error} />
        ) : list.data === undefined ? null : list.data.items.length === 0 ? (
          <EmptyBox text="没有符合条件的题目" />
        ) : (
          <>
            <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
              {list.data.items.map((p) => (
                <ProblemRow
                  key={p.id}
                  problem={p}
                  onMarkAc={() => mark.mutate({ contentId: p.id, status: "ac" })}
                  marking={mark.isPending && mark.variables?.contentId === p.id}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>
                共 {list.data.total} 题 · 第 {list.data.page}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ProblemRow({
  problem,
  onMarkAc,
  marking,
}: {
  problem: ProblemItem;
  onMarkAc: () => void;
  marking: boolean;
}) {
  return (
    <div className="group flex items-center gap-4 px-5 py-3 transition-colors duration-150 hover:bg-[#fafbfc]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {problem.number > 0 && (
            <span className="font-mono text-xs text-faint">#{problem.number}</span>
          )}
          <a
            href={problem.url}
            className="text-[15px] font-medium transition-colors duration-150 hover:text-accent-600"
          >
            {problem.title}
          </a>
          <DifficultyBadge difficulty={problem.difficulty} />
          {problem.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-md bg-page px-1.5 py-0.5 text-[11px] text-muted"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-faint">
          <span className="font-mono">{problem.id}</span>
          {problem.judgeType === "leetgpu-com" && problem.externalUrl && (
            <a
              href={problem.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-colors duration-150 hover:text-accent-600"
            >
              leetgpu 评测 ↗
            </a>
          )}
        </div>
      </div>
      {problem.ac ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-600">
          ✓ AC
        </span>
      ) : (
        <Button variant="secondary" disabled={marking} onClick={onMarkAc} className="shrink-0">
          {marking ? "标记中…" : "标记 AC"}
        </Button>
      )}
    </div>
  );
}
