import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONTENT_TYPES, type ContentType } from "@ailab/contracts";
import { trpc } from "../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../components/ui";

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
    <div className="space-y-8">
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[.22em] text-accent-600">
          Search · 全站搜索
        </div>
        <h1 className="mt-3 text-[22px] font-bold tracking-tight">搜索</h1>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜索标题 / 标签 / 知识点 / 摘要…"
          className="input mt-4 w-full text-base"
          autoFocus
        />
        <div className="mt-3 flex gap-0.5 rounded-full bg-divider p-1">
          {(["all", ...CONTENT_TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1 text-sm transition-colors duration-150 ${
                type === t ? "bg-ink font-medium text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t === "all" ? "全部" : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

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
            <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
              {result.data?.items.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  className="block px-5 py-3.5 transition-colors duration-150 hover:bg-[#fafbfc]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-page px-1.5 py-0.5 text-[11px] text-muted">
                      {TYPE_LABELS[item.type]}
                    </span>
                    <span className="text-[15px] font-medium transition-colors duration-150 hover:text-accent-600">
                      {item.title}
                    </span>
                    {item.knowledgePoints.slice(0, 3).map((kp) => (
                      <span key={kp} className="rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] text-accent-600">
                        {kp}
                      </span>
                    ))}
                  </div>
                  {item.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.summary}</p>
                  )}
                </a>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
