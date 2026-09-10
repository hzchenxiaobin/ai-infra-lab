import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { contents, interviewSessions, problems, userProgress } from "../db/schema.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// progress.overview 集成测试：MySQL 可用才跑（沿用 learn.test.ts 跳过模式）。
// 覆盖学习/刷题统计、三路信号掌握度与连续活跃天数（streakDays）。
// ---------------------------------------------------------------------------

async function dbAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

const available = await dbAvailable();
const run = available ? describe : describe.skip;

const TEST_USER = 987_654_323;
const DAY_MS = 86_400_000;

const TEST_CONTENTS = [
  {
    id: "lc:zzprog1",
    type: "problem" as const,
    title: "测试题-掌握度",
    tags: ["zz-prog-array"],
    knowledgePoints: ["zz-prog-kp-tp"],
    url: "/problems/zzprog1",
    contentHash: "zz-prog-hash-1",
  },
  {
    id: "gpu:zzprog1",
    type: "problem" as const,
    title: "测试题-GPU 掌握度",
    tags: ["zz-prog-gpu"],
    knowledgePoints: ["zz-prog-kp-cuda"],
    url: "/problems/gpu-zzprog1",
    contentHash: "zz-prog-hash-2",
  },
  {
    id: "learn:zzprog1",
    type: "learn" as const,
    title: "测试教程-掌握度",
    tags: ["zz-prog-learn"],
    knowledgePoints: ["zz-prog-kp-learn"],
    url: "/learn/zzprog1",
    contentHash: "zz-prog-hash-3",
  },
];

const TEST_PROBLEMS = [
  {
    id: "lc:zzprog1",
    source: "leetcode" as const,
    number: 1,
    difficulty: "easy" as const,
    languages: [] as string[],
    judgeType: "internal" as const,
    testcases: [],
    externalUrl: "",
  },
  {
    id: "gpu:zzprog1",
    source: "leetgpu" as const,
    number: 2,
    difficulty: "hard" as const,
    languages: [] as string[],
    judgeType: "leetgpu-com" as const,
    testcases: [],
    externalUrl: "",
  },
];

const ALL_CONTENT_IDS = TEST_CONTENTS.map((c) => c.id);

async function seed() {
  await db.delete(problems).where(inArray(problems.id, ALL_CONTENT_IDS));
  await db.delete(contents).where(inArray(contents.id, ALL_CONTENT_IDS));
  await db.delete(userProgress).where(eq(userProgress.userId, TEST_USER));
  await db.delete(interviewSessions).where(eq(interviewSessions.userId, TEST_USER));

  await db.insert(contents).values(TEST_CONTENTS);
  await db.insert(problems).values(TEST_PROBLEMS);
  await db.insert(userProgress).values([
    // 今天：算法题 AC + 一场面试 → 计入 streak
    { userId: TEST_USER, contentId: "lc:zzprog1", status: "ac", lastAt: new Date() },
    // 昨天：学习内容 seen + GPU 题 AC → streak 往前多一天
    { userId: TEST_USER, contentId: "learn:zzprog1", status: "seen", lastAt: new Date(Date.now() - DAY_MS) },
    { userId: TEST_USER, contentId: "gpu:zzprog1", status: "ac", lastAt: new Date(Date.now() - DAY_MS) },
  ]);
  await db.insert(interviewSessions).values({
    userId: TEST_USER,
    title: "测试场次",
    categories: ["leetcode"],
    questionIds: [],
    status: "active",
  });
}

async function cleanup() {
  await db.delete(problems).where(inArray(problems.id, ALL_CONTENT_IDS));
  await db.delete(contents).where(inArray(contents.id, ALL_CONTENT_IDS));
  await db.delete(userProgress).where(eq(userProgress.userId, TEST_USER));
  await db.delete(interviewSessions).where(eq(interviewSessions.userId, TEST_USER));
}

run("progress.overview（集成）", () => {
  it("刷题/学习统计、三路信号掌握度与连续活跃天数", async () => {
    await seed();
    try {
      const caller = appRouter.createCaller({ userId: TEST_USER });
      const data = await caller.progress.overview();

      // 学习：至少覆盖 seed 的 1 篇（库内可能有其他内容，只做下界断言）
      expect(data.learning.seen).toBeGreaterThanOrEqual(1);

      // 刷题：easy/hard 各至少 1 题 AC（难度分桶正确）
      expect(data.practice.byDifficulty.easy.ac).toBeGreaterThanOrEqual(1);
      expect(data.practice.byDifficulty.hard.ac).toBeGreaterThanOrEqual(1);

      // streak：今天 + 昨天 = 2
      expect(data.streakDays).toBe(2);

      // 掌握度：纯刷题信号的知识点 = 0.5（0.2×0 + 0.5×1 + 0.3×0）
      const tp = data.mastery.find((m) => m.knowledgePoint === "zz-prog-kp-tp");
      expect(tp).toBeDefined();
      expect(tp!.signals.problem).toBe(1);
      expect(tp!.signals.learn).toBeNull();
      expect(tp!.signals.interview).toBeNull();
      expect(tp!.mastery).toBeCloseTo(0.5, 10);

      // 掌握度：纯学习信号的知识点 = 0.2
      const learn = data.mastery.find((m) => m.knowledgePoint === "zz-prog-kp-learn");
      expect(learn).toBeDefined();
      expect(learn!.signals.learn).toBe(1);
      expect(learn!.mastery).toBeCloseTo(0.2, 10);

      // 排序：薄弱在前（0.2 < 0.5）
      expect(data.mastery.indexOf(learn!)).toBeLessThan(data.mastery.indexOf(tp!));

      // 用户隔离：另一用户视角 streak 为 0、同知识点的刷题信号归零（掌握度 0）
      const other = await appRouter.createCaller({ userId: TEST_USER + 1 }).progress.overview();
      expect(other.streakDays).toBe(0);
      const otherTp = other.mastery.find((m) => m.knowledgePoint === "zz-prog-kp-tp");
      expect(otherTp?.signals.problem).toBe(0);
      expect(otherTp?.mastery).toBe(0);
    } finally {
      await cleanup();
    }
  });
});
