// 评测相关共享常量与工具（JudgePage 与面试间内嵌评测器共用；
// 独立文件避免组件文件混出非组件导出破坏 fast refresh）
import type { JudgeVerdict } from "@ailab/contracts";

/** 轮询间隔（dev/judge-worker.md §6：web 端 1–2s） */
export const POLL_INTERVAL_MS = 1500;

/** verdictDetail 形态判定（ie 时为 { error }，无 cases） */
export function isJudgeVerdict(detail: unknown): detail is JudgeVerdict {
  return detail != null && typeof detail === "object" && "cases" in detail;
}
