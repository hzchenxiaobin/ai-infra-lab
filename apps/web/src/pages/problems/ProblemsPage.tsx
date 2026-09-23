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
import { LandingEmpty, LandingError, LandingLoading } from "../../components/LandingShell";
import { DIFFICULTY_LABELS, JUDGE_TYPE_LABELS } from "../../lib/format";
import { ProblemRow } from "./ProblemRow";
import "./problems.css";

const PAGE_SIZE = 50;

const PARTITIONS = {
  gpu: {
    label: "GPU",
    title: "GPU 面试题",
    eyebrow: "面试实战 · CUDA 手撕面经",
    source: "leetgpu" as const,
    interview: true,
    desc: "选自 CUDA 手撕面经的高频 + 中频题（34 题），评测跳转 leetgpu.com。",
  },
  algo: {
    label: "算法",
    title: "算法面试题",
    eyebrow: "面试实战 · LeetCode 高频题库",
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
    <div className="problems-page">
      {/* 标题区：落地页同款 hero（径向光晕 + 网格底纹） */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">{meta.eyebrow}</div>
          <h1 className="hero-title">
            刷题 · <span className="hero-title-accent">{meta.title}</span>
          </h1>
          <p className="hero-subtitle">{meta.desc}</p>
        </div>
      </section>

      <main className="landing-main">
        {/* 筛选工具栏：分区 + 统计 / 下拉筛选 + 搜索 / GPU 知识领域 */}
        <section className="problems-toolbar">
          <div className="problems-row">
            <div className="seg" role="group" aria-label="题库分区">
              {(Object.keys(PARTITIONS) as Array<keyof typeof PARTITIONS>).map((p) => (
                <Link
                  key={p}
                  to={`/problems/${p}`}
                  replace
                  className={`seg-item${partition === p ? " is-active" : ""}`}
                >
                  {PARTITIONS[p].label}
                </Link>
              ))}
            </div>
            {partition === "algo" && (
              <div className="seg" role="group" aria-label="专题导航">
                <Link to="/problems/lists" className="seg-item">
                  题单
                </Link>
                <Link to="/problems/contest" className="seg-item">
                  周赛
                </Link>
              </div>
            )}
            <span className="problems-count">
              共 {list.data?.total ?? "…"} 题 · 已完全掌握 {acTotal.data?.total ?? "…"}
            </span>
          </div>
          <div className="problems-row">
            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value as "all" | Difficulty);
                setPage(1);
              }}
              className="select"
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
              className="select"
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
              className="select"
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
              className="select"
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
              className="select"
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
              className="search"
            />
          </div>
          {partition === "gpu" && (
            <div className="problems-row">
              <div className="seg seg--sm" role="group" aria-label="知识领域">
                <button
                  type="button"
                  onClick={() => {
                    setKnowledgePoint("");
                    setPage(1);
                  }}
                  className={`seg-item${knowledgePoint === "" ? " is-active" : ""}`}
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
                    className={`seg-item${knowledgePoint === d.slug ? " is-active" : ""}`}
                  >
                    {d.letter}
                  </button>
                ))}
              </div>
              {knowledgePoint && (
                <span className="problems-hint">
                  {GPU_DOMAINS.find((d) => d.slug === knowledgePoint)?.name ?? knowledgePoint}
                </span>
              )}
            </div>
          )}
        </section>

        {/* 列表（GPU 分区按 高频/中频 分组，其余分区平铺） */}
        <section className="problems-content">
          {list.isLoading ? (
            <LandingLoading />
          ) : list.error ? (
            <LandingError error={list.error} />
          ) : list.data === undefined ? null : list.data.items.length === 0 ? (
            <LandingEmpty text="没有符合条件的题目" />
          ) : (
            <>
              {partition === "gpu" ? (
                <div className="problems-stack">
                  {(
                    [
                      { tier: "high" as const, items: list.data.items.filter((p) => p.tier === "high") },
                      { tier: "mid" as const, items: list.data.items.filter((p) => p.tier === "mid") },
                    ] as const
                  )
                    .filter((g) => g.items.length > 0)
                    .map((g) => (
                      <div key={g.tier}>
                        <div className="problems-group">
                          <span className="problems-group-badge">
                            {g.tier === "high" ? "高频" : "中频"}
                          </span>
                          {g.tier === "high" && (
                            <span className="problems-group-name">面经几乎必考</span>
                          )}
                          <span className="problems-group-count">{g.items.length} 题</span>
                        </div>
                        <div className="problem-list">
                          {g.items.map((p) => (
                            <ProblemRow key={p.id} problem={p} />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="problem-list">
                  {list.data.items.map((p) => (
                    <ProblemRow key={p.id} problem={p} />
                  ))}
                </div>
              )}
              <div className="problems-footer">
                <span>
                  共 {list.data.total} 题 · 第 {list.data.page}/{totalPages} 页
                </span>
                <div className="problems-footer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
