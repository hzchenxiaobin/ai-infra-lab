import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "../../lib/trpc";
import { LandingEmpty, LandingError, LandingLoading } from "../../components/LandingShell";
import "./problems.css";

// ---------------------------------------------------------------------------
// 题单索引（/problems/lists）：hot-interview / 10 周计划等题单卡片。
// 题单正文在 docs 站渲染，web 负责成员浏览 + AC 进度（成员数据 problem_lists 表）。
// ---------------------------------------------------------------------------

export default function ProblemListsPage() {
  const lists = useQuery(trpc.problem.lists.queryOptions());

  return (
    <div className="problems-page">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">刷题 · 题单</div>
          <h1 className="hero-title">
            刷题<span className="hero-title-accent">题单</span>
          </h1>
          <p className="hero-subtitle">按面试高频与学习节奏编排的题目合集，进度与题库互通。</p>
        </div>
      </section>

      <main className="landing-main">
        {lists.isLoading ? (
          <LandingLoading />
        ) : lists.error ? (
          <LandingError error={lists.error} />
        ) : lists.data === undefined ? null : lists.data.length === 0 ? (
          <LandingEmpty text="暂无题单（需先执行 content:sync 导入）" />
        ) : (
          <div className="problems-grid">
            {lists.data.map((l) => (
              <Link key={l.id} to={`/problems/lists/${l.slug}`} className="problems-card">
                <div className="problems-card-top">
                  <span className="pbadge">题单</span>
                  <span className="problems-card-arrow">→</span>
                </div>
                <div className="problems-card-title">{l.title}</div>
                <div className="problems-card-desc">{l.problemCount} 道题</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
