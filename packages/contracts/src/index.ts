import { z } from "zod";

// ---------------------------------------------------------------------------
// 枚举与常量（README §4.2）
// ---------------------------------------------------------------------------

export const CATEGORIES = ["leetcode", "cuda", "knowledge"] as const;
export type Category = (typeof CATEGORIES)[number];
export const categorySchema = z.enum(CATEGORIES);

export const CATEGORY_LABELS: Record<Category, string> = {
  leetcode: "Leetcode",
  cuda: "CUDA",
  knowledge: "专业知识",
};

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const difficultySchema = z.enum(DIFFICULTIES);

export const GRADES = ["A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];
export const gradeSchema = z.enum(GRADES);

export const GRADE_SCORES: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1 };

export const SESSION_STATUSES = ["active", "finished"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const MESSAGE_ROLES = ["interviewer", "candidate", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** 每题最大追问数（README §5.2） */
export const MAX_FOLLOW_UPS = 4;

/** 单场面试题量上限（README §5.2） */
export const MAX_QUESTIONS_PER_SESSION = 10;

// ---------------------------------------------------------------------------
// 题库（README §4.2 questions + 附录 A）
// ---------------------------------------------------------------------------

export const questionInputSchema = z.object({
  category: categorySchema,
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  difficulty: difficultySchema,
  tags: z.string().max(500).default(""),
  followUps: z.array(z.string()).default([]),
  keyPoints: z.string().default(""),
  source: z.string().max(255).default(""),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionListFilterSchema = z.object({
  category: categorySchema.optional(),
  difficulty: difficultySchema.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type QuestionListFilter = z.infer<typeof questionListFilterSchema>;

// ---------------------------------------------------------------------------
// 面试（README §5、§9）
// ---------------------------------------------------------------------------

export const startInterviewSchema = z
  .object({
    categories: z.array(categorySchema).default([]),
    count: z.number().int().min(1).max(MAX_QUESTIONS_PER_SESSION),
    /**
     * 考察范围（可选）：ai-infra-notes 的 sourceKey 前缀，
     * 如 "ai-infra-notes:aiinfra/daily/week1/"（按周）或
     * "ai-infra-notes:aiinfra/topics/cuda/"（按专题）。设置时忽略 categories。
     */
    scope: z.string().max(120).optional(),
  })
  .refine((v) => (v.scope ? true : v.categories.length > 0), {
    message: "请选择方向或考察范围",
  });
export type StartInterviewInput = z.infer<typeof startInterviewSchema>;

export interface InterviewState {
  sessionId: number;
  status: SessionStatus;
  currentIndex: number;
  followUpIndex: number;
  totalQuestions: number;
}

// ---------------------------------------------------------------------------
// 面试官引擎（README §6.1）
// ---------------------------------------------------------------------------

export interface Question {
  id: number;
  category: Category;
  title: string;
  content: string;
  difficulty: Difficulty;
  tags: string;
  followUps: string[];
  keyPoints: string;
  source: string;
}

export interface InterviewMessage {
  id: number;
  sessionId: number;
  questionId: number | null;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface InterviewContext {
  question: Question;
  history: InterviewMessage[];
  followUpIndex: number;
  targetRole: string;
}

/** 按题分组的对话记录（评估输入） */
export interface GroupedTranscript {
  groups: Array<{
    question: Question;
    messages: InterviewMessage[];
  }>;
  targetRole: string;
  durationMinutes: number | null;
}

/** 分方向评分维度（README §8.1） */
export const CATEGORY_DIMENSIONS: Record<Category, string[]> = {
  leetcode: ["正确性", "复杂度分析", "边界处理", "表达清晰度"],
  cuda: ["概念正确性", "性能意识", "工具链实践", "表达清晰度"],
  knowledge: ["准确性", "深度", "工程权衡", "表达清晰度"],
};

export interface QuestionEvaluation {
  questionId: number;
  title: string;
  category: Category;
  dimensions: Array<{ name: string; grade: Grade }>;
  diagnosis: string;
  suggestion: string;
  /** 与面试官的每次提问（主问题 + 每次追问）一一对应、顺序一致的参考答案 */
  answers: string[];
}

export interface EvaluationResult {
  overallGrade: Grade;
  summary: string;
  questions: QuestionEvaluation[];
  weakDimensions: string[];
  evaluatedBy: "llm" | "rule";
}

export interface IInterviewer {
  /** 生成本题的开场问题（LLM 模式下会把原始材料重写为清晰的面试问题） */
  openingQuestion(question: Question, targetRole: string): Promise<string>;
  nextUtterance(ctx: InterviewContext): Promise<string>;
  evaluate(transcript: GroupedTranscript): Promise<EvaluationResult>;
}

// ---------------------------------------------------------------------------
// 评估 JSON schema（LLM 输出契约，README §6.2 / §8）
// ---------------------------------------------------------------------------

export const evaluationJsonSchema = z.object({
  overallGrade: gradeSchema,
  summary: z.string(),
  questions: z.array(
    z.object({
      questionId: z.number(),
      dimensions: z.array(z.object({ name: z.string(), grade: gradeSchema })).min(1),
      diagnosis: z.string(),
      suggestion: z.string(),
      answers: z.array(z.string()).min(1),
    }),
  ),
  weakDimensions: z.array(z.string()).default([]),
});
export type EvaluationJson = z.infer<typeof evaluationJsonSchema>;

// ---------------------------------------------------------------------------
// 报告渲染 + 综合等级映射（README §8.2 / 附录 B）
// ---------------------------------------------------------------------------

export function computeOverallGrade(evaluations: QuestionEvaluation[]): Grade {
  if (evaluations.length === 0) return "C";
  const scores = evaluations.flatMap((q) => q.dimensions.map((d) => GRADE_SCORES[d.grade]));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 3.5) return "A";
  if (avg >= 2.5) return "B";
  if (avg >= 1.5) return "C";
  return "D";
}

export function renderReportMarkdown(opts: {
  sessionId: number;
  categories: Category[];
  questionCount: number;
  durationMinutes: number | null;
  result: EvaluationResult;
  keyPointsByQuestion: Map<number, string>;
}): string {
  const { sessionId, categories, questionCount, durationMinutes, result, keyPointsByQuestion } = opts;
  const catLabels = categories.map((c) => CATEGORY_LABELS[c]).join("/");
  const duration = durationMinutes != null ? ` · ${durationMinutes} 分钟` : "";
  const lines: string[] = [];
  lines.push(`# 面试评估报告（场次 #${sessionId} · ${catLabels} · ${questionCount} 题${duration}）`);
  lines.push("");
  lines.push(`## 总评：${result.overallGrade}`);
  lines.push(result.summary);
  if (result.evaluatedBy === "rule") {
    lines.push("");
    lines.push("> 注：本次由规则引擎评估（未启用 LLM 或 LLM 降级）。");
  }
  for (const [i, q] of result.questions.entries()) {
    lines.push("");
    lines.push(`## 第 ${i + 1} 题：${q.title}（${q.category}）`);
    lines.push(`- ${q.dimensions.map((d) => `${d.name} ${d.grade}`).join(" · ")}`);
    lines.push(`- 诊断：${q.diagnosis}`);
    lines.push(`- 改进建议：${q.suggestion}`);
    if (q.answers.length > 0) {
      // 每条答案以「【答】」开头单独成行，前端按此与每次提问一一配对
      lines.push("- 参考答案：");
      for (const a of q.answers) lines.push(`【答】${a}`);
    }
    const kp = keyPointsByQuestion.get(q.questionId);
    if (kp) lines.push(`- 要点对照：${kp}`);
  }
  if (result.weakDimensions.length > 0) {
    lines.push("");
    lines.push("## 专项训练建议");
    result.weakDimensions.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// GitHub 仓库文件（bank:generate 拉取仓库用）
// ---------------------------------------------------------------------------

export interface RepoFile {
  /** 仓库内相对路径 */
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// 账号与认证（dev/server.md §4，03 数据模型）
// ---------------------------------------------------------------------------

export const USER_TIERS = ["free", "pro"] as const;
export type UserTier = (typeof USER_TIERS)[number];
export const userTierSchema = z.enum(USER_TIERS);

export const emailSchema = z.string().trim().toLowerCase().email().max(255);

export const authSendCodeSchema = z.object({
  email: emailSchema,
});
export type AuthSendCodeInput = z.infer<typeof authSendCodeSchema>;

export const authRegisterSchema = z.object({
  email: emailSchema,
  /** 明文密码仅存在于请求体，服务端 scrypt 哈希后落库 */
  password: z.string().min(8, "密码至少 8 位").max(72),
  /** 6 位数字注册验证码（auth.sendCode 发送） */
  code: z.string().regex(/^\d{6}$/, "验证码为 6 位数字"),
  name: z.string().trim().min(1).max(255).optional(),
});
export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;

export const authLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});
export type AuthLoginInput = z.infer<typeof authLoginSchema>;

/** auth.me 返回的当前用户信息（不含 password_hash） */
export interface CurrentUser {
  id: number;
  email: string | null;
  name: string;
  avatar: string | null;
  tier: UserTier;
  emailVerified: boolean;
}

// ---------------------------------------------------------------------------
// 配额（dev/server.md §8：计量先行、限额后置；quota NULL = 不限）
// ---------------------------------------------------------------------------

export const QUOTA_KINDS = ["judge", "interview"] as const;
export type QuotaKind = (typeof QUOTA_KINDS)[number];
export const quotaKindSchema = z.enum(QUOTA_KINDS);

export interface QuotaUsage {
  kind: QuotaKind;
  /** 计费周期标识（当前实现为 UTC 日粒度，YYYY-MM-DD） */
  period: string;
  used: number;
  /** NULL = 不限（上线初期默认） */
  quota: number | null;
}

// ---------------------------------------------------------------------------
// 内容元数据（03 数据模型：contents / problems / knowledge_points）
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = ["learn", "problem", "paper", "profiling"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const contentTypeSchema = z.enum(CONTENT_TYPES);

export const CONTENT_STATUSES = ["active", "stale"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const contentStatusSchema = z.enum(CONTENT_STATUSES);

export const PROBLEM_SOURCES = ["leetcode", "leetgpu", "contest"] as const;
export type ProblemSource = (typeof PROBLEM_SOURCES)[number];
export const problemSourceSchema = z.enum(PROBLEM_SOURCES);

export const JUDGE_TYPES = ["internal", "leetgpu-com", "none"] as const;
export type JudgeType = (typeof JUDGE_TYPES)[number];
export const judgeTypeSchema = z.enum(JUDGE_TYPES);

export const PROGRESS_STATUSES = ["unseen", "seen", "mastered", "ac"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export const progressStatusSchema = z.enum(PROGRESS_STATUSES);

export const SUBMISSION_STATUSES = ["pending", "running", "ac", "wa", "ce", "tle", "mle"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);

/** 内置评测用例（problems.testcases，对齐 judge/parse.ts 的 ExampleCase 结构） */
export interface ProblemTestcase {
  args: Array<{ name: string; value: string }>;
  expected: string;
}

export const contentFilterSchema = z.object({
  type: contentTypeSchema.optional(),
  /** 分区：统一 ID 的冒号前缀（lc / gpu / learn / paper / q），匹配 `id LIKE 'partition:%'` */
  partition: z.string().trim().min(1).max(32).optional(),
  tag: z.string().trim().min(1).max(100).optional(),
  knowledgePoint: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  status: contentStatusSchema.default("active"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ContentFilter = z.infer<typeof contentFilterSchema>;

export const problemFilterSchema = z.object({
  difficulty: difficultySchema.optional(),
  source: problemSourceSchema.optional(),
  judgeType: judgeTypeSchema.optional(),
  tag: z.string().trim().min(1).max(100).optional(),
  knowledgePoint: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  /** true 只看已 AC；false 只看未 AC；不传为全部 */
  solved: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ProblemFilter = z.infer<typeof problemFilterSchema>;

export const progressMarkSchema = z.object({
  contentId: z.string().min(1).max(128),
  /** 只允许用户主动推进的状态；unseen 为系统默认值不可手动标记 */
  status: z.enum(["seen", "mastered", "ac"]),
  /** 可选得分（0-100），如自评/评测分数 */
  score: z.number().int().min(0).max(100).optional(),
});
export type ProgressMark = z.infer<typeof progressMarkSchema>;

// ---------------------------------------------------------------------------
// content.import（admin）：content-kit 产出的 contents.json / problems.json
// 幂等键为统一 ID，contentHash 判变更（沿用 sourceKey/contentHash 模式）
// ---------------------------------------------------------------------------

export const contentImportItemSchema = z.object({
  id: z.string().min(1).max(128),
  type: contentTypeSchema,
  title: z.string().min(1).max(500),
  tags: z.array(z.string()).default([]),
  knowledgePoints: z.array(z.string()).default([]),
  url: z.string().max(500).default(""),
  contentHash: z.string().min(1).max(64),
});
export type ContentImportItem = z.infer<typeof contentImportItemSchema>;

export const problemImportItemSchema = z.object({
  id: z.string().min(1).max(128),
  source: problemSourceSchema,
  number: z.number().int().min(0).default(0),
  difficulty: difficultySchema,
  languages: z.array(z.string()).default([]),
  judgeType: judgeTypeSchema,
  testcases: z.array(z.object({
    args: z.array(z.object({ name: z.string(), value: z.string() })),
    expected: z.string(),
  })).default([]),
  externalUrl: z.string().max(500).default(""),
});
export type ProblemImportItem = z.infer<typeof problemImportItemSchema>;

export const contentImportSchema = z.object({
  contents: z.array(contentImportItemSchema).default([]),
  problems: z.array(problemImportItemSchema).default([]),
});
export type ContentImportInput = z.infer<typeof contentImportSchema>;

// ---------------------------------------------------------------------------
// progress.overview 输出（03 掌握度模型：0.2 学习 + 0.5 刷题 + 0.3 面试）
// ---------------------------------------------------------------------------

export const MASTERY_WEIGHTS = { learn: 0.2, problem: 0.5, interview: 0.3 } as const;

/** 刷题信号的难度权重（03：hard=3 / medium=2 / easy=1） */
export const DIFFICULTY_WEIGHTS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export interface KnowledgePointMastery {
  knowledgePoint: string;
  /** 0-1，三路信号按 MASTERY_WEIGHTS 加权；无数据的信号按 0 计（v1 刻意从简） */
  mastery: number;
  signals: {
    /** 相关 learn 内容 seen/mastered 比例（无相关内容时为 null） */
    learn: number | null;
    /** 相关题目按难度加权的 AC 比例（无相关题目时为 null） */
    problem: number | null;
    /** 相关面试题最近得分归一化（无相关面试记录时为 null） */
    interview: number | null;
  };
}
