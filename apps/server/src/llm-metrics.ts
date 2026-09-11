// llm-metrics.ts —— LLM 调用打点（dev/deployment.md §5 监控告警的 server 侧来源）。
//
// 进程内按「天 + 模型」聚合计数与 token 用量，延迟保留最近 500 次环形样本算 p95；
// /metrics/llm 端点输出 JSON，monitor.sh 轮询做「日 token 超预算 / p95 > 60s」告警。
// 局限（有意取舍，不上 Prometheus）：单实例内存态，重启清零——告警取的是即时值，
// 历史趋势留待真正的多实例/时序需求再上。
import { env } from "./env.js";

interface DayModelStats {
  calls: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  totalMs: number;
}

const RING_SIZE = 500;

/** key = "YYYY-MM-DD|model"（模型分级：发言类/评估类分开计量） */
const stats = new Map<string, DayModelStats>();
const latencyRing: number[] = [];
let ringPos = 0;

const today = () => new Date().toISOString().slice(0, 10);

function bucket(model: string): DayModelStats {
  const key = `${today()}|${model}`;
  let b = stats.get(key);
  if (!b) {
    b = { calls: 0, errors: 0, promptTokens: 0, completionTokens: 0, totalMs: 0 };
    stats.set(key, b);
    // 只保留当天（跨天运行时清掉历史天，避免无界增长）
    for (const k of stats.keys()) if (!k.startsWith(today())) stats.delete(k);
  }
  return b;
}

export interface LlmCallRecord {
  model: string;
  ok: boolean;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
}

export function recordLlmCall(r: LlmCallRecord): void {
  const b = bucket(r.model);
  b.calls++;
  b.totalMs += r.ms;
  if (!r.ok) b.errors++;
  b.promptTokens += r.promptTokens ?? 0;
  b.completionTokens += r.completionTokens ?? 0;
  latencyRing[ringPos] = r.ms;
  ringPos = (ringPos + 1) % RING_SIZE;
}

function p95(): number | null {
  const samples = latencyRing.filter((n) => typeof n === "number");
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

/** /metrics/llm 输出：按模型分组的当日聚合 + 全局 p95（告警脚本消费） */
export function llmMetricsSnapshot() {
  const byModel: Record<string, DayModelStats & { avgMs: number }> = {};
  let totals = { calls: 0, errors: 0, promptTokens: 0, completionTokens: 0 };
  for (const [key, b] of stats) {
    const model = key.split("|")[1]!;
    byModel[model] = { ...b, avgMs: b.calls > 0 ? Math.round(b.totalMs / b.calls) : 0 };
    totals = {
      calls: totals.calls + b.calls,
      errors: totals.errors + b.errors,
      promptTokens: totals.promptTokens + b.promptTokens,
      completionTokens: totals.completionTokens + b.completionTokens,
    };
  }
  return {
    date: today(),
    totals: { ...totals, tokens: totals.promptTokens + totals.completionTokens },
    byModel,
    latency: { samples: latencyRing.filter((n) => typeof n === "number").length, p95Ms: p95() },
    // 预算口径透传（告警阈值在 monitor.sh 侧配置，此处仅提示现状）
    budget: env.LLM_DAILY_TOKEN_BUDGET ?? null,
  };
}
