import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { serve } from "@hono/node-server";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc.js";
import { env } from "./env.js";
import { llmMetricsSnapshot } from "./llm-metrics.js";
import { startJudgeWorker } from "./judge/worker.js";

const app = new Hono();

app.use("/trpc/*", cors());
app.use(
  "/trpc/*",
  trpcServer({ router: appRouter, createContext }),
);

app.get("/healthz", (c) => c.json({ ok: true }));

// LLM 打点（dev/deployment.md §5）：当日调用/token 聚合 + 延迟 p95，
// monitor.sh 轮询做「日 token 超预算 / p95 > 60s」告警。聚合计数无敏感信息
app.get("/metrics/llm", (c) => c.json(llmMetricsSnapshot()));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`server listening on http://localhost:${info.port}`);
  // 评测队列 worker（P0 in-process 形态；P1 由独立 judge-worker 接管）
  startJudgeWorker();
});
