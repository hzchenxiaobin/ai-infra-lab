import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { trpc } from "../../lib/trpc";
import { EmptyBox, ErrorBox, ListCard, Loading, PageHeader } from "../../components/ui";
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
      <PageHeader
        label={
          <>
            <Link to="/problems/contest" className="transition-colors hover:text-accent-700">
              Problems · 周赛
            </Link>
            <span className="text-faint"> /</span>
          </>
        }
        title={`第 ${s} 场周赛`}
        description={`共 ${items.length} 题 · 已 AC ${acCount}`}
      />

      <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
        {items.length === 0 ? (
          <EmptyBox text="该场次暂无题目" />
        ) : (
          <ListCard>
            {items.map((p, i) => (
              <ProblemRow key={p.id} problem={p} prefix={`Q${i + 1}`} />
            ))}
          </ListCard>
        )}
      </section>
    </div>
  );
}
