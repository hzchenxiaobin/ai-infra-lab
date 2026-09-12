import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@ailab/contracts";
import { queryClient, trpc, type InterviewStatsData } from "../lib/trpc";
import {
  Button,
  Card,
  EmptyBox,
  ErrorBox,
  GradeBadge,
  Loading,
  MicroLabel,
  PageHeader,
  ProgressBar,
  SectionTitle,
  StatusPill,
} from "../components/ui";
import { durationMinutes, formatDateTime, formatShortDate } from "../lib/format";

export default function HistoryPage() {
  const navigate = useNavigate();
  const stats = useQuery(trpc.interview.stats.queryOptions());
  const sessions = useQuery(trpc.interview.list.queryOptions());
  const remove = useMutation(
    trpc.interview.remove.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const onDelete = (id: number, title: string) => {
    if (window.confirm(`确定删除场次「${title}」？聊天记录与报告将一并删除，不可恢复。`)) {
      remove.mutate({ sessionId: id });
    }
  };

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <PageHeader
        label="History · 历史"
        title="历史统计"
        description="各方向均分、近期趋势与全部场次一览。"
      />

      {/* 方向平均分 */}
      <section className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
        <Card className="p-6">
          <SectionTitle title="方向平均分" description="A=4 / B=3 / C=2 / D=1" className="mb-4" />
          {stats.isLoading ? (
            <Loading />
          ) : stats.error ? (
            <ErrorBox error={stats.error} />
          ) : stats.data === undefined ? null : (
            <CategoryBars data={stats.data.categoryAverages} />
          )}
        </Card>
      </section>

      {/* 近 10 场趋势 */}
      <section className="animate-fade-up" style={{ animationDelay: "0.16s" }}>
        <Card className="p-6">
          <SectionTitle title="近 10 场趋势" className="mb-4" />
          {stats.isLoading ? (
            <Loading />
          ) : stats.error ? (
            <ErrorBox error={stats.error} />
          ) : stats.data === undefined ? null : (
            <TrendChart trend={stats.data.trend} />
          )}
        </Card>
      </section>

      {/* 场次表格 */}
      <section className="animate-fade-up" style={{ animationDelay: "0.24s" }}>
        <MicroLabel>All Sessions</MicroLabel>
        <h3 className="mt-2 mb-5 text-lg font-semibold tracking-tight">全部场次</h3>
        {sessions.isLoading ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorBox error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <EmptyBox text="还没有面试记录" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-soft">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-divider text-xs text-muted">
                  <th className="px-5 py-3 font-medium">时间</th>
                  <th className="px-5 py-3 font-medium">标题</th>
                  <th className="px-5 py-3 font-medium">方向</th>
                  <th className="px-5 py-3 font-medium">题数</th>
                  <th className="px-5 py-3 font-medium">等级</th>
                  <th className="px-5 py-3 font-medium">时长</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.data.map((s) => {
                  const duration = durationMinutes(s.createdAt, s.finishedAt);
                  return (
                    <tr
                      key={s.id}
                      onClick={() =>
                        navigate(s.status === "finished" ? `/report/${s.id}` : `/interview/${s.id}`)
                      }
                      className="cursor-pointer border-b border-divider transition-colors duration-150 last:border-0 hover:bg-page"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-muted">
                        {formatDateTime(s.createdAt)}
                      </td>
                      <td className="max-w-56 truncate px-5 py-3 font-medium">{s.title}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted">
                        {s.categories.map((c) => CATEGORY_LABELS[c as Category] ?? c).join("/")}
                      </td>
                      <td className="px-5 py-3 text-muted">{s.questionIds.length}</td>
                      <td className="px-5 py-3">
                        <GradeBadge grade={s.overallGrade} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted">
                        {duration != null ? `${duration} 分钟` : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {s.status === "finished" ? (
                          <StatusPill variant="done">已完成</StatusPill>
                        ) : (
                          <StatusPill variant="active">进行中</StatusPill>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(s.id, s.title);
                          }}
                        >
                          删除
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryBars({ data }: { data: InterviewStatsData["categoryAverages"] }) {
  return (
    <div className="space-y-3">
      {CATEGORIES.map((c) => {
        const entry = data.find((e) => e.category === c);
        const pct = entry ? Math.round((entry.average / 4) * 100) : 0;
        return (
          <div key={c} className="flex items-center gap-3">
            <div className="w-14 shrink-0 text-sm">{CATEGORY_LABELS[c]}</div>
            <ProgressBar className="flex-1" value={pct} />
            <div className="w-36 shrink-0 text-right text-xs text-muted">
              {entry ? `均分 ${entry.average.toFixed(2)} · ${entry.sessions} 场` : "暂无数据"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type TrendItem = InterviewStatsData["trend"][number];

const GRADE_LINES = [
  { g: "A", s: 4 },
  { g: "B", s: 3 },
  { g: "C", s: 2 },
  { g: "D", s: 1 },
] as const;

function TrendChart({ trend }: { trend: InterviewStatsData["trend"] }) {
  const points = trend.filter((t): t is TrendItem & { score: number } => t.score != null);
  if (points.length === 0) return <EmptyBox text="暂无已完成场次" />;

  const W = 640;
  const H = 200;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (s: number) => padT + ((4 - s) / 3) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近 10 场等级趋势">
      {GRADE_LINES.map(({ g, s }) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(s)} y2={y(s)} className="stroke-divider" strokeWidth={1} />
          <text x={padL - 8} y={y(s) + 4} textAnchor="end" className="fill-muted text-[11px]">
            {g}
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}
          fill="none"
          className="stroke-accent-600"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {points.map((p, i) => (
        <g key={p.sessionId}>
          <circle cx={x(i)} cy={y(p.score)} r={4} className="fill-accent-600 stroke-surface" strokeWidth={1.5}>
            <title>{`${p.title} · ${p.overallGrade ?? "—"}${p.durationMinutes != null ? ` · ${p.durationMinutes} 分钟` : ""}`}</title>
          </circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">
            {formatShortDate(p.createdAt)}
          </text>
        </g>
      ))}
    </svg>
  );
}
