import { describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { interviewNotes } from "../db/schema.js";
import { appRouter } from "./index.js";

// ---------------------------------------------------------------------------
// note router 集成测试：MySQL 可用才跑（沿用 progress.test.ts 跳过模式）。
// 覆盖 CRUD 与用户隔离。
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

const TEST_USER = 987_654_331;
const OTHER_USER = TEST_USER + 1;

async function cleanup() {
  await db
    .delete(interviewNotes)
    .where(inArray(interviewNotes.userId, [TEST_USER, OTHER_USER]));
}

run("note router（集成）", () => {
  it("create/list/update/remove 全链路 + 用户隔离", async () => {
    await cleanup();
    try {
      const caller = appRouter.createCaller({ userId: TEST_USER });
      const other = appRouter.createCaller({ userId: OTHER_USER });

      const { id } = await caller.note.create({
        title: "第一次模拟面试复盘",
        content: "## 过程\n- 手写 attention 还行\n## 反思\n- CUDA 内存对齐忘了",
      });

      let list = await caller.note.list();
      expect(list).toHaveLength(1);
      expect(list[0].title).toBe("第一次模拟面试复盘");
      expect(list[0].content).toContain("## 反思");

      // 更新
      await caller.note.update({ id, data: { title: "复盘（修订）" } });
      list = await caller.note.list();
      expect(list[0].title).toBe("复盘（修订）");
      expect(list[0].content).toContain("## 过程");

      // 用户隔离：他人不可见、不可改、不可删
      expect(await other.note.list()).toHaveLength(0);
      await expect(other.note.update({ id, data: { title: "x" } })).rejects.toThrow();
      await expect(other.note.remove({ id })).rejects.toThrow();
      expect((await caller.note.list())).toHaveLength(1);

      // 删除
      await caller.note.remove({ id });
      expect(await caller.note.list()).toHaveLength(0);
      await expect(caller.note.remove({ id })).rejects.toThrow();
    } finally {
      await cleanup();
    }
  });
});
