// @ailab/judge-core —— 评测核心（纯函数，零依赖）：
// server（in-process worker，开发形态）与 apps/judge-worker（Docker 沙箱，生产形态）
// 共用。签名/用例解析、harness 生成、输出比对、终态映射必须两端同源
// （dev/judge-worker.md §2：输出比对规则两端一致）。
export * from "./parse.js";
export * from "./driver.js";
export * from "./compare.js";
export * from "./run.js";
export * from "./verdict.js";
