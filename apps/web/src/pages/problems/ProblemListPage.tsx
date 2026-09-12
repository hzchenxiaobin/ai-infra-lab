import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { trpc } from "../../lib/trpc";
import { Card, EmptyBox, ErrorBox, ListCard, Loading, PageHeader, ProgressBar } from "../../components/ui";
import { ProblemRow } from "./ProblemRow";

// ---------------------------------------------------------------------------
// 题单详情（/problems/lists/:slug）：成员题目按题单顺序浏览 + AC 标记。
// 正文（编排说明/节奏建议）在 docs 站（list.url），此处提供入口链接。
// ---------------------------------------------------------------------------

export default function ProblemListPage() {
  const { slug } = useParams();
  const get = useQuery(
    trpc.problem.getList.queryOptions({ slug: slug ?? "" }),
  );

  if (!slug) return <ErrorBox error={new Error("无效的题单标识")} />;
  if (get.isLoading) return <Loading text="加载题单…" />;
  if (get.error) return <ErrorBox error={get.error} />;
  if (!get.data) return null;

  const { list, items } = get.data;
  const acCount = items.filter((i) => i.ac).length;

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <PageHeader
        label={
          <>
            <Link to="/problems/lists" className="transition-colors hover:text-accent-700">
              Problems · 题单
            </Link>
            <span className="text-faint"> /</span>
          </>
        }
        title={list.title}
        description={`共 ${list.problemCount} 道题 · 已 AC ${acCount}${list.problemCount > 0 ? `（${Math.round((acCount / list.problemCount) * 100)}%）` : ""}`}
      >
        <ProgressBar
          className="mt-3 max-w-xs"
          value={list.problemCount ? (acCount / list.problemCount) * 100 : 0}
        />
        {list.url && (
          <a
            href={list.url}
            className="mt-3 inline-block text-sm text-accent-600 transition-colors hover:text-accent-700"
          >
            查看题单编排说明（学习节奏与分组） →
          </a>
        )}
      </PageHeader>

      {/* 成员列表（题库同款行） */}
      <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
        {items.length === 0 ? (
          <EmptyBox text="题单成员为空（需先执行 content:sync 导入题目元数据）" />
        ) : (
          <ListCard>
            {items.map((p) => (
              <ProblemRow key={p.id} problem={p} />
            ))}
          </ListCard>
        )}
      </section>

      {items.length < list.problemCount && (
        <Card>
          <p className="text-sm text-muted">
            {list.problemCount - items.length} 道成员题暂无站内题解元数据，已自动略过。
          </p>
        </Card>
      )}
    </div>
  );
}
