// db.ts —— submissions 队列访问（raw SQL，dev/judge-worker.md §6）：
// 领取语义与 server in-process worker 完全一致（两步条件 UPDATE 抢占，多 worker 安全）。
// worker 不写 user_progress（AC 联动由 server judge.getResult 读到时顺手做，职责单一）。
import mysql from "mysql2/promise";
import type { ProblemJudgeMeta, ProblemTestcase } from "@ailab/contracts";
import { env } from "./env.js";

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: env.JUDGE_CONCURRENCY + 2,
});

export interface SubmissionRow {
  id: number;
  user_id: number;
  problem_id: string;
  language: string;
  code: string;
  status: string;
}

/** 原子领取：先取最小 id 的 pending，再条件 UPDATE 抢占（affectedRows=1 即领取成功） */
export async function claimNextSubmission(): Promise<SubmissionRow | null> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id FROM submissions WHERE status = 'pending' ORDER BY id ASC LIMIT 1",
    );
    const id = rows[0]?.id as number | undefined;
    if (id == null) return null;
    const [claimed] = await conn.query<mysql.ResultSetHeader>(
      "UPDATE submissions SET status = 'running', started_at = NOW() WHERE id = ? AND status = 'pending'",
      [id],
    );
    if (claimed.affectedRows === 0) return null;
    const [full] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id, user_id, problem_id, language, code, status FROM submissions WHERE id = ?",
      [id],
    );
    return (full[0] as unknown as SubmissionRow) ?? null;
  } finally {
    conn.release();
  }
}

export interface ProblemJudgeData {
  judgeType: string;
  testcases: ProblemTestcase[];
  judgeMeta: ProblemJudgeMeta | null;
}

/** JSON 列双形态兼容：mysql2 默认自动反序列化，jsonStrings 配置下为字符串 */
function parseJsonCol<T>(v: unknown): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as unknown as T;
    }
  }
  return v as T;
}

/** 判题数据：problems ⋈ contents（active；与 server judge/context.ts 同源语义） */
export async function loadProblemJudgeData(problemId: string): Promise<ProblemJudgeData | null> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT p.judge_type, p.testcases, p.judge_meta
     FROM problems p JOIN contents c ON p.id = c.id
     WHERE p.id = ? AND c.status = 'active'`,
    [problemId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    judgeType: String(row.judge_type),
    testcases: parseJsonCol<ProblemTestcase[]>(row.testcases ?? []) ?? [],
    judgeMeta: parseJsonCol<ProblemJudgeMeta | null>(row.judge_meta ?? null),
  };
}

/** 写回终态与逐用例明细 */
export async function finishSubmission(
  id: number,
  status: string,
  verdictDetail: Record<string, unknown>,
  runtimeMs: number,
): Promise<void> {
  await pool.query(
    "UPDATE submissions SET status = ?, verdict_detail = ?, runtime_ms = ? WHERE id = ?",
    [status, JSON.stringify(verdictDetail), runtimeMs, id],
  );
}

/**
 * 崩溃恢复：启动时仍在 running 的行必为上次崩溃遗留（独立 worker 是唯一执行方）→
 * 重置重跑。多 worker 部署时改为按 started_at 超时重置（dev/judge-worker.md §3）。
 */
export async function recoverOrphaned(): Promise<number> {
  const [result] = await pool.query<mysql.ResultSetHeader>(
    "UPDATE submissions SET status = 'pending', started_at = NULL WHERE status = 'running'",
  );
  return result.affectedRows ?? 0;
}

/** 队列深度（启动日志/监控） */
export async function queueDepths(): Promise<Record<string, number>> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT status, COUNT(*) AS n FROM submissions GROUP BY status",
  );
  return Object.fromEntries(rows.map((r) => [String(r.status), Number(r.n)]));
}

export async function closePool(): Promise<void> {
  await pool.end();
}
