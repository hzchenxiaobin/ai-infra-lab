import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  extractReferenceCode,
  parseCppSignature,
  parseExamples,
  parsePythonSignature,
  type JudgeRunResult,
} from "@ailab/judge-core";
import type { ProblemJudgeMeta } from "@ailab/contracts";
import { db } from "../db/client.js";
import { contents, problems, submissions, usageQuotas, userProgress } from "../db/schema.js";
import { appRouter } from "../routers/index.js";
import { claimNextSubmission, executeSubmission, recoverOrphaned } from "./worker.js";

// ---------------------------------------------------------------------------
// 评测队列集成测试（dev/judge-worker.md §1/§6）：submit → submissions(pending) →
// worker 领取/执行/写回 → getResult 轮询 + AC 联动 user_progress。
// 判题数据来自 problems 表（testcases + judge_meta，judge 数据源切换后），
// fixture 解析自 content 仓库题解副本（judge-extract 的 server 侧同构实现）。
// ---------------------------------------------------------------------------

async function dbAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

const md53 = fileURLToPath(
  new URL("../../../../packages/content/problems-algo/solution/0001-0100/53_最大子数组和.md", import.meta.url),
);
const hasRepo = existsSync(md53);

const available = await dbAvailable();
const run = available ? describe : describe.skip;
const runE2E = available && hasRepo ? describe : describe.skip;

const TEST_USER = 987_654_325;
const FIXTURE_ID = "lc:zz53";

async function cleanupSubmissions() {
  await db.delete(submissions).where(eq(submissions.userId, TEST_USER));
  await db.delete(usageQuotas).where(eq(usageQuotas.userId, TEST_USER));
  await db.delete(userProgress).where(and(eq(userProgress.userId, TEST_USER), eq(userProgress.contentId, FIXTURE_ID)));
}

// terminalStatus 结果映射的测试已随评测核心迁移 @ailab/judge-core（两端同源）

run("队列领取语义（集成）", () => {
  it("FIFO 领取 + 条件抢占 + 队列空返回 null", async () => {
    await cleanupSubmissions();
    const inserted = await db
      .insert(submissions)
      .values([
        { userId: TEST_USER, problemId: "lc:zz-a", language: "cpp", code: "x", status: "pending" },
        { userId: TEST_USER, problemId: "lc:zz-b", language: "python", code: "y", status: "pending" },
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
      { userId: TEST_USER, problemId: "lc:zz-a", language: "cpp", code: "x", status: "running" },
      { userId: TEST_USER, problemId: "lc:zz-b", language: "cpp", code: "y", status: "pending" },
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
      .values({ userId: TEST_USER, problemId: "lc:zz-nope", language: "cpp", code: "x", status: "running" })
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

runE2E("submit → worker → getResult 端到端（53 最大子数组和，problems 数据源）", () => {
  const caller = appRouter.createCaller({ userId: TEST_USER });

  /** 从题解 md 构建 problems 表判题数据（content-kit judge-extract 的同构实现） */
  async function seedProblem(): Promise<void> {
    const md = await readFile(md53, "utf8");
    const cppRef = extractReferenceCode(md, "cpp")!;
    const pyRef = extractReferenceCode(md, "python")!;
    const cppSpec = parseCppSignature(cppRef)!;
    const pySpec = parsePythonSignature(pyRef)!;
    // 示例用例：题解 md 的示例 ```text 块（parseExamples 与 content-kit 同规则）
    const testcases = parseExamples(md).map(({ args, expected }) => ({ args, expected }));
    expect(testcases.length).toBeGreaterThanOrEqual(3);
    const judgeMeta: ProblemJudgeMeta = {
      methodName: cppSpec.name,
      cppAvailable: true,
      cppParams: cppSpec.params.map(({ name, type }) => ({ name, type })),
      cppReturnType: cppSpec.returnType,
      pythonAvailable: pySpec != null,
    };
    await db.delete(problems).where(eq(problems.id, FIXTURE_ID));
    await db.delete(contents).where(eq(contents.id, FIXTURE_ID));
    await db.insert(contents).values({
      id: FIXTURE_ID,
      type: "problem",
      title: "[测试] 53. 最大子数组和",
      tags: [],
      knowledgePoints: [],
      url: "/problems/algo/zz53",
      contentHash: "zz53",
    });
    await db.insert(problems).values({
      id: FIXTURE_ID,
      source: "leetcode",
      number: 53,
      difficulty: "medium",
      languages: ["cpp", "python"],
      judgeType: "internal",
      testcases,
      judgeMeta,
      externalUrl: "",
    });
  }

  /** 提交并等 worker 跑完，返回终态 getResult */
  async function submitAndDrain(language: "cpp" | "python", code: string) {
    const { submissionId } = await caller.judge.submit({ problemId: FIXTURE_ID, language, code });
    const pending = (await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1))[0]!;
    expect(pending.status).toBe("pending");
    await executeSubmission((await claimNextSubmission())!);
    return caller.judge.getResult({ submissionId });
  }

  it("参考代码 AC（联动 user_progress）、错误答案 WA、编译错误 CE", async () => {
    await cleanupSubmissions();
    await seedProblem();
    try {
      const reference = extractReferenceCode(await readFile(md53, "utf8"), "cpp")!;

      const ac = await submitAndDrain("cpp", reference);
      expect(ac.status).toBe("ac");
      expect(ac.verdictDetail).toMatchObject({ status: "ok" });
      expect((ac.verdictDetail as { passed: number; total: number }).passed)
        .toBe((ac.verdictDetail as { passed: number; total: number }).total);
      expect(ac.runtimeMs).toBeGreaterThan(0);
      // AC 联动：getResult 读到 ac 时顺手标记 user_progress
      const prog = await db
        .select()
        .from(userProgress)
        .where(and(eq(userProgress.userId, TEST_USER), eq(userProgress.contentId, FIXTURE_ID)))
        .limit(1);
      expect(prog[0]?.status).toBe("ac");

      const wa = await submitAndDrain(
        "cpp",
        "class Solution { public: int maxSubArray(vector<int>& nums) { return 0; } };",
      );
      expect(wa.status).toBe("wa");

      const ce = await submitAndDrain("cpp", "this is not c++");
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
      await db.delete(problems).where(eq(problems.id, FIXTURE_ID));
      await db.delete(contents).where(eq(contents.id, FIXTURE_ID));
    }
  }, 60_000);

  it("AC 不降级 mastered 进度", async () => {
    await cleanupSubmissions();
    await seedProblem();
    try {
      await db
        .insert(userProgress)
        .values({ userId: TEST_USER, contentId: FIXTURE_ID, status: "mastered" });
      const reference = extractReferenceCode(await readFile(md53, "utf8"), "python")!;
      const ac = await submitAndDrain("python", reference);
      expect(ac.status).toBe("ac");
      const prog = await db
        .select()
        .from(userProgress)
        .where(and(eq(userProgress.userId, TEST_USER), eq(userProgress.contentId, FIXTURE_ID)))
        .limit(1);
      expect(prog[0]?.status).toBe("mastered");
    } finally {
      await cleanupSubmissions();
      await db.delete(problems).where(eq(problems.id, FIXTURE_ID));
      await db.delete(contents).where(eq(contents.id, FIXTURE_ID));
    }
  }, 60_000);
});
