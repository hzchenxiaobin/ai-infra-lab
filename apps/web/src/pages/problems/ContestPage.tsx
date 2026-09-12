import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "../../lib/trpc";
import { Card, EmptyBox, ErrorBox, Loading, PageHeader } from "../../components/ui";

// ---------------------------------------------------------------------------
// 周赛列表（/problems/contest）：按场次（新 → 旧）聚合 lc:contest:{场次}q{n} 题解。
// ---------------------------------------------------------------------------

export default function ContestPage() {
  const sessions = useQuery(trpc.problem.contestSessions.queryOptions());

  return (
    <div className="space-y-10">
      <PageHeader
        label="Problems · 周赛"
        title="周赛题解"
        description="LeetCode 周赛 / 双周赛题目按场次浏览，进度与题库互通。"
      />

      <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
        {sessions.isLoading ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorBox error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <EmptyBox text="暂无周赛题目（需先执行 content:sync 导入）" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.data.map((s) => (
              <Link key={s.session} to={`/problems/contest/${s.session}`} className="group">
                <Card className="h-full transition-colors duration-150 group-hover:border-faint">
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-semibold transition-colors duration-150 group-hover:text-accent-600">
                      第 {s.session} 场
                    </span>
                    <span className="text-xs text-muted">{s.problemCount} 题</span>
                  </div>
                  <div className="mt-1 text-xs text-faint">Q1–Q{s.problemCount}</div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
