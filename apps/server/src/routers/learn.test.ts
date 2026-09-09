import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { contents, userProgress } from "../db/schema.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// learn.overview / search.query 集成测试：MySQL 可用才跑（沿用 auth.test.ts 跳过模式）。
// learn 用临时 contents + user_progress 行验证；search 直接查 content-kit 真实索引产物。
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

const TEST_USER = 987_654_321;
const TEST_CONTENTS = [
  {
    id: "learn:w99d01",
    type: "learn" as const,
    title: "测试周 Day 1",
    tags: ["test"],
    knowledgePoints: ["gpu-execution-model"],
    url: "/learn/week99/day1",
    contentHash: "test-hash-1",
  },
  {
    id: "learn:w99d02",
    type: "learn" as const,
    title: "测试周 Day 2",
    tags: ["test"],
    knowledgePoints: ["gpu-execution-model"],
    url: "/learn/week99/day2",
    contentHash: "test-hash-2",
  },
  {
    id: "learn:w99",
    type: "learn" as const,
    title: "测试周根页",
    tags: ["test"],
    knowledgePoints: ["gpu-execution-model"],
    url: "/learn/week99",
    contentHash: "test-hash-3",
  },
  {
    id: "learn:topic:test-topic",
    type: "learn" as const,
    title: "测试专题",
    tags: ["test"],
    knowledgePoints: ["profiling"],
    url: "/learn/topics/test-topic",
    contentHash: "test-hash-4",
  },
  {
    id: "learn:topic:test-topic:d1",
    type: "learn" as const,
    title: "测试专题 Day 1",
    tags: ["test"],
    knowledgePoints: ["profiling"],
    url: "/learn/topics/test-topic/day1",
    contentHash: "test-hash-5",
  },
];

run("learn.overview（集成）", () => {
  const caller = appRouter.createCaller({ userId: TEST_USER });

  it("周/专题结构正确且进度按用户隔离", async () => {
    await db.delete(contents).where(inArray(contents.id, TEST_CONTENTS.map((c) => c.id)));
    await db.delete(userProgress).where(eq(userProgress.userId, TEST_USER));
    await db.insert(contents).values(TEST_CONTENTS);
    await db
      .insert(userProgress)
      .values({ userId: TEST_USER, contentId: "learn:w99d01", status: "seen" });

    const data = await caller.learn.overview();
    const week = data.weeks.find((w) => w.week === 99);
    expect(week).toBeDefined();
    expect(week!.title).toBe("测试周根页");
    expect(week!.days).toHaveLength(2);
    expect(week!.seenDays).toBe(1);
    expect(week!.days.find((d) => d.day === 1)?.status).toBe("seen");
    expect(week!.days.find((d) => d.day === 2)?.status).toBe("unseen");

    const topic = data.topics.find((t) => t.slug === "test-topic");
    expect(topic).toBeDefined();
    expect(topic!.totalDays).toBe(1);
    expect(topic!.seenDays).toBe(0);

    // 无进度的用户视角：seenDays 归零（用户隔离）
    const other = await appRouter.createCaller({ userId: TEST_USER + 1 }).learn.overview();
    expect(other.weeks.find((w) => w.week === 99)?.seenDays).toBe(0);

    await db.delete(contents).where(inArray(contents.id, TEST_CONTENTS.map((c) => c.id)));
    await db.delete(userProgress).where(eq(userProgress.userId, TEST_USER));
  });
});

run("search.query（集成）", () => {
  const caller = appRouter.createCaller({ userId: TEST_USER });

  it("标题命中排在摘要命中前；type 过滤生效", async () => {
    const data = await caller.search.query({ q: "FlashAttention", limit: 10 });
    expect(data.total).toBeGreaterThan(0);
    const scores = data.items.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(data.items[0].score).toBeGreaterThanOrEqual(3);

    const typed = await caller.search.query({ q: "二叉树", type: "problem", limit: 5 });
    expect(typed.items.every((i) => i.type === "problem")).toBe(true);
  });

  it("无命中返回空列表", async () => {
    const data = await caller.search.query({ q: "zzz-不存在的关键词-zzz" });
    expect(data.total).toBe(0);
    expect(data.items).toHaveLength(0);
  });
});
