// sync.ts —— 内容 → 元数据产物（对应 03 §内容→数据库同步管线的构建期段）。
//
// 产出（packages/content-kit/dist/）：
//   contents.json      contents 表结构：id/type/title/tags/knowledge_points/url/
//                      contentHash/status/updated_at（+ path 与 meta 附加字段）
//   problems.json      problems 表结构：id/source/number/difficulty/languages/
//                      judge_type/testcases/external_url
//   search-index.json  miniSearch 可用的轻量索引：id/title/summary/tags/url
//                      （正文剔除代码块后取摘要）
//
// contentHash 幂等：内容没变则 hash 不变（sha256 原文）。
// 内容正文不入库；源里消失的内容由下游导入方对比标 stale，本产物只含 published。
import fs from "node:fs";
import path from "node:path";
import { extractExternalUrl, scanContent, type ContentFile } from "./content.ts";
import { DIST_DIR, sha256 } from "./util.ts";

const files = scanContent();

const missing = files.filter((f) => !f.hasFrontmatter);
if (missing.length) {
  console.error(`error: ${missing.length} 篇缺少 frontmatter，先跑 backfill + lint。前 10 篇:`);
  for (const f of missing.slice(0, 10)) console.error(`  ${f.rel}`);
  process.exit(1);
}

const TYPE_META_KEYS: Record<string, string[]> = {
  learn: ["week", "day", "topic", "related_problems", "related_questions"],
  problem: ["source", "number", "difficulty", "languages", "judge", "related_learn"],
  paper: ["venue", "status"],
  profiling: [],
};

function row(f: ContentFile) {
  const fm = f.existing;
  const meta: Record<string, unknown> = {};
  for (const k of TYPE_META_KEYS[f.cls.type] ?? []) if (k in fm) meta[k] = fm[k];
  return {
    id: fm.id,
    type: fm.type,
    title: fm.title,
    tags: fm.tags,
    knowledge_points: fm.knowledge_points,
    url: f.cls.url,
    contentHash: sha256(f.raw),
    status: "published" as const,
    updated_at: fm.updated,
    path: f.rel,
    meta,
  };
}

function summarize(body: string): string {
  // 剔除代码块 / 图片 / 表格 / 标题，取前两段纯文本，截断 200 字符
  const lines = body.split("\n");
  let inFence = false;
  const paras: string[] = [];
  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const t = line.trim();
    if (!t || /^#/.test(t) || /^!?\[/.test(t) || /^\|/.test(t) || /^>/.test(t) || /^---+$/.test(t))
      continue;
    const text = t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*`]/g, "")
      .trim();
    if (text) paras.push(text);
    if (paras.length >= 2) break;
  }
  return paras.join(" ").slice(0, 200);
}

const contents = files.map(row).sort((a, b) => String(a.id).localeCompare(String(b.id)));

const problems = files
  .filter((f) => f.cls.type === "problem")
  .map((f) => ({
    id: f.existing.id,
    source: f.existing.source,
    number: f.existing.number,
    difficulty: f.existing.difficulty,
    languages: f.existing.languages,
    judge_type: f.existing.judge,
    testcases: [] as unknown[], // 内置评测用例尚未从「示例」段机器解析（见任务报告遗留问题）
    external_url: extractExternalUrl(f.body),
  }))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

const searchIndex = files
  .map((f) => ({
    id: f.existing.id,
    title: f.existing.title,
    type: f.existing.type,
    url: f.cls.url,
    tags: f.existing.tags,
    knowledge_points: f.existing.knowledge_points,
    summary: summarize(f.body),
  }))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

fs.mkdirSync(DIST_DIR, { recursive: true });
const write = (name: string, data: unknown) => {
  const p = path.join(DIST_DIR, name);
  fs.writeFileSync(p, JSON.stringify(data));
  return fs.statSync(p).size;
};

const s1 = write("contents.json", contents);
const s2 = write("problems.json", problems);
const s3 = write("search-index.json", searchIndex);

const fmt = (n: number) => (n / 1024 / 1024).toFixed(2) + " MB";
console.log("== sync 产物 ==");
console.log(`dist/contents.json      ${contents.length} 行  ${fmt(s1)}`);
console.log(`dist/problems.json      ${problems.length} 行  ${fmt(s2)}`);
console.log(`dist/search-index.json  ${searchIndex.length} 行  ${fmt(s3)}`);
