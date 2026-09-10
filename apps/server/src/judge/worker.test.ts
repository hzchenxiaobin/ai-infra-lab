import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/client.js";
import { questions, submissions, usageQuotas } from "../db/schema.js";
import { appRouter } from "../routers/index.js";
import { extractReferenceCode } from "./parse.js";
import { claimNextSubmission, executeSubmission, recoverOrphaned, terminalStatus } from "./worker.js";
import type { JudgeRunResult } from "./run.js";

// ---------------------------------------------------------------------------
// 评测队列集成测试（dev/judge-worker.md §1/§6）：submit → submissions(pending) →
// worker 领取/执行/写回 → getResult 轮询。队列语义不依赖 leetcode 仓库；
// 端到端（真实编译执行）沿用 judge.test.ts 的 hasRepo 跳过模式。
// ---------------------------------------------------------------------------

async function dbAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

const repo53 = path.join(env.LEETCODE_REPO_DIR, "solution/0001-0100/53_最大子数组和.md");
const hasRepo = existsSync(repo53);

const available = await dbAvailable();
const run = available ? describe : describe.skip;
const runE2E = available && hasRepo ? describe : describe.skip;

const TEST_USER = 987_654_325;

async function cleanupSubmissions() {
  await db.delete(submissions).where(eq(submissions.userId, TEST_USER));
  await db.delete(usageQuotas).where(eq(usageQuotas.userId, TEST_USER));
}

describe("terminalStatus 结果映射", () => {
  const base = { cases: [], total: 1 } as unknown as JudgeRunResult;
  it("compile_error → ce；全过 → ac；超时 → tle；其余 → wa", () => {
    expect(terminalStatus({ ...base, status: "compile_error", passed: 0 })).toBe("ce");
    expect(terminalStatus({ ...base, status: "ok", passed: 1 })).toBe("ac");
    expect(
      terminalStatus({
        status: "ok",
        passed: 0,
        total: 1,
        cases: [{ input: "", expected: "", actual: "", pass: false, error: "运行超时（>8s）" }],
      }),
    ).toBe("tle");
    expect(
      terminalStatus({
        status: "ok",
        passed: 0,
        total: 1,
        cases: [{ input: "", expected: "", actual: "1", pass: false, error: null }],
      }),
    ).toBe("wa");
  });
});

run("队列领取语义（集成）", () => {
  it("FIFO 领取 + 条件抢占 + 队列空返回 null", async () => {
    await cleanupSubmissions();
    const inserted = await db
      .insert(submissions)
      .values([
        { userId: TEST_USER, problemId: "1", language: "cpp", code: "x", status: "pending" },
        { userId: TEST_USER, problemId: "2", language: "python", code: "y", status: "pending" },
      ])
      .$returningId();

    try {
      const first = await claimNextSubmission();
      expect(first?.id).toBe(inserted[0].id);
      expect(first?.status).toBe("running");
      expect(first?.startedAt).not.toBeNull();

      const second = await claimNextSubmission();
      expect(second?.id).toBe(inserted[1].id);

      // 队列耗尽
      expect(await claimNextSubmission()).toBeNull();

      // 已被领取的行不会被重复领取（条件 UPDATE 抢占）
      const reClaim = await db
        .update(submissions)
        .set({ status: "running", startedAt: new Date() })
        .where(and(eq(submissions.id, inserted[0].id), eq(submissions.status, "pending")));
      expect(Number(reClaim[0].affectedRows)).toBe(0);
    } finally {
      await cleanupSubmissions();
    }
  });

  it("崩溃恢复：running 重置为 pending", async () => {
    await cleanupSubmissions();
    await db.insert(submissions).values([
      { userId: TEST_USER, problemId: "1", language: "cpp", code: "x", status: "running" },
      { userId: TEST_USER, problemId: "2", language: "cpp", code: "y", status: "pending" },
    ]);
    await recoverOrphaned();
    const rows = await db.select().from(submissions).where(eq(submissions.userId, TEST_USER));
    try {
      expect(rows.every((r) => r.status === "pending")).toBe(true);
    } finally {
      await cleanupSubmissions();
    }
  });

  it("执行异常兜底 ie（不存在的题目）", async () => {
    await cleanupSubmissions();
    const inserted = await db
      .insert(submissions)
      .values({ userId: TEST_USER, problemId: "99999999", language: "cpp", code: "x", status: "running" })
      .$returningId();
    await executeSubmission(
      (await db.select().from(submissions).where(eq(submissions.id, inserted[0].id)).limit(1))[0]!,
    );
    const row = (await db.select().from(submissions).where(eq(submissions.id, inserted[0].id)).limit(1))[0]!;
    expect(row.status).toBe("ie");
    expect((row.verdictDetail as { error?: string }).error).toBeTruthy();
    expect(row.runtimeMs).not.toBeNull();
    await cleanupSubmissions();
  });
});

runE2E("submit → worker → getResult 端到端（53 最大子数组和）", () => {
  const caller = appRouter.createCaller({ userId: TEST_USER });

  async function seedQuestion(): Promise<number> {
    const md = await readFile(repo53, "utf8");
    const inserted = await db
      .insert(questions)
      .values({
        userId: TEST_USER,
        category: "leetcode",
        title: "[测试] 53. 最大子数组和",
        content: md,
        difficulty: "medium",
        sourceKey: "leetcode:solution/0001-0100/53_最大子数组和.md",
        followUps: [],
      })
      .$returningId();
    return inserted[0].id;
  }

  /** 提交并等 worker 跑完，返回终态 getResult */
  async function submitAndDrain(questionId: number, code: string) {
    const { submissionId } = await caller.judge.submit({ questionId, language: "cpp", code });
    const pending = (await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1))[0]!;
    expect(pending.status).toBe("pending");
    await executeSubmission((await claimNextSubmission())!);
    return caller.judge.getResult({ submissionId });
  }

  it("参考代码 AC、错误答案 WA、编译错误 CE", async () => {
    await cleanupSubmissions();
    await db
      .delete(questions)
      .where(and(eq(questions.userId, TEST_USER), eq(questions.sourceKey, "leetcode:solution/0001-0100/53_最大子数组和.md")));
    const questionId = await seedQuestion();
    try {
      const reference = extractReferenceCode(await readFile(repo53, "utf8"), "cpp")!;

      const ac = await submitAndDrain(questionId, reference);
      expect(ac.status).toBe("ac");
      expect(ac.verdictDetail).toMatchObject({ status: "ok" });
      expect((ac.verdictDetail as { passed: number; total: number }).passed)
        .toBe((ac.verdictDetail as { passed: number; total: number }).total);
      expect(ac.runtimeMs).toBeGreaterThan(0);

      const wa = await submitAndDrain(
        questionId,
        "class Solution { public: int maxSubArray(vector<int>& nums) { return 0; } };",
      );
      expect(wa.status).toBe("wa");

      const ce = await submitAndDrain(questionId, "this is not c++");
      expect(ce.status).toBe("ce");
      expect((ce.verdictDetail as { compileError?: string }).compileError).toBeTruthy();

      // 用户隔离：他人读不到我的提交
      const other = appRouter.createCaller({ userId: TEST_USER + 1 });
      const mine = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.userId, TEST_USER))
        .limit(1);
      await expect(other.judge.getResult({ submissionId: mine[0].id })).rejects.toThrow();
    } finally {
      await cleanupSubmissions();
      await db
        .delete(questions)
        .where(and(eq(questions.userId, TEST_USER), eq(questions.sourceKey, "leetcode:solution/0001-0100/53_最大子数组和.md")));
    }
  }, 60_000);
});
