import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "../../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../../components/ui";

// ---------------------------------------------------------------------------
// 周赛列表（/problems/contest）：按场次（新 → 旧）聚合 lc:contest:{场次}q{n} 题解。
// ---------------------------------------------------------------------------

export default function ContestPage() {
  const sessions = useQuery(trpc.problem.contestSessions.queryOptions());

  return (
    <div className="space-y-10">
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
          Problems · 周赛
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">周赛题解</h1>
        <p className="mt-2 text-sm text-muted">
          LeetCode 周赛 / 双周赛题目按场次浏览，进度与题库互通。
        </p>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "0.16s" }}>
        {sessions.isLoading ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorBox error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <EmptyBox text="暂无周赛题目（需先执行 content:sync 导入）" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.data.map((s) => (
              <Link
                key={s.session}
                to={`/problems/contest/${s.session}`}
                className="group rounded-xl border border-line bg-surface p-4 shadow-soft transition-colors duration-150 hover:border-faint"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-semibold transition-colors duration-150 group-hover:text-accent-600">
                    第 {s.session} 场
                  </span>
                  <span className="text-xs text-muted">{s.problemCount} 题</span>
                </div>
                <div className="mt-1 text-[11px] text-faint">Q1–Q{s.problemCount} · 点击进入 →</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
