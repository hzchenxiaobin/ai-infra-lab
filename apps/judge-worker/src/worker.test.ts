import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import {
  extractReferenceCode,
  parseCppSignature,
  parseExamples,
} from "@ailab/judge-core";
import type { ProblemJudgeMeta } from "@ailab/contracts";
import { pool, claimNextSubmission, finishSubmission, loadProblemJudgeData, queueDepths, recoverOrphaned, closePool } from "./db.js";
import { runInDocker } from "./runner.js";
import { env } from "./env.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// 队列端到端（dev/judge-worker.md §8）：problems 判题数据 fixture → insert pending →
// 领取 → Docker 容器执行 → 写回 → 读回校验。MySQL 与 docker 双可用才跑。
// ---------------------------------------------------------------------------

async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["image", "inspect", env.JUDGE_IMAGE]);
    return true;
  } catch {
    return false;
  }
}

const dbOk = await dbAvailable();
const dockerOk = await dockerAvailable();
const run = dbOk && dockerOk ? describe : describe.skip;

const FIXTURE_ID = "lc:zzw53";
const md53 = fileURLToPath(
  new URL("../../../packages/content/problems-algo/solution/0001-0100/53_最大子数组和.md", import.meta.url),
);

run("worker 队列端到端（53 最大子数组和，Docker 执行）", () => {
  it("fixture → pending → 领取 → 容器执行 AC → 写回", async () => {
    // ---- fixture：problems/contents 判题数据（content-kit judge-extract 同构） ----
    const md = await readFile(md53, "utf8");
    const cppRef = extractReferenceCode(md, "cpp")!;
    const spec = parseCppSignature(cppRef)!;
    const testcases = parseExamples(md).map(({ args, expected }) => ({ args, expected }));
    const judgeMeta: ProblemJudgeMeta = {
      methodName: spec.name,
      cppAvailable: true,
      cppParams: spec.params.map(({ name, type }) => ({ name, type })),
      cppReturnType: spec.returnType,
      pythonAvailable: true,
    };
    await pool.query("DELETE FROM submissions WHERE problem_id = ?", [FIXTURE_ID]);
    await pool.query("DELETE FROM problems WHERE id = ?", [FIXTURE_ID]);
    await pool.query("DELETE FROM contents WHERE id = ?", [FIXTURE_ID]);
    await pool.query(
      "INSERT INTO contents (id, type, title, tags, knowledge_points, url, content_hash, status) VALUES (?, 'problem', ?, ?, ?, ?, ?, 'active')",
      [FIXTURE_ID, "[测试] 53. 最大子数组和", JSON.stringify([]), JSON.stringify([]), "/problems/zzw53", "zzw53"],
    );
    await pool.query(
      `INSERT INTO problems (id, source, number, difficulty, languages, judge_type, testcases, judge_meta, external_url)
       VALUES (?, 'leetcode', 53, 'medium', ?, 'internal', ?, ?, '')`,
      [FIXTURE_ID, JSON.stringify(["cpp", "python"]), JSON.stringify(testcases), JSON.stringify(judgeMeta)],
    );

    try {
      // ---- 入队 + 领取 ----
      const [inserted] = await pool.query<any>("INSERT INTO submissions (user_id, problem_id, language, code, status) VALUES (1, ?, 'cpp', ?, 'pending')", [FIXTURE_ID, cppRef]);
      const row = await claimNextSubmission();
      expect(row?.id).toBe(inserted.insertId);
      expect(row?.status).toBe("running");

      // ---- 执行（真实 docker 容器） ----
      const data = (await loadProblemJudgeData(FIXTURE_ID))!;
      expect(data.judgeType).toBe("internal");
      const start = Date.now();
      const result = await runInDocker({
        submissionId: row!.id,
        language: "cpp",
        code: row!.code,
        meta: data.judgeMeta!,
        testcases: data.testcases,
        cases: data.testcases.map((t) => ({
          input: t.args.map((a) => `${a.name} = ${a.value}`).join(", "),
          args: t.args,
          expected: t.expected,
        })),
      });
      expect(result.status).toBe("ok");
      expect(result.passed).toBe(result.total);

      // ---- 写回 + 读回 ----
      await finishSubmission(row!.id, "ac", result as unknown as Record<string, unknown>, Date.now() - start);
      const [rows] = await pool.query<any>("SELECT status, runtime_ms, verdict_detail FROM submissions WHERE id = ?", [row!.id]);
      expect(rows[0].status).toBe("ac");
      expect(Number(rows[0].runtime_ms)).toBeGreaterThan(0);
      // mysql2 对 JSON 列自动反序列化（字符串兜底兼容驱动配置差异）
      const detail = typeof rows[0].verdict_detail === "string" ? JSON.parse(rows[0].verdict_detail) : rows[0].verdict_detail;
      expect(detail.passed).toBe(detail.total);
    } finally {
      await pool.query("DELETE FROM submissions WHERE problem_id = ?", [FIXTURE_ID]);
      await pool.query("DELETE FROM problems WHERE id = ?", [FIXTURE_ID]);
      await pool.query("DELETE FROM contents WHERE id = ?", [FIXTURE_ID]);
    }
  }, 180_000);

  it("崩溃恢复：running 重置 pending；队列深度计数", async () => {
    await pool.query("INSERT INTO submissions (user_id, problem_id, language, code, status) VALUES (1, 'lc:zzw-recover', 'cpp', 'x', 'running')");
    const n = await recoverOrphaned();
    expect(n).toBeGreaterThanOrEqual(1);
    const depths = await queueDepths();
    expect(depths.pending).toBeGreaterThanOrEqual(1);
    await pool.query("DELETE FROM submissions WHERE problem_id = 'lc:zzw-recover'");
  });
});

// vitest 不挂起：收掉 pool 句柄（未连接时 end 也安全）
afterAll(async () => {
  await closePool();
});
