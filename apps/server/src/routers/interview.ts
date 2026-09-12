import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  CATEGORY_LABELS,
  GRADE_SCORES,
  interviewReplySchema,
  judgeProblemIdFromSourceKey,
  MAX_FOLLOW_UPS,
  sessionIdParamSchema,
  startInterviewSchema,
  type Category,
  type EvaluationResult,
  type GroupedTranscript,
  type InterviewMessage,
  type InterviewState,
  type Question,
  type WeakPointRecommendation,
  renderReportMarkdown,
} from "@ailab/contracts";
import { db } from "../db/client.js";
import {
  contents,
  interviewMessages,
  interviewReports,
  interviewSessions,
  problems,
  questions,
} from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";
import { getInterviewer } from "../interviewer/factory.js";
import { quotaFor } from "../middleware/quota.js";
import { getReportProgress, setReportProgress, type ReportProgress } from "../reportProgress.js";

type SessionRow = typeof interviewSessions.$inferSelect;
type MessageRow = typeof interviewMessages.$inferSelect;

function toQuestion(row: typeof questions.$inferSelect): Question {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    difficulty: row.difficulty,
    tags: row.tags,
    followUps: row.followUps ?? [],
    keyPoints: row.keyPoints,
    source: row.source,
    judgeProblemId: judgeProblemIdFromSourceKey(row.sourceKey),
  };
}

function toMessage(row: MessageRow): InterviewMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    questionId: row.questionId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  };
}

async function loadSession(sessionId: number, userId: number): Promise<SessionRow> {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "场次不存在" });
  return rows[0];
}

async function loadQuestionsByIds(ids: number[]): Promise<Map<number, Question>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(questions).where(inArray(questions.id, ids));
  return new Map(rows.map((r) => [r.id, toQuestion(r)]));
}

function stateOf(session: SessionRow): InterviewState {
  return {
    sessionId: session.id,
    status: session.status,
    currentIndex: session.currentIndex,
    followUpIndex: session.followUpIndex,
    totalQuestions: session.questionIds.length,
  };
}

/** 按方向比例分配题量：每方向至少 1 题（题量允许且该方向有题时），剩余按比例 */
function allocateCounts(pool: Map<Category, number>, count: number): Map<Category, number> {
  const cats = [...pool.keys()];
  const total = [...pool.values()].reduce((a, b) => a + b, 0);
  const alloc = new Map<Category, number>();
  let remaining = count;
  for (const c of cats) {
    if (remaining <= 0) break;
    alloc.set(c, 1);
    remaining -= 1;
  }
  for (const c of cats) {
    if (remaining <= 0) break;
    const share = Math.min(
      Math.max(Math.round((pool.get(c)! / total) * count) - 1, 0),
      pool.get(c)! - alloc.get(c)!,
      remaining,
    );
    if (share > 0) {
      alloc.set(c, alloc.get(c)! + share);
      remaining -= share;
    }
  }
  // 仍有剩余则轮转补满（受各方向库存限制）
  let i = 0;
  while (remaining > 0 && i < cats.length * 10) {
    const c = cats[i % cats.length];
    if (alloc.get(c)! < pool.get(c)!) {
      alloc.set(c, alloc.get(c)! + 1);
      remaining -= 1;
    }
    i += 1;
  }
  return alloc;
}

/** 从候选题中按方向比例随机抽取 count 题（受各方向库存限制） */
function pickByCategory(
  rows: (typeof questions.$inferSelect)[],
  count: number,
): (typeof questions.$inferSelect)[] {
  const byCat = new Map<Category, typeof rows>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r);
    byCat.set(r.category, arr);
  }
  const alloc = allocateCounts(new Map([...byCat].map(([c, arr]) => [c, arr.length])), count);
  const picked: (typeof rows)[number][] = [];
  for (const [cat, n] of alloc) {
    const pool = [...byCat.get(cat)!].sort(() => Math.random() - 0.5);
    picked.push(...pool.slice(0, n));
  }
  return picked;
}

/** scope 前缀 → 展示名（"ai-infra-notes:aiinfra/daily/week1/" → "Week 1"，
 *  "ai-infra-notes:aiinfra/daily/week1/day1/" → "Week 1 Day 1"，topics/cuda → "cuda 专题"） */
function scopeLabel(scope: string): string {
  const day = /daily\/week(\d+)\/day(\d+)\//.exec(scope);
  if (day) return `Week ${Number(day[1])} Day ${Number(day[2])}`;
  const week = /daily\/week(\d+)\//.exec(scope);
  if (week) return `Week ${Number(week[1])}`;
  const topic = /topics\/([^/]+)\//.exec(scope);
  if (topic) return `${topic[1]} 专题`;
  return scope;
}

/** tag / knowledgePoint 匹配：MySQL JSON 数组包含判断（沿用 content.ts 模式） */
function jsonContains(column: SQL | unknown, value: string): SQL {
  return sql`JSON_CONTAINS(${column as SQL}, JSON_QUOTE(${value}))`;
}

/** 薄弱知识点推导：任一维度 C/D 的题目贡献其 knowledge_points；
 *  存量题库无 knowledge_points 时回落题目 tags（P2 bank 管线补标签后自动切回） */
function deriveWeakPoints(
  result: EvaluationResult,
  questionMeta: Map<number, { knowledgePoints: string[] | null; tags: string }>,
): string[] {
  const weak = new Set<string>();
  for (const q of result.questions) {
    if (!q.dimensions.some((d) => d.grade === "C" || d.grade === "D")) continue;
    const meta = questionMeta.get(q.questionId);
    if (!meta) continue;
    const points =
      meta.knowledgePoints ??
      meta.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    for (const p of points) weak.add(p);
  }
  return [...weak];
}

/** 报告内"薄弱点 → 学习/练习"每个知识点的推荐条数上限 */
const RECOMMEND_ITEMS_PER_POINT = 3;
/** 报告渲染的薄弱点数量上限（weak_points 列存全量，渲染截断保证可读性） */
const RECOMMEND_MAX_POINTS = 6;

/** 薄弱点 → 学习章节/练习题推荐（server.md §6：SQL 按 knowledge_points/tags 匹配，不调 LLM） */
async function buildRecommendations(weakPoints: string[]): Promise<WeakPointRecommendation[]> {
  if (weakPoints.length === 0) return [];
  const matches = (col: SQL | unknown) => or(...weakPoints.map((p) => jsonContains(col, p)));
  const [learnRows, problemRows] = await Promise.all([
    db
      .select({
        id: contents.id,
        title: contents.title,
        url: contents.url,
        knowledgePoints: contents.knowledgePoints,
        tags: contents.tags,
      })
      .from(contents)
      .where(
        and(
          eq(contents.type, "learn"),
          eq(contents.status, "active"),
          or(matches(contents.knowledgePoints), matches(contents.tags)),
        ),
      )
      .orderBy(asc(contents.id)),
    db
      .select({
        id: problems.id,
        number: problems.number,
        title: contents.title,
        url: contents.url,
        knowledgePoints: contents.knowledgePoints,
        tags: contents.tags,
      })
      .from(problems)
      .innerJoin(contents, eq(problems.id, contents.id))
      .where(
        and(
          eq(contents.status, "active"),
          or(matches(contents.knowledgePoints), matches(contents.tags)),
        ),
      )
      .orderBy(asc(problems.source), asc(problems.number)),
  ]);

  return weakPoints.map((name) => {
    const hit = (row: { knowledgePoints: string[]; tags: string[] }) =>
      row.knowledgePoints.includes(name) || row.tags.includes(name);
    return {
      name,
      learn: learnRows
        .filter(hit)
        .slice(0, RECOMMEND_ITEMS_PER_POINT)
        .map((r) => ({ id: r.id, title: r.title, url: r.url })),
      problems: problemRows
        .filter(hit)
        .slice(0, RECOMMEND_ITEMS_PER_POINT)
        .map((r) => ({
          id: r.id,
          title: r.number > 0 ? `#${r.number} ${r.title}` : r.title,
          url: r.url,
        })),
    };
  });
}

/** 场次报告行（拆表后报告本体在 interview_reports；无报告返回 null） */
async function loadReport(sessionId: number) {
  const rows = await db
    .select()
    .from(interviewReports)
    .where(eq(interviewReports.sessionId, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export const interviewRouter = router({
  // 配额计量：LLM 面试场次创建入口（dev/server.md §8）
  start: authedProcedure.use(quotaFor("interview")).input(startInterviewSchema).mutation(async ({ input, ctx }) => {
    const scope = input.scope?.trim() || undefined;
    if (scope && !scope.startsWith("ai-infra-notes:")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "非法的考察范围" });
    }
    // 选题范围：本人私有题 + 全站共享题库（user_id IS NULL）
    const visible = or(eq(questions.userId, ctx.userId), isNull(questions.userId));
    const rows = await db
      .select()
      .from(questions)
      .where(
        scope
          ? and(
              visible,
              eq(questions.stale, 0),
              // scope 同时匹配规则同步（ai-infra-notes:）与 LLM 题库（bank:ai-infra-notes:）题目
              or(
                like(questions.sourceKey, `${scope}%`),
                like(questions.sourceKey, `bank:${scope}%`),
              ),
            )
          : and(visible, eq(questions.stale, 0), inArray(questions.category, input.categories)),
      );
    if (rows.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: scope
          ? "该考察范围的题库为空，请先在题库页同步 GitHub 仓库"
          : "所选方向的题库为空，请先在题库页同步 GitHub 仓库或一键播种",
      });
    }

    // 历史去重：优先抽取未在历史面试中出现过的题；
    // 未考过的题不足（或全部都已考过）时才从考过的题中补足
    const pastSessions = await db
      .select({ questionIds: interviewSessions.questionIds })
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, ctx.userId));
    const usedIds = new Set(pastSessions.flatMap((s) => s.questionIds));
    const freshRows = rows.filter((r) => !usedIds.has(r.id));
    const usedRows = rows.filter((r) => usedIds.has(r.id));
    const picked = pickByCategory(freshRows, Math.min(input.count, freshRows.length));
    if (picked.length < input.count) {
      picked.push(...pickByCategory(usedRows, input.count - picked.length));
    }
    // 题目顺序：方向间交替打乱不如按方向聚类清晰，此处按抽取顺序随机排序
    picked.sort(() => Math.random() - 0.5);

    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const pickedCategories = [...new Set(picked.map((q) => q.category))];
    const catLabels = scope
      ? scopeLabel(scope)
      : input.categories.map((c) => CATEGORY_LABELS[c]).join("+");
    const title = scope ? `${catLabels}专项面试 ${mmdd}` : `${catLabels}混合面试 ${mmdd}`;

    const questionIds = picked.map((q) => q.id);
    // scope 快照：所考题目 knowledge_points 并集（掌握度模型 interview 信号，03 数据模型）
    const scopeKnowledgePoints = [...new Set(picked.flatMap((q) => q.knowledgePoints ?? []))];
    const first = toQuestion(picked[0]);
    const firstQuestion = await getInterviewer().openingQuestion(first, "AI Infra 工程师");
    const opening =
      `你好，我是今天的面试官。本场面试共 ${picked.length} 道题（${catLabels}），我会一次问一个问题，可能会有一些追问。\n\n` +
      `我们开始第一题：\n\n${firstQuestion}`;

    const sessionId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(interviewSessions)
        .values({
          userId: ctx.userId,
          title,
          categories: scope ? pickedCategories : input.categories,
          questionIds,
          currentIndex: 0,
          followUpIndex: 0,
          status: "active",
          scopeKnowledgePoints,
        })
        .$returningId();
      await tx.insert(interviewMessages).values({
        sessionId: inserted[0].id,
        questionId: first.id,
        role: "interviewer",
        content: opening,
      });
      return inserted[0].id;
    });

    const session = await loadSession(sessionId, ctx.userId);
    const messages = await db
      .select()
      .from(interviewMessages)
      .where(eq(interviewMessages.sessionId, sessionId))
      .orderBy(asc(interviewMessages.id));
    return { state: stateOf(session), messages: messages.map(toMessage) };
  }),

  reply: authedProcedure
    .input(interviewReplySchema)
    .mutation(async ({ input, ctx }) => {
      const session = await loadSession(input.sessionId, ctx.userId);
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "本场面试已结束" });
      }
      const questionMap = await loadQuestionsByIds(session.questionIds);
      const currentId = session.questionIds[session.currentIndex];
      const current = questionMap.get(currentId);
      if (!current) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "当前题目已被删除，无法继续" });
      }

      // 写考生消息
      await db.insert(interviewMessages).values({
        sessionId: session.id,
        questionId: currentId,
        role: "candidate",
        content: input.content,
      });

      // 纯 LLM 模式：追问由 LLM 动态生成，上限 MAX_FOLLOW_UPS
      const maxFollowUps = MAX_FOLLOW_UPS;
      let newIndex = session.currentIndex;
      let newFollowUpIndex = session.followUpIndex;
      let finished = false;
      let interviewerContent: string;
      let interviewerQuestionId: number | null = currentId;

      if (session.followUpIndex < maxFollowUps) {
        // 继续追问
        const historyRows = await db
          .select()
          .from(interviewMessages)
          .where(eq(interviewMessages.sessionId, session.id))
          .orderBy(asc(interviewMessages.id));
        const interviewer = getInterviewer();
        interviewerContent = await interviewer.nextUtterance({
          question: current,
          history: historyRows.map(toMessage),
          followUpIndex: session.followUpIndex,
          targetRole: "AI Infra 工程师",
        });
        newFollowUpIndex = session.followUpIndex + 1;
      } else if (session.currentIndex + 1 < session.questionIds.length) {
        // 换题
        newIndex = session.currentIndex + 1;
        newFollowUpIndex = 0;
        const next = questionMap.get(session.questionIds[newIndex]);
        if (!next) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "下一题已被删除，无法继续" });
        }
        interviewerContent = `好的，进入第 ${newIndex + 1} 题：\n\n${await getInterviewer().openingQuestion(next, "AI Infra 工程师")}`;
        interviewerQuestionId = next.id;
      } else {
        // 题目耗尽，结束
        finished = true;
        interviewerContent = "好，本场面试到此结束，感谢你的回答。正在生成评估报告…";
        interviewerQuestionId = null;
      }

      await db.insert(interviewMessages).values({
        sessionId: session.id,
        questionId: interviewerQuestionId,
        role: "interviewer",
        content: interviewerContent,
      });
      await db
        .update(interviewSessions)
        .set({ currentIndex: newIndex, followUpIndex: newFollowUpIndex })
        .where(eq(interviewSessions.id, session.id));

      if (finished) {
        await finishSession(session.id, ctx.userId);
      }
      const updated = await loadSession(session.id, ctx.userId);
      return { state: stateOf(updated), interviewerMessage: interviewerContent };
    }),

  finish: authedProcedure
    .input(sessionIdParamSchema)
    .mutation(async ({ input, ctx }) => {
      await loadSession(input.sessionId, ctx.userId);
      return finishSession(input.sessionId, ctx.userId);
    }),

  /** 删除历史场次：连同消息与报告一起删除（无 FK 级联，事务内先删子表再删场次） */
  remove: authedProcedure
    .input(sessionIdParamSchema)
    .mutation(async ({ input, ctx }) => {
      const affected = await db.transaction(async (tx) => {
        await tx
          .delete(interviewMessages)
          .where(eq(interviewMessages.sessionId, input.sessionId));
        await tx
          .delete(interviewReports)
          .where(eq(interviewReports.sessionId, input.sessionId));
        const result = await tx
          .delete(interviewSessions)
          .where(
            and(eq(interviewSessions.id, input.sessionId), eq(interviewSessions.userId, ctx.userId)),
          );
        return Number(result[0].affectedRows);
      });
      if (affected === 0) throw new TRPCError({ code: "NOT_FOUND", message: "场次不存在" });
      setReportProgress(input.sessionId, "done");
      return { ok: true as const };
    }),

  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, ctx.userId))
      .orderBy(desc(interviewSessions.createdAt));
  }),

  /** 统计看板（README §8.3）：按方向等级分布 + 近 10 场趋势 */
  stats: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(interviewSessions)
      .where(and(eq(interviewSessions.userId, ctx.userId), eq(interviewSessions.status, "finished")))
      .orderBy(desc(interviewSessions.createdAt));

    const gradeScore: Record<string, number> = GRADE_SCORES;
    const byCategory = new Map<string, number[]>();
    for (const s of rows) {
      const score = gradeScore[s.overallGrade ?? ""] ?? 0;
      if (score === 0) continue;
      for (const cat of s.categories) {
        const arr = byCategory.get(cat) ?? [];
        arr.push(score);
        byCategory.set(cat, arr);
      }
    }
    const categoryAverages = [...byCategory.entries()].map(([category, scores]) => ({
      category,
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
      sessions: scores.length,
    }));

    const trend = rows.slice(0, 10).reverse().map((s) => ({
      sessionId: s.id,
      title: s.title,
      overallGrade: s.overallGrade,
      score: gradeScore[s.overallGrade ?? ""] ?? null,
      createdAt: s.createdAt,
      durationMinutes:
        s.finishedAt && s.createdAt
          ? Math.max(1, Math.round((s.finishedAt.getTime() - s.createdAt.getTime()) / 60000))
          : null,
    }));

    return { totalFinished: rows.length, categoryAverages, trend };
  }),

  get: authedProcedure
    .input(sessionIdParamSchema)
    .query(async ({ input, ctx }) => {
      const session = await loadSession(input.sessionId, ctx.userId);
      const [messages, questionMap, report] = await Promise.all([
        db
          .select()
          .from(interviewMessages)
          .where(eq(interviewMessages.sessionId, session.id))
          .orderBy(asc(interviewMessages.id)),
        loadQuestionsByIds(session.questionIds),
        session.status === "finished" ? loadReport(session.id) : Promise.resolve(null),
      ]);
      // 报告未落库时返回当前生成进度，前端据此轮询展示「评估中 / 生成中 / 失败」
      const reportProgress: ReportProgress = report
        ? { stage: "done" }
        : (getReportProgress(session.id) ?? { stage: "pending" });
      return {
        session,
        /** 评估报告（拆表后）；active 场次为 null */
        report,
        messages: messages.map(toMessage),
        questions: Object.fromEntries(questionMap),
        reportProgress,
      };
    }),
});

/** 结束流程（README §5.2）：先标记结束 → 聚合消息 → 评分 → 薄弱点推荐 → 写 interview_reports 拆表。
 *  状态先于评估落库，保证点击「结束本场」后面试立即结束，报告生成（可能数十秒）不阻塞状态翻转；
 *  已结束但报告缺失时（上次评估失败/进程重启）重新走评估流程，即前端的「重新生成报告」。 */
async function finishSession(sessionId: number, userId: number) {
  const session = await loadSession(sessionId, userId);
  if (session.status === "finished") {
    const existing = await loadReport(sessionId);
    if (existing) return { report: existing.report, overallGrade: session.overallGrade };
  } else {
    await db
      .update(interviewSessions)
      .set({ status: "finished", finishedAt: new Date() })
      .where(eq(interviewSessions.id, sessionId));
    await db.insert(interviewMessages).values({
      sessionId,
      questionId: null,
      role: "system",
      content: "本场面试已结束，感谢参与。评估报告生成后可在报告页查看。",
    });
  }
  const messageRows = await db
    .select()
    .from(interviewMessages)
    .where(eq(interviewMessages.sessionId, sessionId))
    .orderBy(asc(interviewMessages.id));
  const questionMap = await loadQuestionsByIds(session.questionIds);

  const groups = session.questionIds
    .map((qid) => {
      const question = questionMap.get(qid);
      if (!question) return null;
      return {
        question,
        messages: messageRows.filter((m) => m.questionId === qid).map(toMessage),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  const durationMinutes =
    session.createdAt && messageRows.length > 0
      ? Math.max(
          1,
          Math.round(
            (messageRows[messageRows.length - 1].createdAt.getTime() - session.createdAt.getTime()) / 60000,
          ),
        )
      : null;

  const transcript: GroupedTranscript = {
    groups,
    targetRole: "AI Infra 工程师",
    durationMinutes,
  };

  // 纯 LLM 模式：评估失败直接抛错（LLM 内部已重试一次）；失败阶段写入进度供前端展示原因
  setReportProgress(sessionId, "evaluating");
  let result: EvaluationResult;
  try {
    result = await getInterviewer().evaluate(transcript);
  } catch (err) {
    setReportProgress(sessionId, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  }

  setReportProgress(sessionId, "rendering");

  // 薄弱点推导 + 学习/练习推荐（SQL 匹配 contents/problems，不调 LLM）
  const metaRows = await db
    .select({ id: questions.id, knowledgePoints: questions.knowledgePoints, tags: questions.tags })
    .from(questions)
    .where(inArray(questions.id, session.questionIds));
  const questionMeta = new Map(metaRows.map((r) => [r.id, r]));
  const weakPoints = deriveWeakPoints(result, questionMeta);
  const recommendations = await buildRecommendations(weakPoints.slice(0, RECOMMEND_MAX_POINTS));

  const report = renderReportMarkdown({
    sessionId,
    categories: session.categories as Category[],
    questionCount: session.questionIds.length,
    durationMinutes,
    result,
    keyPointsByQuestion: new Map(groups.map((g) => [g.question.id, g.question.keyPoints])),
    recommendations,
  });

  await db.transaction(async (tx) => {
    // onDuplicateKeyUpdate：并发双 finish 时幂等（sessionId 唯一键）
    await tx
      .insert(interviewReports)
      .values({
        sessionId,
        userId,
        overallGrade: result.overallGrade,
        evaluatedBy: result.evaluatedBy,
        report,
        weakPoints,
      })
      .onDuplicateKeyUpdate({
        set: {
          overallGrade: result.overallGrade,
          evaluatedBy: result.evaluatedBy,
          report,
          weakPoints,
        },
      });
    await tx
      .update(interviewSessions)
      .set({
        overallGrade: result.overallGrade,
      })
      .where(eq(interviewSessions.id, sessionId));
  });

  setReportProgress(sessionId, "done");
  return { report, overallGrade: result.overallGrade };
}
