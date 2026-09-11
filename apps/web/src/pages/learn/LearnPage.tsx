import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc, type LearnOverviewData } from "../../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../../components/ui";

// 学习路径页（dev/web.md §2）：10 周 × 7 天进度 + 专题 + 论文精读。
// 正文阅读在 docs 站（职责切分红线）：点击标题跳 contents.url，web 只做导航 + 进度标记。

const STATUS_STYLES: Record<string, string> = {
  unseen: "border-line bg-surface",
  seen: "border-accent-600/40 bg-accent-50",
  mastered: "border-accent-600 bg-accent-50",
};

export default function LearnPage() {
  const overview = useQuery(trpc.learn.overview.queryOptions());

  const mark = useMutation(
    trpc.progress.mark.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  if (overview.isLoading) return <Loading text="加载学习路径…" />;
  if (overview.error) return <ErrorBox error={overview.error} />;
  if (!overview.data) return null;
  const { weeks, topics, papers } = overview.data;

  const totalDays = weeks.reduce((a, w) => a + w.days.length, 0);
  const seenDays = weeks.reduce((a, w) => a + w.seenDays, 0);

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[.22em] text-accent-600">
          Learn · 学习路径
        </div>
        <h1 className="mt-3 text-[40px] leading-tight font-bold tracking-tight">AI Infra 学习路径</h1>
        <p className="mt-3 text-sm text-muted">
          10 周主线 · 18 专题 · 论文精读。已学 {seenDays}/{totalDays} 天
          {totalDays > 0 && `（${Math.round((seenDays / totalDays) * 100)}%）`}。
        </p>
      </section>

      {/* 10 周主线 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.08s" }}>
        <h2 className="text-[18px] font-bold tracking-tight">10 周主线</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {weeks.map((w) => (
            <div
              key={w.week}
              className="rounded-2xl border border-line bg-surface p-5 shadow-soft"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={w.url}
                    className="text-[15px] font-semibold transition-colors duration-150 hover:text-accent-600"
                  >
                    Week {w.week} · {w.title}
                  </a>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {w.seenDays}/{w.days.length} 天
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {w.days.map((d) => (
                  <DayCell
                    key={d.id}
                    day={d}
                    marking={mark.isPending && mark.variables?.contentId === d.id}
                    onMark={() =>
                      mark.mutate({
                        contentId: d.id,
                        status: d.status === "unseen" ? "seen" : "mastered",
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 专题 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.16s" }}>
        <h2 className="text-[18px] font-bold tracking-tight">专题</h2>
        {topics.length === 0 ? (
          <EmptyBox text="暂无专题内容" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((t) => (
              <a
                key={t.slug}
                href={t.url}
                className="group rounded-xl border border-line bg-surface p-4 shadow-soft transition-colors duration-150 hover:border-faint"
              >
                <div className="truncate text-sm font-semibold transition-colors duration-150 group-hover:text-accent-600">
                  {t.title}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {t.slug} · {t.seenDays}/{t.totalDays} 天已学
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-divider">
                  <div
                    className="h-full rounded-full bg-accent-600 transition-all"
                    style={{ width: `${t.totalDays ? (t.seenDays / t.totalDays) * 100 : 0}%` }}
                  />
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* 论文精读 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.24s" }}>
        <h2 className="text-[18px] font-bold tracking-tight">论文精读</h2>
        {papers.length === 0 ? (
          <EmptyBox text="暂无论文内容" />
        ) : (
          <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            {papers.map((p) => (
              <a
                key={p.id}
                href={p.url}
                className="block px-5 py-3 text-[15px] transition-colors duration-150 hover:bg-page hover:text-accent-600"
              >
                {p.title}
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DayCell({
  day,
  marking,
  onMark,
}: {
  day: LearnOverviewData["weeks"][number]["days"][number];
  marking: boolean;
  onMark: () => void;
}) {
  const label =
    day.status === "unseen" ? "标记已学" : day.status === "seen" ? "标记掌握" : "已掌握";
  return (
    <div className="group relative">
      <a
        href={day.url}
        title={day.title}
        className={`block rounded-lg border p-1.5 text-center transition-colors duration-150 hover:border-faint ${STATUS_STYLES[day.status] ?? STATUS_STYLES.unseen}`}
      >
        <div className={`text-xs font-semibold ${day.status === "unseen" ? "text-muted" : "text-accent-600"}`}>
          {day.status === "mastered" ? "✓" : `D${day.day}`}
        </div>
        <div className="truncate text-[10px] text-faint">{day.title.replace(/^Day\s*\d+[：:]?\s*/, "")}</div>
      </a>
      {day.status !== "mastered" && (
        <button
          type="button"
          title={label}
          disabled={marking}
          onClick={onMark}
          className="absolute -top-1.5 -right-1.5 hidden size-4 place-items-center rounded-full bg-accent-600 text-[9px] font-bold text-white shadow-xs group-hover:grid"
        >
          ✓
        </button>
      )}
    </div>
  );
}
