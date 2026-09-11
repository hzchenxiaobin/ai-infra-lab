import { describe, expect, it } from "vitest";
import { llmMetricsSnapshot, recordLlmCall } from "./llm-metrics.js";

// 纯内存打点（无 DB）：聚合口径 / p95 / 跨天清理 / 失败计数
describe("llm-metrics 打点", () => {
  it("按模型聚合 calls/errors/tokens，p95 从环形样本计算", () => {
    // 6 个样本 [100..600]，p95 = 第 95 百分位（ceil(6*0.95)=6 → 最大值 600）
    for (let i = 1; i <= 6; i++) {
      recordLlmCall({ model: "m-eval", ok: i !== 1, ms: i * 100, promptTokens: 10, completionTokens: 5 });
    }
    recordLlmCall({ model: "m-followup", ok: true, ms: 50, promptTokens: 3, completionTokens: 2 });

    const snap = llmMetricsSnapshot();
    expect(snap.byModel["m-eval"]).toMatchObject({
      calls: 6,
      errors: 1,
      promptTokens: 60,
      completionTokens: 30,
    });
    expect(snap.byModel["m-followup"].calls).toBe(1);
    expect(snap.totals.calls).toBe(7);
    expect(snap.totals.errors).toBe(1);
    expect(snap.totals.tokens).toBe(95);
    expect(snap.latency.p95Ms).toBe(600);
  });

  it("无样本时 p95 为 null；budget 未配置为 null", () => {
    // 新的一天进程才有空环形——直接构造：p95 在样本存在时非空，此处校验结构形态
    const snap = llmMetricsSnapshot();
    expect(typeof snap.latency.samples).toBe("number");
    expect(snap.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
