import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc, type LearnOverviewData } from "../../lib/trpc";
import { EmptyBox, ErrorBox, Loading } from "../../components/ui";

// 学习路径页（dev/web.md §2）：三阶段 × 10 周主线 + 每周节奏 + 专题 + 论文精读。
// 版式参考 ai-infra-notes 首页：阶段分组 + W 卡片（一句话描述）。
// 正文阅读在 docs 站（职责切分红线）：点击标题跳 contents.url，web 只做导航 + 进度标记。

const STATUS_STYLES: Record<string, string> = {
  unseen: "border-line bg-surface",
  seen: "border-accent-600/40 bg-accent-50",
  mastered: "border-accent-600 bg-accent-50",
};

// 三阶段分组与每周一句话描述（与 docs 站 10 周主线内容对应，按周号索引）
const PHASES = [
  {
    name: "阶段一 · 基础内功",
    tagline: "GPU 执行本质 → Kernel 优化 → Tensor Core → Transformer 算子",
    weeks: [1, 2, 3, 4],
  },
  {
    name: "阶段二 · 推理系统",
    tagline: "FlashAttention → KV Cache → Batching 调度 → 推理加速",
    weeks: [5, 6, 7, 8],
  },
  {
    name: "阶段三 · 分布式与冲刺",
    tagline: "分布式并行 → 项目整合 → 面试冲刺",
    weeks: [9, 10],
  },
] as const;

const WEEK_BLURBS: Record<number, string> = {
  1: "建立 GPU 性能直觉 —— 性能 = Memory + 并行度",
  2: "掌握 Warp Shuffle、Register Blocking、GEMM 七层路径、CUDA Streams",
  3: "掌握 WMMA/mma.sync、CUTLASS 三级 Tiling、CuTe 布局抽象",
  4: "手写 Softmax/LayerNorm/GEMM Backward、Triton 三方 benchmark",
  5: "从 FA 简化版到 FA-3 完整贯通：论文 / Forward / Backward / 官方源码 / 性能对比",
  6: "Prefill/Decode、KV Cache（GQA/MQA/MLA）、vLLM、PagedAttention、FlashDecoding",
  7: "Continuous Batching、vLLM Scheduler、Chunked Prefill、PD 分离、Mini 引擎 v1",
  8: "量化（W8A16/INT8 KV/FP8）、投机解码、CUDA Graph、采样 kernel",
  9: "TP/PP/DP、NCCL、通信计算重叠、Ring Attention、MoE+EP、Ascend 对比",
  10: "Mini 引擎真整合、全链路 Profiling、面试题库、Mock 面试、诊断剧本",
};

// 每周 7 天固定节奏：理论 → 进阶 → 项目 → Profiling → 复盘
const WEEK_RHYTHM = [
  { days: "Day 1-2", icon: "🔬", title: "理论 + 基础 Kernel", desc: "概念建模 + 最简实现" },
  { days: "Day 3-4", icon: "📖", title: "进阶实现 / 源码", desc: "进阶优化或开源源码导读" },
  { days: "Day 5", icon: "🛠", title: "项目推进", desc: "接入 Mini 引擎或 benchmark" },
  { days: "Day 6", icon: "📊", title: "Profiling", desc: "ncu / nsys 实测 + Roofline" },
  { days: "Day 7", icon: "🧘", title: "复盘 + 面试", desc: "知识地图 / 手撕清单 / 面试 Q&A" },
] as const;

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
  const weekByNo = new Map(weeks.map((w) => [w.week, w]));

  return (
    <div className="space-y-12">
      {/* 标题区 */}
      <section className="animate-fade-up">
        <div className="text-[11px] font-semibold uppercase tracking-[.22em] text-accent-600">
          Learn · 学习路线
        </div>
        <h1 className="mt-3 text-[40px] leading-tight font-bold tracking-tight">AI Infra 学习路线</h1>
        <p className="mt-3 text-sm text-muted">
          三个阶段、十个主题，从 GPU 执行本质一路走到分布式推理与面试冲刺。 已学{" "}
          {seenDays}/{totalDays} 天
          {totalDays > 0 && `（${Math.round((seenDays / totalDays) * 100)}%）`}。
        </p>
      </section>

      {/* 三阶段 × 10 周主线 */}
      {PHASES.map((phase, i) => (
        <section
          key={phase.name}
          className="animate-fade-up space-y-4"
          style={{ animationDelay: `${0.08 * (i + 1)}s` }}
        >
          <div>
            <h2 className="text-[18px] font-bold tracking-tight">{phase.name}</h2>
            <p className="mt-1 text-xs text-muted">{phase.tagline}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {phase.weeks.map((no) => {
              const w = weekByNo.get(no);
              if (!w) return null;
              return (
                <div
                  key={w.week}
                  className="rounded-2xl border border-line bg-surface p-5 shadow-soft"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="shrink-0 font-mono text-sm font-bold text-accent-600">
                      W{w.week}→
                    </span>
                    <a
                      href={w.url}
                      className="min-w-0 text-[15px] font-semibold transition-colors duration-150 hover:text-accent-600"
                    >
                      {w.title.replace(/^Week\s*\d+\s*[:：]?\s*/i, "")}
                    </a>
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {w.seenDays}/{w.days.length} 天
                    </span>
                  </div>
                  {WEEK_BLURBS[w.week] && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      {WEEK_BLURBS[w.week]}
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-7 gap-1.5">
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
              );
            })}
          </div>
        </section>
      ))}

      {/* 每周节奏 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.32s" }}>
        <div>
          <h2 className="text-[18px] font-bold tracking-tight">每周节奏</h2>
          <p className="mt-1 text-xs text-muted">
            每周 7 天固定循环：理论 → 进阶 → 项目 → Profiling → 复盘。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WEEK_RHYTHM.map((r) => (
            <div
              key={r.days}
              className="rounded-xl border border-line bg-surface p-4 shadow-soft"
            >
              <div className="text-[11px] font-semibold text-muted">{r.days}</div>
              <div className="mt-1.5 text-sm font-semibold">
                {r.icon} {r.title}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-faint">{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 专题 */}
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.4s" }}>
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
      <section className="animate-fade-up space-y-4" style={{ animationDelay: "0.48s" }}>
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
