// index.ts —— judge-worker 主进程（dev/judge-worker.md §1/§3）：
// 启动检查（镜像存在 / 崩溃恢复 / 孤儿容器清理）→ 轮询 submissions →
// Docker 一次性容器执行 → 写回终态。与 server in-process worker 的队列语义一致；
// 部署时 server 侧 JUDGE_INPROCESS_WORKER=false，执行全部走本进程。
import { terminalStatus, type JudgeRunResult } from "@ailab/judge-core";
import {
  claimNextSubmission,
  closePool,
  finishSubmission,
  loadProblemJudgeData,
  queueDepths,
  recoverOrphaned,
  type SubmissionRow,
} from "./db.js";
import { ensureImageExists, cleanupOrphanContainers, runInDocker } from "./runner.js";
import { env } from "./env.js";

let inFlight = 0;
let stopped = false;

async function main() {
  console.log(`[judge-worker] 启动：image=${env.JUDGE_IMAGE} concurrency=${env.JUDGE_CONCURRENCY} ` +
    `mem=${env.JUDGE_MEM_MB}m caseTimeout=${env.JUDGE_TIMEOUT_MS}ms`);

  await ensureImageExists().catch((err) => {
    console.error(`[judge-worker] 评测镜像不存在（${env.JUDGE_IMAGE}）：${(err as Error).message}`);
    console.error("[judge-worker] 先构建：docker build -t " + env.JUDGE_IMAGE + " deploy/images/algo");
    process.exit(1);
  });

  const recovered = await recoverOrphaned();
  if (recovered > 0) console.warn(`[judge-worker] 崩溃恢复：重置 ${recovered} 条 running 提交为 pending`);
  if (env.JUDGE_CLEANUP_ORPHANS) {
    const killed = await cleanupOrphanContainers();
    if (killed > 0) console.warn(`[judge-worker] 清理 ${killed} 个孤儿评测容器`);
  }
  console.log("[judge-worker] 队列深度：", JSON.stringify(await queueDepths()));

  const timer = setInterval(() => void tick(), env.POLL_INTERVAL_MS);
  // 优雅退出：SIGTERM/SIGINT 停轮询，等在跑容器结束后关连接
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    console.log("[judge-worker] 收到退出信号，等待在跑评测结束…");
    const wait = setInterval(() => {
      if (inFlight === 0) {
        clearInterval(wait);
        void closePool().finally(() => process.exit(0));
      }
    }, 500);
    setTimeout(() => process.exit(0), 60_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function tick() {
  while (inFlight < env.JUDGE_CONCURRENCY) {
    let row: SubmissionRow | null;
    try {
      row = await claimNextSubmission();
    } catch (err) {
      console.error("[judge-worker] 领取失败：", (err as Error).message);
      break;
    }
    if (!row) break;
    inFlight += 1;
    void executeSubmission(row)
      .catch((err) => console.error("[judge-worker] 执行异常：", err))
      .finally(() => {
        inFlight -= 1;
      });
  }
}

/** 执行一条已领取的提交：装判题数据 → Docker 容器执行 → 终态写回（异常兜底 ie） */
async function executeSubmission(row: SubmissionRow): Promise<void> {
  const start = Date.now();
  const finish = (status: string, verdictDetail: Record<string, unknown>) =>
    finishSubmission(row.id, status, verdictDetail, Date.now() - start);

  try {
    const data = await loadProblemJudgeData(row.problem_id);
    if (!data || data.judgeType !== "internal" || !data.judgeMeta) {
      // 题目已下线/转外站：数据源切换前入队的遗留行兜底
      await finish("ie", { error: `题目 ${row.problem_id} 不支持站内评测（数据缺失或 judge_type 非 internal）` });
      return;
    }
    const result = await runInDocker({
      submissionId: row.id,
      language: row.language === "python" ? "python" : "cpp",
      code: row.code,
      meta: data.judgeMeta,
      testcases: data.testcases,
      cases: data.testcases.map((t) => ({
        input: t.args.map((a) => `${a.name} = ${a.value}`).join(", "),
        args: t.args,
        expected: t.expected,
      })),
    });
    await finish(terminalStatus(result), result as unknown as Record<string, unknown>);
    logResult(row, result, Date.now() - start);
  } catch (err) {
    console.warn(`[judge-worker] submission #${row.id} 执行失败：`, (err as Error).message);
    await finish("ie", { error: (err as Error).message });
  }
}

function logResult(row: SubmissionRow, result: JudgeRunResult, ms: number): void {
  const status = terminalStatus(result);
  console.log(
    `[judge-worker] #${row.id} ${row.problem_id} ${row.language} → ${status} ` +
    `${result.passed}/${result.total}（${ms}ms）`,
  );
}

main().catch((err) => {
  console.error("[judge-worker] 启动失败：", err);
  process.exit(1);
});
