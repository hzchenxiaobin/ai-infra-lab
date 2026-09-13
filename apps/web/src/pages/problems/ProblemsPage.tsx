import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  DIFFICULTIES,
  GPU_DOMAINS,
  JUDGE_TYPES,
  type Difficulty,
  type JudgeType,
} from "@ailab/contracts";
import { trpc } from "../../lib/trpc";
import {
  Button,
  EmptyBox,
  ErrorBox,
  ListCard,
  Loading,
  PageHeader,
} from "../../components/ui";
import { SEGMENTED_CLASS, segmentedItemClass } from "../../lib/segmented";
import { DIFFICULTY_LABELS, JUDGE_TYPE_LABELS } from "../../lib/format";
import { ProblemRow } from "./ProblemRow";

const PAGE_SIZE = 50;

const PARTITIONS = {
  gpu: {
    label: "GPU",
    title: "GPU 面试题",
    source: "leetgpu" as const,
    interview: true,
    desc: "选自 CUDA 手撕面经的高频 + 中频题（34 题），评测跳转 leetgpu.com。",
  },
  algo: {
    label: "算法",
    title: "算法面试题",
    source: "leetcode" as const,
    interview: true,
    desc: "面试题库中的 LeetCode 高频题，按题号浏览，标记刷题进度。",
  },
};

export function ProblemsPage({ partition }: { partition: keyof typeof PARTITIONS }) {
  const meta = PARTITIONS[partition];
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [progress, setProgress] = useState<"all" | "unseen" | "seen" | "ac">("all");
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
    trpc.problem.facets.queryOptions({
      source: meta.source,
      interview: meta.interview || undefined,
    }),
  );

  const list = useQuery(
    trpc.problem.list.queryOptions({
      source: meta.source,
      difficulty: difficulty === "all" ? undefined : difficulty,
      progress: progress === "all" ? undefined : progress,
      tag: tag || undefined,
      knowledgePoint: knowledgePoint || undefined,
      judgeType: judgeType === "all" ? undefined : judgeType,
      search: search || undefined,
      interview: meta.interview || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const acTotal = useQuery(
    trpc.problem.list.queryOptions({
      source: meta.source,
      solved: true,
      interview: meta.interview || undefined,
      page: 1,
      pageSize: 1,
    }),
  );

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <PageHeader label="Problems · 刷题" title={meta.title} description={meta.desc} />

      {/* 分区切换 + 筛选（分区一行 / select 组一行 / 搜索+统计一行） */}
      <section
        className="animate-fade-up space-y-3"
        style={{ animationDelay: "0.08s" }}
      >
        <div className="flex">
          <div className={SEGMENTED_CLASS}>
            {(Object.keys(PARTITIONS) as Array<keyof typeof PARTITIONS>).map((p) => (
              <Link
                key={p}
                to={`/problems/${p}`}
                replace
                className={`rounded-full px-3 py-1 text-sm ${segmentedItemClass(partition === p)}`}
              >
                {PARTITIONS[p].label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value as "all" | Difficulty);
            setPage(1);
          }}
          className="input w-full sm:w-44"
        >
          <option value="all">全部难度</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <select
          value={progress}
          onChange={(e) => {
            setProgress(e.target.value as "all" | "unseen" | "seen" | "ac");
            setPage(1);
          }}
          className="input w-full sm:w-44"
        >
          <option value="all">全部状态</option>
          <option value="unseen">没写过</option>
          <option value="seen">需复习</option>
          <option value="ac">已完全掌握</option>
        </select>
        <select
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setPage(1);
          }}
          className="input w-full sm:w-44"
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
          className="input w-full sm:w-44"
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
          className="input w-full sm:w-44"
        >
          <option value="all">全部评测方式</option>
          {JUDGE_TYPES.map((j) => (
            <option key={j} value={j}>
              {JUDGE_TYPE_LABELS[j]}
            </option>
          ))}
        </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索标题…"
            className="input w-full sm:w-64"
          />
          <span className="text-xs text-muted sm:ml-auto">
            共 {list.data?.total ?? "…"} 题 · 已完全掌握 {acTotal.data?.total ?? "…"}
          </span>
        </div>
      </section>

      {/* GPU 分区：知识领域 A–L 快捷分组（点击即按领域知识点筛选）；算法分区：题单/周赛入口 */}
      {partition === "gpu" ? (
        <section className="flex animate-fade-up flex-wrap items-center gap-2" style={{ animationDelay: "0.12s" }}>
          <span className="mr-1 text-xs font-medium text-muted">知识领域</span>
          <div className={`${SEGMENTED_CLASS} flex-wrap`}>
            <button
              type="button"
              onClick={() => {
                setKnowledgePoint("");
                setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-xs ${segmentedItemClass(knowledgePoint === "")}`}
            >
              全部
            </button>
            {GPU_DOMAINS.map((d) => (
              <button
                key={d.letter}
                type="button"
                title={d.name}
                onClick={() => {
                  setKnowledgePoint(knowledgePoint === d.slug ? "" : d.slug);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-xs ${segmentedItemClass(knowledgePoint === d.slug)}`}
              >
                {d.letter}
              </button>
            ))}
          </div>
          {knowledgePoint && (
            <span className="ml-1 text-xs text-faint">
              {GPU_DOMAINS.find((d) => d.slug === knowledgePoint)?.name ?? knowledgePoint}
            </span>
          )}
        </section>
      ) : (
        <section className="flex animate-fade-up flex-wrap items-center gap-2" style={{ animationDelay: "0.12s" }}>
          <span className="mr-1 text-xs font-medium text-muted">专题导航</span>
          <div className={SEGMENTED_CLASS}>
            <Link
              to="/problems/lists"
              className={`rounded-full px-3 py-1 text-xs ${segmentedItemClass(false)}`}
            >
              题单
            </Link>
            <Link
              to="/problems/contest"
              className={`rounded-full px-3 py-1 text-xs ${segmentedItemClass(false)}`}
            >
              周赛
            </Link>
          </div>
        </section>
      )}

      {/* 列表（GPU 分区按 高频/中频 分组，其余分区平铺） */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.16s" }}>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox error={list.error} />
        ) : list.data === undefined ? null : list.data.items.length === 0 ? (
          <EmptyBox text="没有符合条件的题目" />
        ) : (
          <>
            {partition === "gpu" ? (
              (
                [
                  { tier: "high" as const, label: "高频题 · 面经几乎必考", items: list.data.items.filter((p) => p.tier === "high") },
                  { tier: "mid" as const, label: "中频题", items: list.data.items.filter((p) => p.tier === "mid") },
                ] as const
              )
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <div key={g.tier} className="space-y-2">
                    <div className="flex items-baseline gap-2 px-1">
                      <span
                        className={`text-sm font-semibold ${g.tier === "high" ? "text-accent-600" : "text-ink"}`}
                      >
                        {g.label}
                      </span>
                      <span className="text-xs text-faint">{g.items.length} 题</span>
                    </div>
                    <ListCard>
                      {g.items.map((p) => (
                        <ProblemRow key={p.id} problem={p} />
                      ))}
                    </ListCard>
                  </div>
                ))
            ) : (
              <ListCard>
                {list.data.items.map((p) => (
                  <ProblemRow key={p.id} problem={p} />
                ))}
              </ListCard>
            )}
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
