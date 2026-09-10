import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "../../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../../components/ui";

// ---------------------------------------------------------------------------
// 题单索引（/problems/lists）：hot-interview / 10 周计划等题单卡片。
// 题单正文在 docs 站渲染，web 负责成员浏览 + AC 进度（成员数据 problem_lists 表）。
// ---------------------------------------------------------------------------

export default function ProblemListsPage() {
  const lists = useQuery(trpc.problem.lists.queryOptions());

  return (
    <div className="space-y-10">
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-600">
          Problems · 题单
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">刷题题单</h1>
        <p className="mt-2 text-sm text-muted">
          按面试高频与学习节奏编排的题目合集，进度与题库互通。
        </p>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "0.16s" }}>
        {lists.isLoading ? (
          <Loading />
        ) : lists.error ? (
          <ErrorBox error={lists.error} />
        ) : lists.data === undefined ? null : lists.data.length === 0 ? (
          <EmptyBox text="暂无题单（需先执行 content:sync 导入）" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.data.map((l) => (
              <Link
                key={l.id}
                to={`/problems/lists/${l.slug}`}
                className="group rounded-2xl border border-line bg-white p-5 shadow-soft transition-colors duration-150 hover:border-faint"
              >
                <div className="text-[15px] font-semibold transition-colors duration-150 group-hover:text-accent-600">
                  {l.title}
                </div>
                <div className="mt-2 text-xs text-muted">{l.problemCount} 道题</div>
                <div className="mt-3 text-xs text-faint">点击进入题单 →</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
