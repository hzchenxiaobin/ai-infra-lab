// frontmatter.ts —— 受控 YAML 子集的 frontmatter 解析/序列化。
// 支持的值类型：扁平 key、双/单引号字符串、裸字符串、[a, b] 行内数组、
// 数字、布尔、日期字符串。不引入 gray-matter/yaml/zod（零新增依赖约束）。

export type FmScalar = string | number | boolean;
export type FmValue = FmScalar | string[];
export type Fm = Record<string, FmValue>;

export interface Parsed {
  fm: Fm;
  /** frontmatter 之后的正文（不含闭合 fence；含前导空行时已被去掉一个） */
  body: string;
  hasFrontmatter: boolean;
}

/** 序列化时的固定 key 顺序：通用字段在前，之后 learn / problem / paper 附加字段 */
const KEY_ORDER = [
  "id",
  "type",
  "title",
  "tags",
  "knowledge_points",
  "updated",
  "week",
  "day",
  "topic",
  "related_problems",
  "related_questions",
  "source",
  "number",
  "difficulty",
  "languages",
  "judge",
  "related_learn",
  "venue",
  "status",
];

export function parseFrontmatter(text: string): Parsed {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: text, hasFrontmatter: false };
  return { fm: parseYamlSubset(m[1]), body: text.slice(m[0].length), hasFrontmatter: true };
}

export function parseYamlSubset(src: string): Fm {
  const fm: Fm = {};
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const km = line.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/);
    if (!km) continue; // 子集之外的构造不出现于我们的 frontmatter
    const [, key, rest] = km;
    fm[key] = rest === undefined || rest === "" ? "" : parseValue(rest.trim());
  }
  return fm;
}

function parseValue(v: string): FmValue {
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return splitFlow(inner).map((s) => String(parseScalar(s.trim())));
  }
  return parseScalar(v);
}

function splitFlow(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseScalar(v: string): FmScalar {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"'))
    return v.slice(1, -1).replace(/\\(["\\])/g, "$1");
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'"))
    return v.slice(1, -1).replace(/''/g, "'");
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function serializeFrontmatter(fm: Fm): string {
  const keys = [
    ...KEY_ORDER.filter((k) => k in fm),
    ...Object.keys(fm)
      .filter((k) => !KEY_ORDER.includes(k))
      .sort(),
  ];
  const lines = keys.map((k) => `${k}: ${serializeValue(fm[k])}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function serializeValue(v: FmValue): string {
  if (Array.isArray(v)) return `[${v.map(serializeString).join(", ")}]`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return serializeString(v);
}

/** 安全的裸标量（字母/数字/._/- 组成，含 CJK；日期单独放行）不加引号 */
function serializeString(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s !== "" && /^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(s) && !/^(true|false)$/.test(s))
    return s;
  return JSON.stringify(s);
}
