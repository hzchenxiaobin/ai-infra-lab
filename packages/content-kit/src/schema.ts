// schema.ts —— frontmatter 手写校验器（03-data-model.md §统一内容元数据）。
// 缺一个必填字段即产生 error；错误信息带文件路径与字段名。
import type { Fm } from "./frontmatter.ts";
import { validateId, type Classification } from "./ids.ts";

export interface ValidationError {
  file: string;
  field: string;
  message: string;
}

const TYPES = ["learn", "problem", "paper", "profiling"] as const;
const SOURCES = ["leetcode", "leetgpu", "contest"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const JUDGES = ["internal", "leetgpu-com", "none"] as const;
const PAPER_STATUS = ["done", "skeleton"] as const;
const LANGUAGES = ["cuda", "cpp", "python", "sql", "java", "javascript", "typescript"] as const;

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateFrontmatter(
  file: string,
  fm: Fm,
  cls: Classification,
): ValidationError[] {
  const errs: ValidationError[] = [];
  const fail = (field: string, message: string) => errs.push({ file, field, message });

  // ── 通用字段 ──
  if (typeof fm.id !== "string" || !fm.id) fail("id", "缺失或不是字符串");
  else if (!validateId(fm.id)) fail("id", `ID 形态非法: ${fm.id}`);
  else if (fm.id !== cls.id) fail("id", `与目录推导的 ID 不一致: 文件=${fm.id} 推导=${cls.id}`);

  if (typeof fm.type !== "string" || !(TYPES as readonly string[]).includes(fm.type))
    fail("type", `缺失或非法（应为 ${TYPES.join("|")}）: ${String(fm.type)}`);
  else if (fm.type !== cls.type) fail("type", `与目录推导的类型不一致: 文件=${fm.type} 推导=${cls.type}`);

  if (typeof fm.title !== "string" || !fm.title.trim()) fail("title", "缺失或为空");

  if (!isStrArray(fm.tags)) fail("tags", "缺失或不是字符串数组");
  else if (fm.tags.length === 0) fail("tags", "为空（至少一个标签）");

  if (!isStrArray(fm.knowledge_points)) fail("knowledge_points", "缺失或不是字符串数组");
  else if (fm.knowledge_points.length === 0) fail("knowledge_points", "为空（至少一个知识点）");

  if (typeof fm.updated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fm.updated))
    fail("updated", `缺失或日期格式非法（应为 YYYY-MM-DD）: ${String(fm.updated)}`);

  // ── type: learn ──
  if (cls.type === "learn") {
    if (!isStrArray(fm.related_problems)) fail("related_problems", "缺失或不是字符串数组");
    if (!isStrArray(fm.related_questions)) fail("related_questions", "缺失或不是字符串数组");
    if (cls.id.startsWith("learn:w")) {
      if (typeof fm.week !== "number" || fm.week < 1 || fm.week > 10)
        fail("week", `缺失或越界（1-10）: ${String(fm.week)}`);
      if (/^learn:w\d{2}d\d{2}/.test(cls.id)) {
        if (typeof fm.day !== "number" || fm.day < 1 || fm.day > 7)
          fail("day", `缺失或越界（1-7）: ${String(fm.day)}`);
      }
    }
    if (cls.id.startsWith("learn:topic:") || cls.topic) {
      if (typeof fm.topic !== "string" || !fm.topic) fail("topic", "缺失或为空");
    }
  }

  // ── type: problem ──
  if (cls.type === "problem") {
    if (typeof fm.source !== "string" || !(SOURCES as readonly string[]).includes(fm.source))
      fail("source", `缺失或非法（应为 ${SOURCES.join("|")}）: ${String(fm.source)}`);
    if (typeof fm.number !== "number" || !Number.isInteger(fm.number) || fm.number < 0)
      fail("number", `缺失或不是非负整数: ${String(fm.number)}`);
    if (
      typeof fm.difficulty !== "string" ||
      !(DIFFICULTIES as readonly string[]).includes(fm.difficulty)
    )
      fail("difficulty", `缺失或非法（应为 ${DIFFICULTIES.join("|")}）: ${String(fm.difficulty)}`);
    if (!isStrArray(fm.languages)) fail("languages", "缺失或不是字符串数组");
    else {
      const bad = fm.languages.filter((l) => !(LANGUAGES as readonly string[]).includes(l));
      if (bad.length) fail("languages", `非法语言: ${bad.join(", ")}（可选 ${LANGUAGES.join("|")}）`);
    }
    if (typeof fm.judge !== "string" || !(JUDGES as readonly string[]).includes(fm.judge))
      fail("judge", `缺失或非法（应为 ${JUDGES.join("|")}）: ${String(fm.judge)}`);
    if (!isStrArray(fm.related_learn)) fail("related_learn", "缺失或不是字符串数组");
  }

  // ── type: paper ──
  if (cls.type === "paper") {
    if (typeof fm.venue !== "string" || !fm.venue.trim()) fail("venue", "缺失或为空");
    if (typeof fm.status !== "string" || !(PAPER_STATUS as readonly string[]).includes(fm.status))
      fail("status", `缺失或非法（应为 ${PAPER_STATUS.join("|")}）: ${String(fm.status)}`);
  }

  return errs;
}
