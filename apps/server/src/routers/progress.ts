import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  DIFFICULTY_WEIGHTS,
  GRADE_SCORES,
  MASTERY_WEIGHTS,
  progressMarkSchema,
  type Difficulty,
  type Grade,
  type KnowledgePointMastery,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import { contents, interviewSessions, problems, questions, userProgress } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";

export const progressRouter = router({
  /** 进度标记（seen / mastered / ac），每用户 × 每内容一行，upsert 幂等 */
  mark: authedProcedure.input(progressMarkSchema).mutation(async ({ input, ctx }) => {
    const exists = await db
      .select({ id: contents.id })
      .from(contents)
      .where(eq(contents.id, input.contentId))
      .limit(1);
    if (!exists[0]) throw new TRPCError({ code: "NOT_FOUND", message: "内容不存在" });

    await db
      .insert(userProgress)
      .values({
        userId: ctx.userId,
        contentId: input.contentId,
        status: input.status,
        score: input.score ?? null,
        lastAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          status: input.status,
          ...(input.score != null ? { score: input.score } : {}),
          lastAt: new Date(),
        },
      });
    return { ok: true as const };
  }),

  /**
   * Dashboard 聚合：学习路径进度 + 刷题统计 + 掌握度雷达（03 掌握度模型：
   * 0.2×学习信号 + 0.5×刷题信号（难度加权）+ 0.3×面试信号，无数据的信号按 0 计）。
   */
  overview: authedProcedure.query(async ({ ctx }) => {
    const [contentRows, problemRows, progressRows, sessionRows] = await Promise.all([
      db
        .select({
          id: contents.id,
          type: contents.type,
          knowledgePoints: contents.knowledgePoints,
        })
        .from(contents)
        .where(eq(contents.status, "active")),
      db.select({ id: problems.id, difficulty: problems.difficulty }).from(problems),
      db
        .select({ contentId: userProgress.contentId, status: userProgress.status })
        .from(userProgress)
        .where(eq(userProgress.userId, ctx.userId)),
      db
        .select({
          id: interviewSessions.id,
          overallGrade: interviewSessions.overallGrade,
          questionIds: interviewSessions.questionIds,
        })
        .from(interviewSessions)
        .where(and(eq(interviewSessions.userId, ctx.userId), eq(interviewSessions.status, "finished")))
        .orderBy(desc(interviewSessions.createdAt)),
    ]);

    const progressById = new Map(progressRows.map((r) => [r.contentId, r.status] as const));

    // ---- 学习路径进度（learn 类内容）----
    const learnRows = contentRows.filter((c) => c.type !== "problem");
    const seenOrMastered = (id: string) => {
      const s = progressById.get(id);
      return s === "seen" || s === "mastered";
    };
    const learning = {
      total: learnRows.length,
      seen: learnRows.filter((c) => seenOrMastered(c.id)).length,
      mastered: learnRows.filter((c) => progressById.get(c.id) === "mastered").length,
    };

    // ---- 刷题统计（按难度分桶）----
    const activeProblemIds = new Set(
      contentRows.filter((c) => c.type === "problem").map((c) => c.id),
    );
    const liveProblems = problemRows.filter((p) => activeProblemIds.has(p.id));
    const byDifficulty = Object.fromEntries(
      (["easy", "medium", "hard"] as Difficulty[]).map((d) => {
        const bucket = liveProblems.filter((p) => p.difficulty === d);
        return [d, { total: bucket.length, ac: bucket.filter((p) => progressById.get(p.id) === "ac").length }];
      }),
    );
    const practice = {
      total: liveProblems.length,
      ac: liveProblems.filter((p) => progressById.get(p.id) === "ac").length,
      byDifficulty,
    };

    // ---- 面试信号：每个知识点取最近一次相关场次的等级归一化 ----
    const questionIds = [...new Set(sessionRows.flatMap((s) => s.questionIds))];
    const questionRows =
      questionIds.length > 0
        ? await db
            .select({ id: questions.id, knowledgePoints: questions.knowledgePoints })
            .from(questions)
            .where(inArray(questions.id, questionIds))
        : [];
    const kpByQuestionId = new Map(
      questionRows.map((q) => [q.id, q.knowledgePoints ?? []] as const),
    );
    const interviewSignal = new Map<string, number>();
    for (const s of sessionRows) {
      const grade = GRADE_SCORES[(s.overallGrade ?? "") as Grade];
      if (!grade) continue;
      for (const qid of s.questionIds) {
        for (const kp of kpByQuestionId.get(qid) ?? []) {
          // 场次按时间倒序遍历，首次出现即最近
          if (!interviewSignal.has(kp)) interviewSignal.set(kp, grade / 4);
        }
      }
    }

    // ---- 掌握度雷达：知识点全集 = 内容标签 ∪ 面试题标签 ----
    const problemDifficulty = new Map(liveProblems.map((p) => [p.id, p.difficulty] as const));
    const learnAgg = new Map<string, { done: number; total: number }>();
    const problemAgg = new Map<string, { acWeight: number; totalWeight: number }>();
    for (const c of contentRows) {
      for (const kp of c.knowledgePoints) {
        if (c.type === "problem") {
          const w = DIFFICULTY_WEIGHTS[problemDifficulty.get(c.id) ?? "easy"];
          const agg = problemAgg.get(kp) ?? { acWeight: 0, totalWeight: 0 };
          agg.totalWeight += w;
          if (progressById.get(c.id) === "ac") agg.acWeight += w;
          problemAgg.set(kp, agg);
        } else {
          const agg = learnAgg.get(kp) ?? { done: 0, total: 0 };
          agg.total += 1;
          if (seenOrMastered(c.id)) agg.done += 1;
          learnAgg.set(kp, agg);
        }
      }
    }

    const kpUniverse = new Set([...learnAgg.keys(), ...problemAgg.keys(), ...interviewSignal.keys()]);
    const mastery: KnowledgePointMastery[] = [...kpUniverse].map((kp) => {
      const l = learnAgg.get(kp);
      const p = problemAgg.get(kp);
      const learnSignal = l && l.total > 0 ? l.done / l.total : null;
      const problemSignal = p && p.totalWeight > 0 ? p.acWeight / p.totalWeight : null;
      const ivSignal = interviewSignal.get(kp) ?? null;
      return {
        knowledgePoint: kp,
        mastery:
          MASTERY_WEIGHTS.learn * (learnSignal ?? 0) +
          MASTERY_WEIGHTS.problem * (problemSignal ?? 0) +
          MASTERY_WEIGHTS.interview * (ivSignal ?? 0),
        signals: { learn: learnSignal, problem: problemSignal, interview: ivSignal },
      };
    });
    mastery.sort((a, b) => a.mastery - b.mastery);

    return { learning, practice, mastery };
  }),
});
