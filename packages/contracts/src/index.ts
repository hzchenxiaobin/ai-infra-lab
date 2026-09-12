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
export const MAX_QUESTIONS_PER_SESSION = 5;

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
// LLM 题库导入（dev/cli.md §3：cli bank:import → question.bankImport）
// ---------------------------------------------------------------------------

export const bankImportItemSchema = questionInputSchema.extend({
  /** 幂等键：bank:{repo}:{path}#{条目序号} */
  sourceKey: z.string().min(1).max(500),
});
export type BankImportItem = z.infer<typeof bankImportItemSchema>;

/** LLM 抽题单条结构（bank:generate 产物元素，无 sourceKey；sourceKey 在聚合落盘时赋） */
export const bankExtractItemSchema = questionInputSchema;
export type BankExtractItem = z.infer<typeof bankExtractItemSchema>;

export const bankImportSchema = z.object({
  items: z.array(bankImportItemSchema).min(1),
  /** 本批 bank 条目的 sourceKey 公共前缀（如 bank:ai-infra-notes:），用于识别"源里已删除"的失效条目 */
  bankSourceKeyPrefix: z.string().min(1).max(500),
  /** 同源规则解析题的 sourceKey 前缀；LLM bank 落库后将其标记 stale（替代语义） */
  replaceSourceKeyPrefix: z.string().max(500).optional(),
});
export type BankImportInput = z.infer<typeof bankImportSchema>;

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
  /** 对应的统一题目 ID（leetcode 同步题 → lc:*，judge 内嵌评测用）；无映射为 null */
  judgeProblemId: string | null;
}

/**
 * 面试题库 question 的 leetcode sourceKey → 统一题目 ID（对齐 content-kit ids.ts 的
 * solution/contest 路径规则）。manual/seed/bank 题无映射返回 null。
 */
export function judgeProblemIdFromSourceKey(sourceKey: string): string | null {
  let m = /^leetcode:solution\/\d{4}-\d{4}\/(\d+)_/.exec(sourceKey);
  if (m) return `lc:${String(Number(m[1])).padStart(4, "0")}`;
  m = /^leetcode:solution\/\d{4}-\d{4}\/LCOF(\d+)_/i.exec(sourceKey);
  if (m) return `lc:lcof:${Number(m[1])}`;
  m = /^leetcode:contest\/(\d+)\/Q(\d+)\./i.exec(sourceKey);
  if (m) return `lc:contest:${Number(m[1])}q${Number(m[2])}`;
  return null;
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

// ---------------------------------------------------------------------------
// 薄弱点 → 学习/练习推荐（M2 闭环最后一环，server.md §6）
// ---------------------------------------------------------------------------

/** 推荐链接目标：站内 docs 路径或外部 URL */
export interface RecommendLink {
  id: string;
  title: string;
  url: string;
}

/** 单个薄弱点的推荐：关联学习章节与练习题（SQL 按 knowledge_points/tags 匹配） */
export interface WeakPointRecommendation {
  /** 知识点 slug 或题目标签（questions.knowledgePoints 缺失时回落 tags） */
  name: string;
  learn: RecommendLink[];
  problems: RecommendLink[];
}

export function renderReportMarkdown(opts: {
  sessionId: number;
  categories: Category[];
  questionCount: number;
  durationMinutes: number | null;
  result: EvaluationResult;
  keyPointsByQuestion: Map<number, string>;
  /** 薄弱点推荐（可选）：有内容命中时渲染为带链接的专项训练计划 */
  recommendations?: WeakPointRecommendation[];
}): string {
  const { sessionId, categories, questionCount, durationMinutes, result, keyPointsByQuestion } = opts;
  const recommendations = opts.recommendations?.filter((r) => r.learn.length > 0 || r.problems.length > 0) ?? [];
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
  if (result.weakDimensions.length > 0 || recommendations.length > 0) {
    lines.push("");
    lines.push("## 专项训练建议");
    result.weakDimensions.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
    if (recommendations.length > 0) {
      if (result.weakDimensions.length > 0) lines.push("");
      lines.push("### 薄弱点 → 学习与练习");
      for (const rec of recommendations) {
        lines.push(`- **${rec.name}**`);
        if (rec.learn.length > 0) {
          lines.push(`  - 学习：${rec.learn.map((l) => `[${l.title}](${l.url})`).join("、")}`);
        }
        if (rec.problems.length > 0) {
          lines.push(`  - 练习：${rec.problems.map((p) => `[${p.title}](${p.url})`).join("、")}`);
        }
      }
    }
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
// 用户/配额管理（dev/cli.md §3：CLI user:list/ban、quota:get/set，按 email 寻址）
// ---------------------------------------------------------------------------

export const adminUserListSchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type AdminUserListInput = z.infer<typeof adminUserListSchema>;

export const adminUserEmailParamSchema = z.object({ email: emailSchema });
export type AdminUserEmailParam = z.infer<typeof adminUserEmailParamSchema>;

/** user:ban / user:unban（banned=false 解封） */
export const adminUserBanSchema = z.object({
  email: emailSchema,
  banned: z.boolean(),
});
export type AdminUserBanInput = z.infer<typeof adminUserBanSchema>;

/**
 * user:claim：认领遗留用户（email 为 NULL 的单用户时代数据）。
 * 绑定邮箱 + 初始密码，历史面试/提交/进度原地保留；password 缺省时服务端
 * 生成随机密码并在返回值中给出一次（不落任何日志）。
 */
export const adminUserClaimSchema = z.object({
  userId: z.number().int().positive(),
  email: emailSchema,
  password: z.string().min(8, "密码至少 8 位").max(72).optional(),
});
export type AdminUserClaimInput = z.infer<typeof adminUserClaimSchema>;

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

/** cli quota:set <email> <kind> <n|unlimited> */
export const adminQuotaSetSchema = z.object({
  email: emailSchema,
  kind: quotaKindSchema,
  /** null = 不限（上线初期默认） */
  quota: z.number().int().min(1).nullable(),
});
export type AdminQuotaSetInput = z.infer<typeof adminQuotaSetSchema>;

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

/** 评测提交终/中间态：pending → running → 终态；ie = worker 自身故障（告警用） */
export const SUBMISSION_STATUSES = [
  "pending",
  "running",
  "ac",
  "wa",
  "ce",
  "tle",
  "mle",
  "ie",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);

/** 评测提交的终态集合（getResult 轮询停止条件） */
export const SUBMISSION_TERMINAL_STATUSES = ["ac", "wa", "ce", "tle", "mle", "ie"] as const;
export type SubmissionTerminalStatus = (typeof SUBMISSION_TERMINAL_STATUSES)[number];

/** 判题执行结果（verdict_detail 落库结构，对齐 server judge/run.ts 的 JudgeRunResult） */
export interface JudgeVerdict {
  status: "ok" | "compile_error" | "no_cases";
  compileError?: string;
  cases: Array<{
    input: string;
    expected: string;
    actual: string;
    pass: boolean;
    error: string | null;
  }>;
  passed: number;
  total: number;
}

/** 内置评测用例（problems.testcases，对齐 judge/parse.ts 的 ExampleCase 结构） */
export interface ProblemTestcase {
  args: Array<{ name: string; value: string }>;
  expected: string;
}

/**
 * 判题元数据（problems.judge_meta，content-kit 从题解参考代码解析）：
 * 方法签名 + 语言可用性，server 侧据此生成 starter 与本机/沙箱 harness。
 */
export interface ProblemJudgeMeta {
  /** Solution 方法名（C++/Python 参考签名一致） */
  methodName: string;
  /** C++ 参考签名是否解析成功（失败则 C++ 不可评测） */
  cppAvailable: boolean;
  /** C++ 参数（规范化类型，driver 的 jAs<T> 转换依据） */
  cppParams: Array<{ name: string; type: string }>;
  cppReturnType: string;
  /** Python 参考签名是否解析成功（Python harness 只需方法名） */
  pythonAvailable: boolean;
}

export const problemJudgeMetaSchema = z.object({
  methodName: z.string().min(1),
  cppAvailable: z.boolean(),
  cppParams: z.array(z.object({ name: z.string(), type: z.string() })),
  cppReturnType: z.string(),
  pythonAvailable: z.boolean(),
});

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
  /** true 时只返回面试题库（questions 表 category=leetcode 共享题，source 形如 "LeetCode N"）对应的题 */
  interview: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type ProblemFilter = z.infer<typeof problemFilterSchema>;

/** problem.facets 入参：题库筛选候选项（标签/知识点）按分区枚举 */
export const problemFacetsSchema = z.object({
  source: problemSourceSchema.optional(),
  /** true 时只统计面试题库子集（与 problemFilterSchema.interview 同义） */
  interview: z.boolean().optional(),
});
export type ProblemFacetsInput = z.infer<typeof problemFacetsSchema>;

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
  /** 判题元数据（judge_type=internal 时由 content-kit 从参考代码解析；否则 null） */
  judgeMeta: problemJudgeMetaSchema.nullable().default(null),
  externalUrl: z.string().max(500).default(""),
});
export type ProblemImportItem = z.infer<typeof problemImportItemSchema>;

/** 题单（problems-algo/hot-interview.md 等，sync 解析正文题解链接产出） */
export const problemListImportItemSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  url: z.string().max(500).default(""),
  /** 成员题目的统一 ID，按题单出现顺序 */
  problemIds: z.array(z.string().min(1).max(128)).default([]),
  contentHash: z.string().min(1).max(64),
});
export type ProblemListImportItem = z.infer<typeof problemListImportItemSchema>;

export const contentImportSchema = z.object({
  contents: z.array(contentImportItemSchema).default([]),
  problems: z.array(problemImportItemSchema).default([]),
  lists: z.array(problemListImportItemSchema).default([]),
});
export type ContentImportInput = z.infer<typeof contentImportSchema>;

// ---------------------------------------------------------------------------
// router 输入参数（契约收编：原先散落在各 router 的局部 z.object 统一进 contracts）
// ---------------------------------------------------------------------------

/** 自增数字主键参数（questions 等） */
export const numericIdParamSchema = z.object({ id: z.number().int().min(1) });
export type NumericIdParam = z.infer<typeof numericIdParamSchema>;

/** 面试题自增主键参数（question.* 路由） */
export const questionIdParamSchema = z.object({ questionId: z.number().int().min(1) });
export type QuestionIdParam = z.infer<typeof questionIdParamSchema>;

/** 统一题目 ID 参数（judge.getProblem，数据源切换后 judge 面向 problems 表） */
export const judgeProblemParamSchema = z.object({ problemId: z.string().min(1).max(128) });
export type JudgeProblemParam = z.infer<typeof judgeProblemParamSchema>;

/** 面试场次自增主键参数（interview.reply/finish/get） */
export const sessionIdParamSchema = z.object({ sessionId: z.number().int().min(1) });
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

/** 评测提交自增主键参数（judge.getResult） */
export const submissionIdParamSchema = z.object({ submissionId: z.number().int().min(1) });
export type SubmissionIdParam = z.infer<typeof submissionIdParamSchema>;

/** 统一 ID 参数（contents/problems 的字符串主键，如 lc:1 / gpu:12 / learn:week1:day1） */
export const unifiedIdParamSchema = z.object({ id: z.string().min(1).max(128) });
export type UnifiedIdParam = z.infer<typeof unifiedIdParamSchema>;

/** 题单 slug 参数（/problems/lists/:slug，id 为 lc:list:{slug}） */
export const problemListSlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, "非法的题单标识"),
});
export type ProblemListSlugParam = z.infer<typeof problemListSlugParamSchema>;

/** 周赛场次参数（/problems/contest/:session，id 为 lc:contest:{session}q{n}） */
export const contestSessionParamSchema = z.object({
  session: z.number().int().min(1).max(999_999),
});
export type ContestSessionParam = z.infer<typeof contestSessionParamSchema>;

// ---------------------------------------------------------------------------
// GPU 知识领域（leetgpu SKILL.md §1.5 的 A–L 领域；题目侧以 slug 进 knowledge_points，
// web 的 GPU 分组视图按此常量渲染，领域元数据与 content-kit 保持一致）
// ---------------------------------------------------------------------------

export const GPU_DOMAINS = [
  { letter: "A", slug: "parallel-patterns", name: "基础并行模式（Element-wise / Memory-bound）" },
  { letter: "B", slug: "convolution-pooling", name: "卷积与池化（Convolution & Pooling）" },
  { letter: "C", slug: "reduction-scan", name: "归约与扫描（Reduction & Scan）" },
  { letter: "D", slug: "gemm", name: "矩阵乘法与 GEMM（GEMM & Matmul）" },
  { letter: "E", slug: "attention", name: "注意力机制（Attention）" },
  { letter: "F", slug: "normalization-embedding", name: "归一化与嵌入（Normalization & Embedding）" },
  { letter: "G", slug: "transformer-inference", name: "Transformer 组件与推理优化" },
  { letter: "H", slug: "quantization", name: "量化与低精度（Quantization）" },
  { letter: "I", slug: "sampling-sorting-search", name: "采样、排序与搜索" },
  { letter: "J", slug: "advanced-algorithms-math", name: "高级算法与数学" },
  { letter: "K", slug: "losses-basic-ml", name: "损失函数与基础 ML" },
  { letter: "L", slug: "simulation-misc", name: "其他综合与模拟" },
] as const;
export type GpuDomain = (typeof GPU_DOMAINS)[number];

export const questionUpdateSchema = z.object({
  id: z.number().int().min(1),
  data: questionInputSchema.partial(),
});
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export const questionBulkImportSchema = z.object({
  items: z.array(questionInputSchema).min(1),
});
export type QuestionBulkImportInput = z.infer<typeof questionBulkImportSchema>;

export const interviewReplySchema = z.object({
  sessionId: z.number().int().min(1),
  content: z.string().min(1),
});
export type InterviewReplyInput = z.infer<typeof interviewReplySchema>;

/** 在线评测支持的语言 */
export const JUDGE_LANGUAGES = ["cpp", "python"] as const;
export type JudgeLanguage = (typeof JUDGE_LANGUAGES)[number];
export const judgeLanguageSchema = z.enum(JUDGE_LANGUAGES);

export const judgeRunSchema = z.object({
  /** 统一题目 ID（judge 数据源已切换到 problems 表，2026-09-10 第六批） */
  problemId: z.string().min(1).max(128),
  language: judgeLanguageSchema,
  code: z.string().min(1).max(100_000),
});
export type JudgeRunInput = z.infer<typeof judgeRunSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: contentTypeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export const healthCheckSchema = z.object({ name: z.string().optional() }).optional();
export type HealthCheckInput = z.infer<typeof healthCheckSchema>;

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
