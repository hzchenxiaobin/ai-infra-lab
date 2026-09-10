import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { contents, problems, userProgress } from "../db/schema.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// problem.list / problem.facets 集成测试：MySQL 可用才跑（沿用 learn.test.ts 跳过模式）。
// 标签/知识点用 zz-test- 前缀避开真实数据，保证精确断言不受库内其他内容影响。
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

const TEST_USER = 987_654_322;

const TEST_CONTENTS = [
  {
    id: "lc:zztest1",
    type: "problem" as const,
    title: "测试题-数组哈希",
    tags: ["zz-test-array", "zz-test-hash"],
    knowledgePoints: ["zz-test-kp-tp"],
    url: "/problems/zztest1",
    contentHash: "zz-test-hash-1",
  },
  {
    id: "lc:zztest2",
    type: "problem" as const,
    title: "测试题-二分",
    tags: ["zz-test-array"],
    knowledgePoints: ["zz-test-kp-bs"],
    url: "/problems/zztest2",
    contentHash: "zz-test-hash-2",
  },
  {
    id: "gpu:zztest1",
    type: "problem" as const,
    title: "测试题-GPU",
    tags: ["zz-test-gpu"],
    knowledgePoints: ["zz-test-kp-cuda"],
    url: "/problems/gpu-zztest1",
    contentHash: "zz-test-hash-3",
  },
  {
    id: "lc:zzstale",
    type: "problem" as const,
    title: "测试题-已失效",
    tags: ["zz-test-array"],
    knowledgePoints: ["zz-test-kp-tp"],
    url: "/problems/zzstale",
    contentHash: "zz-test-hash-4",
    status: "stale" as const,
  },
];

const TEST_PROBLEMS = [
  {
    id: "lc:zztest1",
    source: "leetcode" as const,
    number: 1,
    difficulty: "easy" as const,
    languages: [] as string[],
    judgeType: "internal" as const,
    testcases: [],
    externalUrl: "",
  },
  {
    id: "lc:zztest2",
    source: "leetcode" as const,
    number: 2,
    difficulty: "medium" as const,
    languages: [] as string[],
    judgeType: "none" as const,
    testcases: [],
    externalUrl: "",
  },
  {
    id: "gpu:zztest1",
    source: "leetgpu" as const,
    number: 3,
    difficulty: "hard" as const,
    languages: [] as string[],
    judgeType: "leetgpu-com" as const,
    testcases: [],
    externalUrl: "https://leetgpu.com/p/zztest1",
  },
  {
    id: "lc:zzstale",
    source: "leetcode" as const,
    number: 4,
    difficulty: "easy" as const,
    languages: [] as string[],
    judgeType: "internal" as const,
    testcases: [],
    externalUrl: "",
  },
];

const ALL_CONTENT_IDS = TEST_CONTENTS.map((c) => c.id);

async function seed() {
  await db.delete(problems).where(inArray(problems.id, ALL_CONTENT_IDS));
  await db.delete(contents).where(inArray(contents.id, ALL_CONTENT_IDS));
  await db.delete(userProgress).where(eq(userProgress.userId, TEST_USER));
  await db.insert(contents).values(TEST_CONTENTS);
  await db.insert(problems).values(TEST_PROBLEMS);
  await db
    .insert(userProgress)
    .values({ userId: TEST_USER, contentId: "lc:zztest1", status: "ac" });
}

async function cleanup() {
  await db.delete(problems).where(inArray(problems.id, ALL_CONTENT_IDS));
  await db.delete(contents).where(inArray(contents.id, ALL_CONTENT_IDS));
  await db.delete(userProgress).where(eq(userProgress.userId, TEST_USER));
}

run("problem router（集成）", () => {
  const caller = appRouter.createCaller({ userId: TEST_USER });

  it("list：tag/knowledgePoint/judgeType 筛选与 stale 排除", async () => {
    await seed();
    try {
      const byTag = await caller.problem.list({ source: "leetcode", tag: "zz-test-array", page: 1, pageSize: 50 });
      expect(byTag.total).toBe(2);
      expect(byTag.items.map((i) => i.id).sort()).toEqual(["lc:zztest1", "lc:zztest2"]);

      const byKp = await caller.problem.list({
        source: "leetcode",
        knowledgePoint: "zz-test-kp-bs",
        page: 1,
        pageSize: 50,
      });
      expect(byKp.total).toBe(1);
      expect(byKp.items[0].id).toBe("lc:zztest2");

      const byJudge = await caller.problem.list({
        source: "leetcode",
        tag: "zz-test-array",
        judgeType: "internal",
        page: 1,
        pageSize: 50,
      });
      expect(byJudge.total).toBe(1);
      expect(byJudge.items[0].id).toBe("lc:zztest1");

      const solved = await caller.problem.list({
        source: "leetcode",
        tag: "zz-test-array",
        solved: true,
        page: 1,
        pageSize: 50,
      });
      expect(solved.total).toBe(1);
      expect(solved.items[0].id).toBe("lc:zztest1");
      expect(solved.items[0].ac).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("facets：按分区枚举标签/知识点并计数，stale 排除", async () => {
    await seed();
    try {
      const leetcode = await caller.problem.facets({ source: "leetcode" });
      const arrayTag = leetcode.tags.find((t) => t.value === "zz-test-array");
      expect(arrayTag?.count).toBe(2);
      expect(leetcode.tags.some((t) => t.value === "zz-test-gpu")).toBe(false);
      expect(leetcode.knowledgePoints.find((k) => k.value === "zz-test-kp-tp")?.count).toBe(1);

      const all = await caller.problem.facets({});
      expect(all.tags.find((t) => t.value === "zz-test-gpu")?.count).toBe(1);
      expect(all.knowledgePoints.find((k) => k.value === "zz-test-kp-cuda")?.count).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
