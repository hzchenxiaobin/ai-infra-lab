import {
  bigint,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import type { ProblemJudgeMeta, ProblemTestcase, ProgressStatus } from "@ailab/contracts";

// ---------------------------------------------------------------------------
// 账号域（dev/database.md §2.1）
// ---------------------------------------------------------------------------

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  /** 正式账号体系：邮箱唯一；历史自动 provision 的行 email 为 NULL */
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  emailVerified: int("email_verified").notNull().default(0),
  name: varchar("name", { length: 255 }).notNull().default("考生"),
  avatar: varchar("avatar", { length: 500 }),
  tier: mysqlEnum("tier", ["free", "pro"]).notNull().default("free"),
  /** 封禁时间（cli user:ban）；非空时登录与既有会话一律拒绝 */
  bannedAt: timestamp("banned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** OAuth 登录预留（GitHub/Google），M2 只建表不接登录链路 */
export const oauthIdentities = mysqlTable(
  "oauth_identities",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_oauth_provider_account").on(t.provider, t.providerAccountId)],
);

/** 注册验证码：code 只存哈希；attempts 记校验失败次数；发送限流以它为邮箱维度依据 */
export const emailVerifications = mysqlTable("email_verifications", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: int("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 配额域（dev/database.md §2.2：quota NULL = 不限，used 始终累加）
// ---------------------------------------------------------------------------

export const usageQuotas = mysqlTable(
  "usage_quotas",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    kind: mysqlEnum("kind", ["judge", "interview"]).notNull(),
    /** 计费周期标识（当前为 UTC 日粒度 YYYY-MM-DD） */
    period: varchar("period", { length: 32 }).notNull(),
    used: int("used").notNull().default(0),
    /** NULL = 不限（上线初期默认，2026-09 决策） */
    quota: int("quota"),
  },
  (t) => [uniqueIndex("uq_usage_quota").on(t.userId, t.kind, t.period)],
);

// ---------------------------------------------------------------------------
// 内容元数据域（dev/database.md §2.3；内容正文不入库，Git 是唯一事实来源）
// ---------------------------------------------------------------------------

export const contents = mysqlTable("contents", {
  /** 统一 ID（lc:0001 / gpu:m:007 / learn:w03d02 / paper:*），见 03 统一题目 ID 方案 */
  id: varchar("id", { length: 128 }).primaryKey(),
  type: mysqlEnum("type", ["learn", "problem", "paper", "profiling"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  tags: json("tags").$type<string[]>().notNull(),
  knowledgePoints: json("knowledge_points").$type<string[]>().notNull(),
  /** docs 站路径 */
  url: varchar("url", { length: 500 }).notNull().default(""),
  /** contentHash 幂等 upsert：未变跳过、变了更新、源里消失标 stale */
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["active", "stale"]).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/** contents 的 type=problem 子集单列，带评测字段 */
export const problems = mysqlTable("problems", {
  id: varchar("id", { length: 128 })
    .primaryKey()
    .references(() => contents.id),
  source: mysqlEnum("source", ["leetcode", "leetgpu", "contest"]).notNull(),
  number: int("number").notNull().default(0),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull(),
  languages: json("languages").$type<string[]>().notNull(),
  judgeType: mysqlEnum("judge_type", ["internal", "leetgpu-com", "none"]).notNull(),
  /** 内置评测用例（content-kit 从题面示例机器解析，judge 数据源） */
  testcases: json("testcases").$type<ProblemTestcase[]>().notNull(),
  /** 判题元数据（参考签名，content-kit 从题解代码解析；judge_type=internal 时非空） */
  judgeMeta: json("judge_meta").$type<ProblemJudgeMeta>(),
  /** judge_type=leetgpu-com 时跳 leetgpu.com 的评测地址 */
  externalUrl: varchar("external_url", { length: 500 }).notNull().default(""),
});

/** 知识点受控词表：内容/题目/面试题闭环的公共坐标系 */
export const knowledgePoints = mysqlTable("knowledge_points", {
  /** slug 主键（如 memory-coalescing） */
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  description: text("description").notNull().default(""),
});

/** 题单（hot-interview / 10 周计划）：成员题目统一 ID 有序列表，content-kit sync 解析正文产出 */
export const problemLists = mysqlTable("problem_lists", {
  /** 题单统一 ID（lc:list:{slug}） */
  id: varchar("id", { length: 128 }).primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  /** docs 站路径（/problems/lists/{slug}） */
  url: varchar("url", { length: 500 }).notNull().default(""),
  /** 成员题目统一 ID，按题单出现顺序 */
  problemIds: json("problem_ids").$type<string[]>().notNull(),
  /** contentHash 幂等 upsert（与 contents 同一模式） */
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ---------------------------------------------------------------------------
// 用户数据域（dev/database.md §2.4）
// ---------------------------------------------------------------------------

export const userProgress = mysqlTable(
  "user_progress",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    contentId: varchar("content_id", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["unseen", "seen", "mastered", "ac"])
      .$type<ProgressStatus>()
      .notNull()
      .default("unseen"),
    score: int("score"),
    /** 个人备注（刷题页「备注」：注意事项/易错点提醒），与状态无关可独立存在 */
    note: text("note"),
    lastAt: timestamp("last_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("uq_user_progress").on(t.userId, t.contentId)],
);

/** 评测提交，兼作 judge-worker 的任务队列（02 已决策，初期不上 MQ） */
export const submissions = mysqlTable("submissions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  /** 统一题目 ID（lc:0001 等；judge 数据源已切换到 problems 表，2026-09-10 第六批） */
  problemId: varchar("problem_id", { length: 128 }).notNull(),
  language: varchar("language", { length: 32 }).notNull(),
  code: text("code").notNull(),
  /** pending → running → ac/wa/ce/tle/mle/ie（ie = worker 自身故障，告警用） */
  status: mysqlEnum("status", ["pending", "running", "ac", "wa", "ce", "tle", "mle", "ie"])
    .notNull()
    .default("pending"),
  verdictDetail: json("verdict_detail").$type<Record<string, unknown>>(),
  runtimeMs: int("runtime_ms"),
  memoryKb: int("memory_kb"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  /** worker 领取时间（崩溃恢复：running 超时的行重置为 pending 重领） */
  startedAt: timestamp("started_at"),
});

// ---------------------------------------------------------------------------
// 面试域（已有；questions 补 knowledge_points 列）
// ---------------------------------------------------------------------------

export const questions = mysqlTable("questions", {
  id: serial("id").primaryKey(),
  /** 题目属主；NULL 表示全站共享题库（bank:/seed: 前缀导入的内置题），对所有账户可见 */
  userId: bigint("user_id", { mode: "number" }),
  category: mysqlEnum("category", ["leetcode", "cuda", "knowledge"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull(),
  tags: varchar("tags", { length: 500 }).notNull().default(""),
  followUps: json("follow_ups").$type<string[]>().notNull(),
  keyPoints: text("key_points").notNull().default(""),
  /** 知识点标签（与 contents.knowledge_points 同一受控词表，掌握度模型用）；存量数据为 NULL */
  knowledgePoints: json("knowledge_points").$type<string[]>(),
  source: varchar("source", { length: 255 }).notNull().default(""),
  /** 同步幂等键：repo:相对路径[:条目序号]；手工题为 manual:* / seed:* */
  sourceKey: varchar("source_key", { length: 500 }).notNull().default(""),
  contentHash: varchar("content_hash", { length: 64 }).notNull().default(""),
  stale: int("stale").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const interviewSessions = mysqlTable("interview_sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  categories: json("categories").$type<string[]>().notNull(),
  questionIds: json("question_ids").$type<number[]>().notNull(),
  currentIndex: int("current_index").notNull().default(0),
  followUpIndex: int("follow_up_index").notNull().default(0),
  status: mysqlEnum("status", ["active", "finished"]).notNull().default("active"),
  /** 冗余自 interview_reports（stats/list 轻量展示用，报告本体在拆表中） */
  overallGrade: varchar("overall_grade", { length: 8 }),
  /** scope 快照：建场时所考题目关联 knowledge_points 的并集（掌握度模型 interview 信号） */
  scopeKnowledgePoints: json("scope_knowledge_points").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

/** 评估报告（自 interview_sessions 拆出，03 数据模型）：weakPoints 为 knowledge_points 映射，
 *  驱动"报告 → 学习章节/练习题"推荐与掌握度聚合（database.md §2.4）。 */
export const interviewReports = mysqlTable(
  "interview_reports",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("session_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    overallGrade: varchar("overall_grade", { length: 8 }),
    evaluatedBy: varchar("evaluated_by", { length: 8 }),
    report: text("report").notNull(),
    /** 薄弱知识点（C/D 维度题目的 knowledge_points 并集，缺标签时回落题目 tags） */
    weakPoints: json("weak_points").$type<string[]>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_interview_report_session").on(t.sessionId)],
);

export const interviewMessages = mysqlTable("interview_messages", {
  id: serial("id").primaryKey(),
  sessionId: bigint("session_id", { mode: "number" }).notNull(),
  questionId: bigint("question_id", { mode: "number" }),
  role: mysqlEnum("role", ["interviewer", "candidate", "system"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** 复盘笔记：用户以 markdown 记录每次面试过程（模拟面试复盘 / 真实面经） */
export const interviewNotes = mysqlTable("interview_notes", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  /** markdown 正文 */
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
