import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { _resetUserCache, getCurrentUserId } from "../auth.js";
import { appRouter } from "./index.js";
import { contents, problems, questions } from "../db/schema.js";

/**
 * 面试状态机集成测试：需要可连接的 MySQL（DATABASE_URL）。
 * 无 DB 环境时整体跳过。LLM 调用通过 stub fetch mock（纯 LLM 模式，无规则引擎）。
 */

// mock 评估等级（可变）：C/D 触发薄弱点推导（interview_reports.weak_points + 报告推荐链接）
const mockState = { evalGrade: "B" as "A" | "B" | "C" | "D" };

// mock OpenAI 兼容 /chat/completions：按 system prompt 区分开场/追问/评估
vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    messages?: Array<{ role: string; content: string }>;
  };
  const system = body.messages?.find((m) => m.role === "system")?.content ?? "";
  const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
  let content: string;
  if (system.includes("结构化评估")) {
    const ids = [...user.matchAll(/questionId=(\d+)/g)].map((m) => Number(m[1]));
    content = JSON.stringify({
      overallGrade: mockState.evalGrade,
      summary: "mock 总评",
      questions: ids.map((questionId) => ({
        questionId,
        dimensions: [{ name: "综合", grade: mockState.evalGrade }],
        diagnosis: "mock 诊断",
        suggestion: "mock 建议",
        answers: ["mock 参考答案"],
      })),
      weakDimensions: [],
    });
  } else if (system.includes("抛出一道新题")) {
    content = "请谈谈你对这个知识点的理解。";
  } else {
    content = "能再展开讲讲细节吗？";
  }
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
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

run("interview 状态机（集成）", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let questionIds: number[] = [];

  beforeAll(async () => {
    _resetUserCache();
    const userId = await getCurrentUserId();
    caller = appRouter.createCaller({ userId });
    // 清空该用户数据，避免种子/同步数据干扰
    await caller.question.seed();
    const { items } = await caller.question.list({ page: 1, pageSize: 100 });
    questionIds = items.map((q) => q.id);
    expect(questionIds.length).toBeGreaterThan(0);
  });

  it("start → reply×N → 自动 finish → 报告", async () => {
    const start = await caller.interview.start({ categories: ["knowledge", "leetcode"], count: 2 });
    expect(start.state.status).toBe("active");
    expect(start.state.totalQuestions).toBe(2);
    expect(start.messages).toHaveLength(1);
    expect(start.messages[0].role).toBe("interviewer");
    expect(start.messages[0].content).toContain("第一题");

    let state = start.state;
    let rounds = 0;
    while (state.status === "active" && rounds < 50) {
      const r = await caller.interview.reply({
        sessionId: state.sessionId,
        content: "这是我的回答，包含 bank、warp、padding 等要点，尽量写长一点以覆盖表达分。".repeat(3),
      });
      state = r.state;
      rounds += 1;
      expect(r.interviewerMessage.length).toBeGreaterThan(0);
    }
    expect(state.status).toBe("finished");
    expect(rounds).toBeGreaterThanOrEqual(2); // 每题至少主问题 1 轮

    const detail = await caller.interview.get({ sessionId: state.sessionId });
    expect(detail.report?.report).toBeTruthy();
    expect(detail.report?.report).toContain("面试评估报告");
    expect(detail.session.overallGrade).toMatch(/^[ABCD]$/);
    expect(detail.messages.filter((m) => m.role === "candidate").length).toBe(rounds);
  }, 30_000);

  it("断点恢复：get 返回完整消息与状态", async () => {
    const start = await caller.interview.start({ categories: ["leetcode"], count: 1 });
    await caller.interview.reply({ sessionId: start.state.sessionId, content: "回答一" });
    const detail = await caller.interview.get({ sessionId: start.state.sessionId });
    expect(detail.session.currentIndex).toBe(0);
    expect(detail.session.followUpIndex).toBeGreaterThanOrEqual(1);
    expect(detail.messages.filter((m) => m.role === "candidate")).toHaveLength(1);
    await caller.interview.finish({ sessionId: start.state.sessionId });
  }, 30_000);

  it("空方向题库报 PRECONDITION_FAILED", async () => {
    // 先清空 knowledge 方向制造空题库场景（beforeAll 的 seed 幂等，下次运行会自动补回）
    const { items } = await caller.question.list({ category: "knowledge", page: 1, pageSize: 100 });
    for (const q of items) await caller.question.remove({ id: q.id });
    await expect(caller.interview.start({ categories: ["knowledge"], count: 1 })).rejects.toThrow();
  });

  it("报告拆表 + 薄弱点 → 学习/练习推荐链接（weak_points 映射）", async () => {
    // 场景：C 评级题目挂 knowledge_points，contents/problems 侧有同标签内容 → 报告出现链接。
    // start 随机抽题，故对本方向全部题目统一打标，finally 恢复 NULL。
    const KP = "zz-interview-kp";
    const { items } = await caller.question.list({ category: "leetcode", page: 1, pageSize: 100 });
    expect(items.length).toBeGreaterThan(0);
    const leetcodeIds = items.map((q) => q.id);
    await db
      .update(questions)
      .set({ knowledgePoints: [KP] })
      .where(inArray(questions.id, leetcodeIds));

    await db.insert(contents).values([
      {
        id: "learn:zz-interview",
        type: "learn",
        title: "测试-薄弱点对应学习章节",
        tags: [],
        knowledgePoints: [KP],
        url: "/learn/zz-interview",
        contentHash: "zz-interview-hash-1",
      },
      {
        id: "lc:zz-interview",
        type: "problem",
        title: "测试-薄弱点对应练习题",
        tags: [],
        knowledgePoints: [KP],
        url: "/problems/zz-interview",
        contentHash: "zz-interview-hash-2",
      },
    ]);
    await db.insert(problems).values({
      id: "lc:zz-interview",
      source: "leetcode",
      number: 424242,
      difficulty: "easy",
      languages: [],
      judgeType: "none",
      testcases: [],
      externalUrl: "",
    });

    mockState.evalGrade = "C";
    try {
      const start = await caller.interview.start({ categories: ["leetcode"], count: 1 });
      let state = start.state;
      let rounds = 0;
      while (state.status === "active" && rounds < 50) {
        const r = await caller.interview.reply({
          sessionId: state.sessionId,
          content: "我 attempt 一下这个回答，思路是哈希表加一次遍历。",
        });
        state = r.state;
        rounds += 1;
      }
      expect(state.status).toBe("finished");

      // scope 快照：建场时题目 knowledge_points 并集
      expect(start.state.status).toBe("active");

      const detail = await caller.interview.get({ sessionId: state.sessionId });
      expect(detail.report).not.toBeNull();
      expect(detail.report!.weakPoints).toContain(KP);
      expect(detail.session.overallGrade).toBe("C");
      // 报告正文：专项训练建议 + 薄弱点推荐链接（学习章节与练习题）
      const text = detail.report!.report;
      expect(text).toContain("### 薄弱点 → 学习与练习");
      expect(text).toContain(`**${KP}**`);
      expect(text).toContain("[测试-薄弱点对应学习章节](/learn/zz-interview)");
      expect(text).toContain("[#424242 测试-薄弱点对应练习题](/problems/zz-interview)");
    } finally {
      mockState.evalGrade = "B";
      await db.delete(problems).where(eq(problems.id, "lc:zz-interview"));
      await db
        .delete(contents)
        .where(inArray(contents.id, ["learn:zz-interview", "lc:zz-interview"]));
      await db
        .update(questions)
        .set({ knowledgePoints: null })
        .where(inArray(questions.id, leetcodeIds));
    }
  }, 30_000);
});
