import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "../lib/trpc";
import { ErrorBox, Loading } from "../components/ui";
import "./landing.css";

// 首页落地页：版式与文案对齐 ai-infra-notes 站点首页
// （https://hzchenxiaobin.github.io/ai-infra-notes/index.html），样式见同目录 landing.css。
// 周 / 专题卡片链接一律取 learn.overview 的 contents.url（红线：不手拼 docs 路径）；
// 导航「10 周计划」回本页（/）。

const GITHUB_URL = "https://github.com/hzchenxiaobin/ai-infra-notes";
// docs 构建期生成的论文索引页：站点结构页，无 contents 条目（统一 ID 体系外）
const PAPERS_URL = "/learn/papers/";

const PHASES = [
  {
    no: "阶段一",
    name: "基础内功",
    desc: "GPU 执行本质 → Kernel 优化 → Tensor Core → Transformer 算子",
    weeks: [1, 2, 3, 4],
  },
  {
    no: "阶段二",
    name: "推理系统",
    desc: "FlashAttention → KV Cache → Batching 调度 → 推理加速",
    weeks: [5, 6, 7, 8],
  },
  {
    no: "阶段三",
    name: "分布式与冲刺",
    desc: "分布式并行 → 项目整合 → 面试冲刺",
    weeks: [9, 10],
  },
] as const;

const WEEK_GOALS: Record<number, string> = {
  1: "建立 GPU 性能直觉 —— 性能 = Memory + 并行度",
  2: "掌握 Warp Shuffle、Register Blocking、GEMM 七层路径、CUDA Streams",
  3: "掌握 WMMA/mma.sync、CUTLASS 三级 Tiling、CuTe 布局抽象",
  4: "手写 Softmax/LayerNorm/GEMM Backward、Triton 三方 benchmark",
  5: "从 FA 简化版到 FA-3 完整贯通：论文/Forward/Backward/官方源码/性能对比",
  6: "Prefill/Decode、KV Cache（GQA/MQA/MLA）、vLLM、PagedAttention、FlashDecoding",
  7: "Continuous Batching、vLLM Scheduler、Chunked Prefill、PD 分离、Mini 引擎 v1",
  8: "量化（W8A16/INT8 KV/FP8）、投机解码、CUDA Graph、采样 kernel",
  9: "TP/PP/DP、NCCL、通信计算重叠、Ring Attention、MoE+EP、Ascend 对比",
  10: "Mini 引擎真整合、全链路 Profiling、面试题库、Mock 面试、诊断剧本",
};

const WEEK_RHYTHM = [
  { days: "Day 1-2", title: "🔬 理论 + 基础 Kernel", desc: "概念建模 + 最简实现" },
  { days: "Day 3-4", title: "📖 进阶实现 / 源码", desc: "进阶优化或开源源码导读" },
  { days: "Day 5", title: "🛠 项目推进", desc: "接入 Mini 引擎或 benchmark" },
  { days: "Day 6", title: "📊 Profiling", desc: "ncu / nsys 实测 + Roofline" },
  { days: "Day 7", title: "🧘 复盘 + 面试", desc: "知识地图 / 手撕清单 / 面试 Q&A" },
] as const;

// 展示名与图标为静态定义（源站文案）；slug 对齐 contents 的 learn:topic:{slug}，链接运行时联表
const TOPIC_CARDS = [
  { slug: "llm", icon: "🧠", name: "LLM" },
  { slug: "cpp", icon: "🖥️", name: "C++" },
  { slug: "cuda-graph", icon: "📊", name: "CUDA Graph" },
  { slug: "cute", icon: "🔷", name: "CuTe" },
  { slug: "cutlass", icon: "⚡", name: "CUTLASS" },
  { slug: "deepgemm", icon: "🔶", name: "DeepGEMM" },
  { slug: "deeplearning", icon: "📚", name: "Deep Learning" },
  { slug: "harness", icon: "🛠", name: "Harness" },
  { slug: "interview", icon: "💼", name: "Interview" },
  { slug: "misc", icon: "📒", name: "杂七杂八" },
  { slug: "moe", icon: "🧩", name: "MoE" },
  { slug: "nano-vllm", icon: "🪶", name: "nano-vllm" },
  { slug: "pytorch", icon: "🔥", name: "PyTorch" },
  { slug: "sglang", icon: "🛰️", name: "SGLang" },
  { slug: "shengteng", icon: "🌄", name: "昇腾" },
  { slug: "transformer", icon: "🤖", name: "Transformer" },
  { slug: "triton", icon: "🐍", name: "Triton" },
  { slug: "vllm", icon: "🚀", name: "vLLM" },
] as const;

const RESOURCES = [
  { icon: "📄", name: "论文精读", desc: "AI Infra 经典论文逐篇精读笔记", href: PAPERS_URL },
  {
    icon: "🧩",
    name: "LeetCode 题解",
    desc: "面试高频算法题解（独立站点）",
    href: "https://hzchenxiaobin.github.io/leetcode/",
  },
  {
    icon: "🎮",
    name: "LeetGPU 题解",
    desc: "CUDA 在线刷题与题解（独立仓库）",
    href: "https://github.com/hzchenxiaobin/leetgpu",
  },
  { icon: "💻", name: "GitHub 仓库", desc: "本站的全部源码与 Markdown 原文", href: GITHUB_URL },
] as const;

export default function LandingPage() {
  const overview = useQuery(trpc.learn.overview.queryOptions());

  if (overview.isLoading) return <Loading text="加载首页…" />;
  if (overview.error) return <ErrorBox error={overview.error} />;
  if (!overview.data) return null;

  const { weeks, topics } = overview.data;
  const weekByNo = new Map(weeks.map((w) => [w.week, w]));
  const topicUrlBySlug = new Map(topics.map((t) => [t.slug, t.url]));
  const totalDays = weeks.reduce((sum, w) => sum + w.days.length, 0);
  const firstWeek = weeks[0];

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="landing-nav-brand" to="/">
          AI Infra <span>Notes</span>
        </Link>
        <nav className="landing-nav-links">
          <Link to="/">10 周计划</Link>
          <Link to="/problems/algo">刷题</Link>
          <Link to="/start">面试</Link>
          <a href="#topics">专题笔记</a>
          <a href={PAPERS_URL}>论文精读</a>
          <a className="landing-nav-github" href={GITHUB_URL}>
            GitHub ↗
          </a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow">工程实战 · 10 周递进式路线</div>
          <h1 className="hero-title">
            AI Infra <span className="hero-title-accent">10 周学习计划</span>
          </h1>
          <p className="hero-subtitle">从「会写 Kernel」进阶到「能做系统优化」</p>
          <p className="hero-meta">
            适合具备 CUDA / 算子优化基础，希望转向 AI Infra（推理系统 / 分布式 / 内核优化）的工程师 · 每日 3～5 小时
          </p>
          <div className="hero-actions">
            {firstWeek && (
              <a className="btn btn-primary" href={firstWeek.url}>
                🚀 开始 Week {firstWeek.week}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="stats-strip">
        <div className="stat-item">
          <span className="stat-value">{weeks.length}</span>
          <span className="stat-label">周学习路线</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{totalDays}+</span>
          <span className="stat-label">每日实战任务</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{topics.length}</span>
          <span className="stat-label">专题笔记</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">∞</span>
          <span className="stat-label">持续更新</span>
        </div>
      </section>

      <main className="landing-main">
        <section className="landing-section" id="roadmap">
          <h2 className="section-title">学习路线</h2>
          <p className="section-subtitle">
            三个阶段、十个主题，从 GPU 执行本质一路走到分布式推理与面试冲刺。
          </p>
          {PHASES.map((phase) => (
            <div className="phase-group" key={phase.no}>
              <div className="phase-header">
                <span className="phase-no">{phase.no}</span>
                <span className="phase-name">{phase.name}</span>
                <span className="phase-desc">{phase.desc}</span>
              </div>
              <div className="week-grid">
                {phase.weeks.map((no) => {
                  const w = weekByNo.get(no);
                  if (!w) return null;
                  return (
                    <a className="week-card" href={w.url} key={w.week}>
                      <div className="week-card-top">
                        <span className="week-card-badge">W{w.week}</span>
                        <span className="week-card-arrow">→</span>
                      </div>
                      <div className="week-card-title">
                        {w.title.replace(/^Week\s*\d+\s*[:：]?\s*/i, "")}
                      </div>
                      <div className="week-card-goal">{WEEK_GOALS[w.week]}</div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="landing-section">
          <h2 className="section-title">每周节奏</h2>
          <p className="section-subtitle">每周 7 天固定循环：理论 → 进阶 → 项目 → Profiling → 复盘。</p>
          <div className="rhythm-grid">
            {WEEK_RHYTHM.map((r) => (
              <div className="rhythm-card" key={r.days}>
                <div className="rhythm-days">{r.days}</div>
                <div className="rhythm-title">{r.title}</div>
                <div className="rhythm-desc">{r.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" id="topics">
          <h2 className="section-title">专题笔记</h2>
          <p className="section-subtitle">围绕路线沉淀的专题深挖，可随时按主题查阅。</p>
          <div className="topic-grid">
            {TOPIC_CARDS.map((t) => {
              const url = topicUrlBySlug.get(t.slug);
              if (!url) return null;
              return (
                <a className="topic-card" href={url} key={t.slug}>
                  <span className="topic-card-icon">{t.icon}</span>
                  <span className="topic-card-name">{t.name}</span>
                  <span className="topic-card-arrow">→</span>
                </a>
              );
            })}
          </div>
        </section>

        <section className="landing-section">
          <h2 className="section-title">更多资源</h2>
          <div className="resource-grid">
            {RESOURCES.map((r) => (
              <a className="resource-card" href={r.href} key={r.name}>
                <span className="resource-card-icon">{r.icon}</span>
                <span className="resource-card-body">
                  <span className="resource-card-name">{r.name}</span>
                  <span className="resource-card-desc">{r.desc}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>
          AI Infra Notes · 由 <a href={GITHUB_URL}>GitHub</a> 驱动 · Deployed on GitHub Pages
        </span>
      </footer>
    </div>
  );
}
