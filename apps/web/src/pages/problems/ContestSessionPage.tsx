import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { trpc } from "../../lib/trpc";
import { LandingEmpty, LandingError, LandingLoading } from "../../components/LandingShell";
import { ProblemRow } from "./ProblemRow";
import "./problems.css";

// ---------------------------------------------------------------------------
// 单场周赛（/problems/contest/:session）：Q1..Qn 按序浏览 + AC 标记。
// ---------------------------------------------------------------------------

export default function ContestSessionPage() {
  const { session } = useParams();
  const sessionNum = Number(session);
  const valid = Number.isInteger(sessionNum) && sessionNum > 0;
  const get = useQuery({
    ...trpc.problem.contestProblems.queryOptions({ session: sessionNum }),
    enabled: valid,
  });

  if (!valid) return <LandingError error={new Error("无效的场次编号")} />;
  if (get.isLoading) return <LandingLoading text="加载周赛题目…" />;
  if (get.error) return <LandingError error={get.error} />;
  if (!get.data) return null;

  const { session: s, items } = get.data;
  const acCount = items.filter((i) => i.ac).length;

  return (
    <div className="problems-page">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">刷题 · 周赛</div>
          <h1 className="hero-title">
            <span className="hero-title-accent">第 {s} 场周赛</span>
          </h1>
          <p className="hero-subtitle">共 {items.length} 题 · 已 AC {acCount}</p>
        </div>
      </section>

      <main className="landing-main">
        {items.length === 0 ? (
          <LandingEmpty text="该场次暂无题目" />
        ) : (
          <div className="problem-list">
            {items.map((p, i) => (
              <ProblemRow key={p.id} problem={p} prefix={`Q${i + 1}`} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
