import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "../../lib/trpc";
import { LandingEmpty, LandingError, LandingLoading } from "../../components/LandingShell";
import "./problems.css";

// ---------------------------------------------------------------------------
// 周赛列表（/problems/contest）：按场次（新 → 旧）聚合 lc:contest:{场次}q{n} 题解。
// ---------------------------------------------------------------------------

export default function ContestPage() {
  const sessions = useQuery(trpc.problem.contestSessions.queryOptions());

  return (
    <div className="problems-page">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">刷题 · 周赛</div>
          <h1 className="hero-title">
            周赛<span className="hero-title-accent">题解</span>
          </h1>
          <p className="hero-subtitle">LeetCode 周赛 / 双周赛题目按场次浏览，进度与题库互通。</p>
        </div>
      </section>

      <main className="landing-main">
        {sessions.isLoading ? (
          <LandingLoading />
        ) : sessions.error ? (
          <LandingError error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <LandingEmpty text="暂无周赛题目（需先执行 content:sync 导入）" />
        ) : (
          <div className="problems-grid">
            {sessions.data.map((s) => (
              <Link key={s.session} to={`/problems/contest/${s.session}`} className="problems-card">
                <div className="problems-card-top">
                  <span className="pbadge">周赛</span>
                  <span className="problems-card-arrow">→</span>
                </div>
                <div className="problems-card-title">第 {s.session} 场</div>
                <div className="problems-card-desc">
                  {s.problemCount} 题 · Q1–Q{s.problemCount}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
