import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { DIFFICULTIES, type KnowledgePointMastery } from "@ailab/contracts";
import { trpc, type QuotaMeData } from "../../lib/trpc";
import {
  ArrowIcon,
  Card,
  EmptyBox,
  ErrorBox,
  Loading,
  PageHeader,
  ProgressBar,
  SectionTitle,
} from "../../components/ui";
import { DIFFICULTY_LABELS } from "../../lib/format";

// 个人中心（dev/web.md §2：/dashboard 进度 / 统计 / 掌握度雷达）。
// 数据全部来自 server 已就绪的 progress.overview 与 quota.me，雷达图为手写 SVG（不引图表库）。

const QUOTA_KIND_LABELS: Record<string, string> = {
  judge: "评测提交",
  interview: "LLM 面试",
};

/** 雷达图最多展示的知识点数量（overview 已按薄弱在前排序） */
const RADAR_MAX_POINTS = 8;

/** 信号徽标：掌握度三路信号（学习/刷题/面试），null 显示 — */
function SignalChip({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rounded-md bg-page px-1.5 py-0.5 text-[11px] text-muted">
      {label} {value == null ? "—" : `${Math.round(value * 100)}%`}
    </span>
  );
}

/** 掌握度雷达：正 n 边形 + 同心网格 + 数据多边形（手写 SVG，dev/web.md §5 约定不引图表库） */
function MasteryRadar({ points }: { points: KnowledgePointMastery[] }) {
  const shown = points.slice(0, RADAR_MAX_POINTS);
  const n = shown.length;
  if (n < 3) {
    return <EmptyBox text="知识点数据不足；学习、刷题与面试之后，这里会生成掌握度雷达" />;
  }

  const W = 340;
  const H = 300;
  const cx = W / 2;
  const cy = 152;
  const R = 92;
  const angleAt = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2;
  const xy = (i: number, r: number): [number, number] => {
    const a = angleAt(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ringPoints = (fraction: number) =>
    shown.map((_, i) => xy(i, R * fraction).join(",")).join(" ");
  const dataPoints = shown
    .map((p, i) => xy(i, R * Math.max(Math.min(p.mastery, 1), 0.02)).join(","))
    .join(" ");
  const truncate = (s: string) => (s.length > 7 ? `${s.slice(0, 6)}…` : s);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-sm" role="img" aria-label="掌握度雷达图">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={ringPoints(f)}
          fill="none"
          className="stroke-divider"
          strokeWidth={f === 1 ? 1.2 : 1}
        />
      ))}
      {shown.map((_, i) => {
        const [x, y] = xy(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="stroke-divider" strokeWidth={1} />;
      })}
      <polygon
        points={dataPoints}
        className="fill-accent-600/15 stroke-accent-600"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {shown.map((p, i) => {
        const [x, y] = xy(i, R * Math.max(Math.min(p.mastery, 1), 0.02));
        return <circle key={p.knowledgePoint} cx={x} cy={y} r={2.4} className="fill-accent-600" />;
      })}
      {shown.map((p, i) => {
        const a = angleAt(i);
        const [x, y] = xy(i, R + 14);
        const anchor = Math.abs(Math.cos(a)) < 0.35 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return (
          <text
            key={p.knowledgePoint}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-muted text-[10px]"
          >
            <title>{p.knowledgePoint}</title>
            {truncate(p.knowledgePoint)}
          </text>
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const overview = useQuery(trpc.progress.overview.queryOptions());
  const quota = useQuery(trpc.quota.me.queryOptions());

  if (overview.isLoading) return <Loading text="加载进度数据…" />;
  if (overview.error) return <ErrorBox error={overview.error} />;
  if (!overview.data) return null;
  const { learning, practice, mastery, streakDays } = overview.data;

  const learnPct = learning.total > 0 ? Math.round((learning.seen / learning.total) * 100) : 0;
  const radarPoints = mastery.slice(0, RADAR_MAX_POINTS);

  return (
    <div className="space-y-10">
      {/* 标题区 */}
      <PageHeader
        label="Dashboard · 个人中心"
        title="学习与练习总览"
        description={
          <>
            连续活跃 <span className="font-semibold text-accent-600">{streakDays}</span> 天 · 已学{" "}
            {learning.seen}/{learning.total} 篇 · 已 AC {practice.ac}/{practice.total} 题
          </>
        }
      />

      {/* 学习路径 + 刷题统计 */}
      <section className="animate-fade-up grid gap-4 lg:grid-cols-2" style={{ animationDelay: "0.08s" }}>
        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">学习路径</h2>
            <Link
              to="/learn/path"
              className="group inline-flex items-center gap-1 text-xs font-medium text-accent-600 transition-colors duration-150 hover:text-accent-700"
            >
              继续学习
              <ArrowIcon className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-[32px] leading-none font-bold">{learnPct}%</span>
            <span className="text-xs text-muted">已学</span>
          </div>
          <ProgressBar className="mt-3" size="lg" value={learnPct} />
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span>已学 {learning.seen} / {learning.total}</span>
            <span>已掌握 {learning.mastered}</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">刷题统计</h2>
            <span className="text-xs text-muted">
              AC <span className="font-semibold text-accent-600">{practice.ac}</span> / {practice.total}
            </span>
          </div>
          <div className="mt-5 space-y-3.5">
            {DIFFICULTIES.map((d) => {
              const bucket = practice.byDifficulty[d];
              const pct = bucket.total > 0 ? Math.round((bucket.ac / bucket.total) * 100) : 0;
              return (
                <div key={d}>
                  <div className="mb-1.5 flex items-baseline justify-between text-xs">
                    <span className="text-muted">{DIFFICULTY_LABELS[d]}</span>
                    <span className="text-muted">
                      {bucket.ac}/{bucket.total}（{pct}%）
                    </span>
                  </div>
                  <ProgressBar value={pct} />
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* 掌握度雷达 + 薄弱知识点 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.16s" }}>
        <SectionTitle title="掌握度" />
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="p-6 lg:col-span-2">
            <MasteryRadar points={mastery} />
          </Card>
          <Card className="p-6 lg:col-span-3">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold">薄弱知识点</h3>
              <span className="text-xs text-muted">三路信号加权（学习 0.2 · 刷题 0.5 · 面试 0.3）</span>
            </div>
            {radarPoints.length === 0 ? (
              <EmptyBox text="暂无知识点数据" />
            ) : (
              <div className="divide-y divide-divider">
                {radarPoints.map((m) => (
                  <div key={m.knowledgePoint} className="flex items-center gap-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={m.knowledgePoint}>
                        {m.knowledgePoint}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <SignalChip label="学习" value={m.signals.learn} />
                        <SignalChip label="刷题" value={m.signals.problem} />
                        <SignalChip label="面试" value={m.signals.interview} />
                      </div>
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold">
                      {Math.round(m.mastery * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* 配额用量 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.24s" }}>
        <SectionTitle title="配额用量" />
        {quota.isLoading ? (
          <Loading />
        ) : quota.error ? (
          <ErrorBox error={quota.error} />
        ) : (
          <Card className="p-6">
            <div className="divide-y divide-divider">
              {quota.data?.current.map((u: QuotaMeData["current"][number]) => (
                <div key={u.kind} className="flex items-center gap-5 py-3 first:pt-0 last:pb-0">
                  <span className="w-20 shrink-0 text-sm font-medium">
                    {QUOTA_KIND_LABELS[u.kind] ?? u.kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    {u.quota == null ? (
                      <div className="text-xs text-muted">今日已用 {u.used} 次 · 不限额</div>
                    ) : (
                      <>
                        <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
                          <span>
                            今日已用 {u.used} / {u.quota} 次
                          </span>
                          <span>{Math.round(Math.min(u.used / u.quota, 1) * 100)}%</span>
                        </div>
                        <ProgressBar value={Math.min((u.used / u.quota) * 100, 100)} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-faint">统计周期：按天（UTC），每日重置。</p>
          </Card>
        )}
      </section>
    </div>
  );
}
