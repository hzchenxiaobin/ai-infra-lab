import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONTENT_TYPES, type ContentType } from "@ailab/contracts";
import { trpc } from "../lib/trpc";
import { Chip, EmptyBox, ErrorBox, ListCard, Loading, PageHeader, SegmentedControl } from "../components/ui";

const TYPE_LABELS: Record<ContentType, string> = {
  learn: "学习",
  problem: "题目",
  paper: "论文",
  profiling: "Profiling",
};

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | ContentType>("all");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const result = useQuery(
    trpc.search.query.queryOptions({
      q,
      ...(type !== "all" ? { type } : {}),
      limit: 50,
    }),
  );

  return (
    <div className="space-y-10">
      <PageHeader label="Search · 全站搜索" title="搜索">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索标题 / 标签 / 知识点 / 摘要…"
          className="input mt-4 w-full text-base"
          autoFocus
        />
        <SegmentedControl
          className="mt-3 w-fit"
          value={type}
          onChange={setType}
          options={(["all", ...CONTENT_TYPES] as const).map((t) => ({
            value: t,
            label: t === "all" ? "全部" : TYPE_LABELS[t],
          }))}
        />
      </PageHeader>

      <section className="animate-fade-up space-y-2" style={{ animationDelay: "0.08s" }}>
        {!q ? (
          <EmptyBox text="输入关键词开始搜索" />
        ) : result.isLoading ? (
          <Loading />
        ) : result.error ? (
          <ErrorBox error={result.error} />
        ) : result.data && result.data.items.length === 0 ? (
          <EmptyBox text={`没有找到与「${q}」相关的内容`} />
        ) : (
          <>
            <div className="text-xs text-muted">
              「{q}」共 {result.data?.total} 条结果
            </div>
            <ListCard>
              {result.data?.items.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  className="block px-5 py-3.5 transition-colors duration-150 hover:bg-page"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip>{TYPE_LABELS[item.type]}</Chip>
                    <span className="text-base font-semibold transition-colors duration-150 hover:text-accent-600">
                      {item.title}
                    </span>
                    {item.knowledgePoints.slice(0, 3).map((kp) => (
                      <Chip key={kp} accent>
                        {kp}
                      </Chip>
                    ))}
                  </div>
                  {item.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.summary}</p>
                  )}
                </a>
              ))}
            </ListCard>
          </>
        )}
      </section>
    </div>
  );
}
