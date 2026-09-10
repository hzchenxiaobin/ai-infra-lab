import { and, asc, eq, sql } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/client.js";
import { submissions } from "../db/schema.js";
import type { SubmissionStatus } from "@ailab/contracts";
import { loadProblemJudgeContext, type ProblemJudgeContext } from "./context.js";
import { runJudge, type JudgeRunResult } from "./run.js";

// ---------------------------------------------------------------------------
// 评测队列 worker（P0 过渡形态，dev/judge-worker.md §1/§6）：
// 轮询 submissions 表 → 原子领取 pending → runJudge 执行 → 写回终态与 verdict_detail。
// 判题数据来自 problems 表（testcases + judge_meta，2026-09-10 第六批数据源切换）。
// P1 独立 judge-worker（Docker 沙箱）落地后接管执行路径，队列表/领取语义/verdict
// 结构保持不变；本机 exec 的安全红线（对外开放注册前的门槛）见 dev/judge-worker.md §5。
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 500;

type SubmissionRow = typeof submissions.$inferSelect;

let inFlight = 0;
let started = false;

/** server 启动时调用：崩溃恢复 + 开启轮询（重复调用幂等） */
export function startJudgeWorker() {
  if (started) return;
  started = true;
  void recoverOrphaned();
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  timer.unref();
  console.log(`[judge-worker] in-process worker started (concurrency=${env.JUDGE_CONCURRENCY})`);
}

/**
 * 崩溃恢复：本进程是唯一 worker，启动时仍在 running 的行必为上次崩溃遗留 → 重置重跑。
 * （P1 多 worker 后改为按 started_at 超时重置 + 孤儿容器清理，见 dev/judge-worker.md §3）
 */
export async function recoverOrphaned() {
  const result = await db
    .update(submissions)
    .set({ status: "pending", startedAt: null })
    .where(eq(submissions.status, "running"));
  const n = Number(result[0].affectedRows ?? 0);
  if (n > 0) console.warn(`[judge-worker] 崩溃恢复：重置 ${n} 条 running 提交为 pending`);
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

/**
 * 原子领取：先取最小 id 的 pending，再条件 UPDATE 抢占（affectedRows=1 即领取成功）。
 * 两步但无竞态：并发领取同一行时只有一个 UPDATE 生效，输家下次轮询重试。
 */
export async function claimNextSubmission(): Promise<SubmissionRow | null> {
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.status, "pending"))
    .orderBy(asc(submissions.id))
    .limit(1);
  const id = rows[0]?.id;
  if (id == null) return null;
  const claimed = await db
    .update(submissions)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(submissions.id, id), eq(submissions.status, "pending")));
  if (Number(claimed[0].affectedRows) === 0) return null;
  const full = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  return full[0] ?? null;
}

/** 执行一条已领取的提交：runJudge → 终态映射 → 写回（异常兜底 ie） */
export async function executeSubmission(row: SubmissionRow): Promise<void> {
  const start = Date.now();
  const finish = (status: SubmissionStatus, verdictDetail: Record<string, unknown>) =>
    db
      .update(submissions)
      .set({ status, verdictDetail, runtimeMs: Date.now() - start })
      .where(eq(submissions.id, row.id));

  try {
    const ctx = await loadProblemJudgeContext(row.problemId);
    const result = judge(row.language, row.code, ctx);
    await finish(terminalStatus(result), result as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn(`[judge-worker] submission #${row.id} 执行失败：`, (err as Error).message);
    await finish("ie", { error: (err as Error).message });
  }
}

/** 判题执行（语言分支与校验，判题数据来自 problems 表） */
function judge(language: string, code: string, ctx: ProblemJudgeContext): JudgeRunResult {
  if (language === "cpp") {
    if (!ctx.cppSpec) throw new Error("该题无 C++ 参考签名");
    if (ctx.cppUnsupported) throw new Error(ctx.cppUnsupported);
    return runJudge({ language: "cpp", code, spec: ctx.cppSpec, cases: ctx.examples });
  }
  if (language === "python") {
    if (!ctx.pythonAvailable) throw new Error("该题无 Python 参考签名");
    // Python harness 只需方法名；类型转换由 json 运行时处理，
    // 仅当 C++ 签名存在且类型不支持时同样受限（与 submit 校验同语义）
    if (ctx.cppUnsupported) throw new Error(ctx.cppUnsupported);
    return runJudge({
      language: "python",
      code,
      spec: {
        name: ctx.meta.methodName,
        params: ctx.meta.cppParams.map((p) => ({ ...p, raw: `${p.type} ${p.name}` })),
        returnType: "",
      },
      cases: ctx.examples,
    });
  }
  throw new Error(`不支持的评测语言：${language}`);
}

/** JudgeRunResult → 提交终态（dev/judge-worker.md §6） */
export function terminalStatus(result: JudgeRunResult): Exclude<SubmissionStatus, "pending" | "running"> {
  if (result.status === "compile_error") return "ce";
  if (result.status === "no_cases") return "ie";
  if (result.passed === result.total) return "ac";
  if (result.cases.some((c) => c.error != null && c.error.includes("超时"))) return "tle";
  return "wa";
}

/** 队列深度与积压（监控/测试用）：各状态计数 */
export async function queueDepths(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: submissions.status, count: sql<number>`count(*)` })
    .from(submissions)
    .groupBy(submissions.status);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}
