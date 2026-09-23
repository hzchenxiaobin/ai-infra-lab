import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { trpc } from "../../lib/trpc";
import { LandingEmpty, LandingError, LandingLoading } from "../../components/LandingShell";
import { ProblemRow } from "./ProblemRow";
import "./problems.css";

// ---------------------------------------------------------------------------
// 题单详情（/problems/lists/:slug）：成员题目按题单顺序浏览 + AC 标记。
// 正文（编排说明/节奏建议）在 docs 站（list.url），此处提供入口链接。
// ---------------------------------------------------------------------------

export default function ProblemListPage() {
  const { slug } = useParams();
  const get = useQuery(
    trpc.problem.getList.queryOptions({ slug: slug ?? "" }),
  );

  if (!slug) return <LandingError error={new Error("无效的题单标识")} />;
  if (get.isLoading) return <LandingLoading text="加载题单…" />;
  if (get.error) return <LandingError error={get.error} />;
  if (!get.data) return null;

  const { list, items } = get.data;
  const acCount = items.filter((i) => i.ac).length;
  const pct = list.problemCount ? Math.round((acCount / list.problemCount) * 100) : 0;

  return (
    <div className="problems-page">
      {/* 标题区：题单名 + AC 进度（进度条与编排说明入口） */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">刷题 · 题单</div>
          <h1 className="hero-title">
            <span className="hero-title-accent">{list.title}</span>
          </h1>
          <p className="hero-subtitle">
            共 {list.problemCount} 道题 · 已 AC {acCount}
            {list.problemCount > 0 ? `（${pct}%）` : ""}
          </p>
          <div className="problems-hero-extra">
            <div className="problems-progress">
              <span style={{ width: `${pct}%` }} />
            </div>
            {list.url && (
              <a className="problems-hero-link" href={list.url}>
                查看题单编排说明（学习节奏与分组） →
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 成员列表（题库同款行） */}
      <main className="landing-main">
        {items.length === 0 ? (
          <LandingEmpty text="题单成员为空（需先执行 content:sync 导入题目元数据）" />
        ) : (
          <div className="problem-list">
            {items.map((p) => (
              <ProblemRow key={p.id} problem={p} />
            ))}
          </div>
        )}
        {items.length < list.problemCount && (
          <div className="problems-note">
            {list.problemCount - items.length} 道成员题暂无站内题解元数据，已自动略过。
          </div>
        )}
      </main>
    </div>
  );
}
