// content.ts —— 内容扫描与元数据提取（backfill / lint / sync / stats 共用）。
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, type Fm } from "./frontmatter.ts";
import { classify, type Classification } from "./ids.ts";
import { CONTENT_ROOT, mtimeDate, walkMd } from "./util.ts";

export interface ContentFile {
  /** 相对 content 根的 posix 路径 */
  rel: string;
  abs: string;
  cls: Classification;
  /** 文件里已有的 frontmatter（未经 backfill 时为空对象） */
  existing: Fm;
  hasFrontmatter: boolean;
  /** frontmatter 之后的正文 */
  body: string;
  raw: string;
  updated: string;
}

/** 扫描 content 根，排除 SKILL.md 与根 README，并按 classify 推导 ID */
export function scanContent(root: string = CONTENT_ROOT): ContentFile[] {
  const out: ContentFile[] = [];
  for (const rel of walkMd(root)) {
    const cls = classify(rel);
    if (!cls) continue;
    const abs = path.join(root, rel);
    const raw = fs.readFileSync(abs, "utf8");
    const { fm, body, hasFrontmatter } = parseFrontmatter(raw);
    out.push({ rel, abs, cls, existing: fm, hasFrontmatter, body, raw, updated: mtimeDate(abs) });
  }
  // GPU 目录序号冲突消歧：同难度同号（真实数据：medium 下 107-argmax 与
  // 107-ppo-clipped-surrogate-loss）按目录名排序追加 a/b 后缀。
  const byGpuId = new Map<string, ContentFile[]>();
  for (const f of out) if (f.cls.gpuKey) push(byGpuId, f.cls.id, f);
  for (const group of byGpuId.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.cls.gpuKey!.name.localeCompare(b.cls.gpuKey!.name));
    group.forEach((f, i) => {
      f.cls.id += String.fromCharCode(97 + i); // gpu:m:107a / gpu:m:107b
    });
  }
  return out;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

// ──────────────────────────── 正文元数据提取 ────────────────────────────

/** 去掉代码块后的行迭代（链接/标签等提取都不应扫到代码块内部） */
export function* bodyLines(body: string): Generator<{ line: string; no: number }> {
  let inFence = false;
  let no = 0;
  for (const line of body.split("\n")) {
    no++;
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) yield { line, no };
  }
}

export function extractTitle(f: ContentFile): string {
  // 1) 题解的「标题 / 题号」行：`**标题 / 题号**：相同的树（#100，easy）`
  //    兼容半角括号 `(#4043,Easy)` 与无题号（仅标题）两种变体
  const line = f.body.match(/^\s*[-*]?\s*\*\*标题\s*\/\s*题号\*\*\s*[：:]\s*(.+)$/m);
  if (line) {
    const t = line[1].replace(/\s*[（(]\s*#.*$/, "").trim();
    if (t) return t;
  }
  // 2) HTML 注释里的 title（problems-algo/topics 用此约定）
  const c = f.body.match(/<!--\s*title:\s*(.+?)\s*-->/);
  if (c) return c[1].trim();
  // 3) 第一个标题行（H1–H3），剥掉 emoji 与序号前缀；题解去掉「LeetCode」「题解」外壳
  for (const { line: l } of bodyLines(f.body)) {
    const h = l.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      let t = h[1]
        .replace(/^[🔥📅💡⚠️📌✅⬜🎯\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*/u, "")
        .trim();
      if (f.cls.type === "problem")
        t = t.replace(/^(LeetCode|LeetGPU)\s+/, "").replace(/\s*题解$/, "").trim();
      return t;
    }
  }
  // 4) 兜底：文件名
  const base = f.rel.split("/").pop()!.replace(/\.md$/, "");
  return base === "README" ? (f.rel.split("/").at(-2) ?? base) : base;
}

/** `**标签**：A、B、C` 行 → 清洗后的标签数组（保留原文，供 tags 字段） */
export function extractTags(body: string): string[] {
  const m = body.match(/^\s*[-*]?\s*\*\*标签\*\*[：:]\s*(.+)$/m);
  if (!m) return [];
  return m[1]
    .split(/[、，,]/)
    .map((s) => s.replace(/`/g, "").replace(/\s+/g, " ").trim())
    .filter((s) => s && !/^<.*>$/.test(s));
}

export type DifficultyText = "easy" | "medium" | "hard";

/** `**难度**：简单/中等/困难` → easy/medium/hard；多档并列（"简单 / 中等 / 困难"）取中间档 */
export function extractDifficulty(body: string): DifficultyText | null {
  const m = body.match(/^\s*[-*]?\s*\*\*难度\*\*[：:]\s*(.+)$/m);
  if (!m) return null;
  const v = m[1];
  if (/简单\s*\/\s*中等\s*\/\s*困难/.test(v)) return "medium";
  if (v.includes("困难")) return "hard";
  if (v.includes("中等")) return "medium";
  if (v.includes("简单")) return "easy";
  return null;
}

/** `**标题 / 题号**：…（#100，easy）` / `(#4043,Easy)` / `（#剑指 Offer 47，…）` → 原始题号 */
export function extractNumberLine(body: string): number | null {
  const m = body.match(
    /\*\*标题\s*\/\s*题号\*\*\s*[：:].+?[（(]\s*#\s*(?:剑指\s*Offer\s*)?(\d+)/,
  );
  return m ? +m[1] : null;
}

/** `**链接**：https://…` → 外部评测/原题地址 */
export function extractExternalUrl(body: string): string | null {
  const m = body.match(/^\s*[-*]?\s*\*\*链接\*\*[：:]\s*(https?:\/\/\S+)\s*$/m);
  return m ? m[1] : null;
}

const FENCE_LANG_MAP: Record<string, string> = {
  cpp: "cpp",
  "c++": "cpp",
  cuda: "cuda",
  cu: "cuda",
  python: "python",
  py: "python",
  sql: "sql",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
};
const LANG_ORDER = ["cuda", "cpp", "python", "sql", "java", "javascript", "typescript"];

/** 代码块语言集合（题解 languages 字段来源；text/bash 等非解题语言忽略） */
export function extractLanguages(body: string): string[] {
  const found = new Set<string>();
  for (const line of body.split("\n")) {
    const m = line.match(/^```([a-zA-Z+]+)/);
    if (m) {
      const lang = FENCE_LANG_MAP[m[1].toLowerCase()];
      if (lang) found.add(lang);
    }
  }
  return LANG_ORDER.filter((l) => found.has(l));
}

export interface MdLink {
  target: string;
  line: number;
  isImage: boolean;
}

/** 提取 markdown 链接与图片引用（跳过代码块内部；行内代码用占位符屏蔽，
 *  避免把 `` `kernel[grid](args)` `` 这类代码片段误判为链接）。
 *  匹配策略：定位 `](目标)`，再向前平衡括号找到 alt 的起始 `[`（支持任意层
 *  嵌套，如 `![示例演算：[1,[4,[6]]] 逐层…](x.svg)`），起始 `[` 前有 `!` 即图片。
 *  目标不含 "/" 也不含 "."（无扩展名）的匹配一律丢弃——那是表格/公式里的
 *  数组下标与数学记号（如 `s1[0](x)`、`[1,2](inc=1)`），不是链接。 */
export function extractLinks(body: string): MdLink[] {
  const out: MdLink[] = [];
  const re = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const { line, no } of bodyLines(body)) {
    const masked = line.replace(/`[^`]*`/g, (s) => "\u0000".repeat(s.length));
    for (const m of masked.matchAll(re)) {
      if (!/[/.]/.test(m[1])) continue;
      const close = m.index!;
      let depth = 0;
      let i = close;
      while (i >= 0) {
        const c = masked[i];
        if (c === "]") depth++;
        else if (c === "[") {
          depth--;
          if (depth === 0) break;
        }
        i--;
      }
      if (i <= 0) continue; // 前方无配对的 [，不是链接
      out.push({ target: m[1], line: no, isImage: masked[i - 1] === "!" });
    }
  }
  return out;
}

/** 论文 Metadata 表字段：`| Venue | NeurIPS 2022 |` */
export function extractMetaTable(body: string, field: string): string | null {
  const m = body.match(new RegExp(`^\\|\\s*${field}\\s*\\|\\s*([^|]+?)\\s*\\|`, "m"));
  return m ? m[1].trim() : null;
}

/** leetgpu.com/challenges/<slug> 链接（每日教程「任务 4」的配套练习来源） */
export function extractChallengeSlugs(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/leetgpu\.com\/challenges\/([a-z0-9-]+)/g)) out.add(m[1]);
  return [...out];
}

export function isExternalLink(target: string): boolean {
  return /^(https?:|mailto:|#|javascript:)/i.test(target);
}
