import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { contents, problemLists, problems, users } from "../db/schema.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// content router 集成测试（dev/server.md §7）：list 筛选/分页 + get + import
// 幂等入库（insert/update/unchanged/stale + problems upsert）。
// import 走 adminProcedure：造一个 email 在 ADMIN_EMAILS（vitest 注入
// test-admin@ailab.test）的用户充任管理员（2026-09-11 收紧后 email=NULL
// 的遗留形态不再天然是 admin）。
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = "test-admin@ailab.test";

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

const TEST_IDS = ["lc:zzc1", "lc:zzc2", "gpu:zzc1"];

async function cleanup() {
  await db.delete(problems).where(inArray(problems.id, TEST_IDS));
  await db.delete(contents).where(inArray(contents.id, TEST_IDS));
  await db.delete(problemLists).where(eq(problemLists.id, "lc:list:zz-content"));
}

async function adminCaller() {
  // 上次异常中断可能残留同邮箱行（email 唯一约束），先清
  await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
  const inserted = await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, name: "content-test-admin", emailVerified: 1 })
    .$returningId();
  const userId = inserted[0].id;
  try {
    // 确认该用户具备 admin（ADMIN_EMAILS 命中）
    await appRouter.createCaller({ userId }).content.list({ pageSize: 1 });
  } catch (err) {
    await db.delete(users).where(eq(users.id, userId));
    throw err;
  }
  return { userId, caller: appRouter.createCaller({ userId }) };
}

run("content router（集成）", () => {
  it("list：tag/knowledgePoint/type/搜索筛选与分页", async () => {
    await cleanup();
    await db.insert(contents).values([
      {
        id: "lc:zzc1",
        type: "problem",
        title: "测试内容-数组",
        tags: ["zz-c-array"],
        knowledgePoints: ["zz-c-kp-tp"],
        url: "/p/1",
        contentHash: "zz-c-1",
      },
      {
        id: "gpu:zzc1",
        type: "problem",
        title: "测试内容-GPU",
        tags: ["zz-c-gpu"],
        knowledgePoints: ["zz-c-kp-cuda"],
        url: "/p/2",
        contentHash: "zz-c-2",
      },
    ]);
    try {
      const { userId, caller } = await adminCaller();
      try {
        const byTag = await caller.content.list({ tag: "zz-c-array", pageSize: 50 });
        expect(byTag.total).toBe(1);
        expect(byTag.items[0].id).toBe("lc:zzc1");

        const byKp = await caller.content.list({ knowledgePoint: "zz-c-kp-cuda", pageSize: 50 });
        expect(byKp.total).toBe(1);
        expect(byKp.items[0].id).toBe("gpu:zzc1");

        const bySearch = await caller.content.list({ search: "GPU", pageSize: 50 });
        expect(bySearch.items.map((i) => i.id)).toContain("gpu:zzc1");
        expect(bySearch.items.map((i) => i.id)).not.toContain("lc:zzc1");

        const paged = await caller.content.list({ tag: "zz-c-array", pageSize: 1, page: 1 });
        expect(paged.items).toHaveLength(1);
        expect(paged.pageSize).toBe(1);
      } finally {
        await db.delete(users).where(eq(users.id, userId));
      }
    } finally {
      await cleanup();
    }
  });

  it("get：命中与 NOT_FOUND", async () => {
    await cleanup();
    await db.insert(contents).values({
      id: "lc:zzc1",
      type: "problem",
      title: "测试内容-数组",
      tags: [],
      knowledgePoints: [],
      url: "",
      contentHash: "zz-c-1",
    });
    const { userId, caller } = await adminCaller();
    try {
      const hit = await caller.content.get({ id: "lc:zzc1" });
      expect(hit.content.title).toBe("测试内容-数组");
      await expect(caller.content.get({ id: "lc:zzc-nope" })).rejects.toThrow();
    } finally {
      await cleanup();
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("import：幂等 upsert + 源消失标 stale + problems 子集入库", async () => {
    await cleanup();
    const { userId, caller } = await adminCaller();
    try {
      const item = (hash: string) => ({
        id: "lc:zzc1",
        type: "problem" as const,
        title: "导入题",
        tags: ["zz-c-import"],
        knowledgePoints: ["zz-c-kp-tp"],
        url: "/p/import",
        contentHash: hash,
      });
      const problem = {
        id: "lc:zzc1",
        source: "leetcode" as const,
        number: 42,
        difficulty: "easy" as const,
        languages: ["cpp"],
        judgeType: "internal" as const,
        testcases: [],
        externalUrl: "",
      };
      const list = (hash: string, problemIds: string[]) => ({
        id: "lc:list:zz-content",
        title: "导入题单",
        url: "/problems/lists/zz-test",
        problemIds,
        contentHash: hash,
      });

      const first = await caller.content.import({
        contents: [item("h1")],
        problems: [problem],
        lists: [list("l1", ["lc:zzc1"])],
      });
      expect(first.inserted).toBe(1);
      expect(first.problemsUpserted).toBe(1);
      expect(first.listsUpserted).toBe(1);
      const l1 = (
        await db.select().from(problemLists).where(eq(problemLists.id, "lc:list:zz-content")).limit(1)
      )[0]!;
      expect(l1.title).toBe("导入题单");
      expect(l1.problemIds).toEqual(["lc:zzc1"]);

      const again = await caller.content.import({
        contents: [item("h1")],
        problems: [problem],
        lists: [list("l1", ["lc:zzc1"])],
      });
      expect(again.unchanged).toBe(1);
      expect(again.inserted).toBe(0);

      const updated = await caller.content.import({
        contents: [item("h2")],
        problems: [problem],
        lists: [list("l2", ["lc:zzc1", "lc:zzc2"])],
      });
      expect(updated.updated).toBe(1);
      const l2 = (
        await db.select().from(problemLists).where(eq(problemLists.id, "lc:list:zz-content")).limit(1)
      )[0]!;
      expect(l2.problemIds).toEqual(["lc:zzc1", "lc:zzc2"]);

      // 源里消失：只导入 zzc2，zzc1 标 stale；zzc2 带不同 hash 入库
      const staleRun = await caller.content.import({
        contents: [
          {
            id: "lc:zzc2",
            type: "learn",
            title: "导入教程",
            tags: [],
            knowledgePoints: [],
            url: "",
            contentHash: "zz-c-2",
          },
        ],
        problems: [],
      });
      expect(staleRun.stale).toBe(1);
      const rows = await db.select().from(contents).where(inArray(contents.id, TEST_IDS));
      const c1 = rows.find((r) => r.id === "lc:zzc1")!;
      expect(c1.status).toBe("stale");
      expect(c1.contentHash).toBe("h2");
      // 再导入一次 c1：stale 行按变更处理恢复 active
      expect((await caller.content.import({ contents: [item("h2")], problems: [problem] })).updated).toBe(1);
      expect(
        (await db.select().from(contents).where(eq(contents.id, "lc:zzc1")).limit(1))[0]!.status,
      ).toBe("active");

      const problemRow = (
        await db.select().from(problems).where(eq(problems.id, "lc:zzc1")).limit(1)
      )[0]!;
      expect(problemRow.judgeType).toBe("internal");
      expect(problemRow.number).toBe(42);

      // 空 contents 不误标全表
      expect((await caller.content.import({ contents: [], problems: [] })).stale).toBe(0);
    } finally {
      await cleanup();
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});
