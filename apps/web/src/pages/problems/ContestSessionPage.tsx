import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { trpc } from "../../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../../components/ui";
import { ProblemRow } from "./ProblemRow";

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

  if (!valid) return <ErrorBox error={new Error("无效的场次编号")} />;
  if (get.isLoading) return <Loading text="加载周赛题目…" />;
  if (get.error) return <ErrorBox error={get.error} />;
  if (!get.data) return null;

  const { session: s, items } = get.data;
  const acCount = items.filter((i) => i.ac).length;

  return (
    <div className="space-y-10">
      <section className="animate-fade-up">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
          <Link to="/problems/contest" className="transition-colors hover:text-accent-700">
            Problems · 周赛
          </Link>
          <span className="text-faint">/</span>
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">第 {s} 场周赛</h1>
        <p className="mt-2 text-sm text-muted">
          共 {items.length} 题 · 已 AC {acCount}
        </p>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "0.16s" }}>
        {items.length === 0 ? (
          <EmptyBox text="该场次暂无题目" />
        ) : (
          <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            {items.map((p, i) => (
              <ProblemRow key={p.id} problem={p} prefix={`Q${i + 1}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
