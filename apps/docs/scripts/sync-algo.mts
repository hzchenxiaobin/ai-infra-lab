// sync-algo.mts —— packages/content/problems-algo → apps/docs/algo/src 的 URL 形态拷贝。
//
// 目录映射（对齐 ids.ts 的 contents.url，题解 URL 不含区间段）：
//   solution/{range}/{num}_{title}.md  → src/algo/{num:04d}.md     （扁平，区间仅作列表分组）
//   solution/{range}/LCOF{n}_{...}.md  → src/algo/lcof-{n}.md
//   solution/INDEX.md                   → src/algo/index.md
//   contest/{n}/Q{q}.{...}题解.md       → src/contest/{n}/q{q}.md
//   topics/{slug}.md                    → src/algo/topics/{slug}.md
//   hot-interview.md / 10-week-plan.md  → src/lists/{slug}.md
//   solution/images/**                  → src/public/images/**      （题解插图，~11.7k 张）
//   images/**                           → src/public/contest-images/**（周赛/专题插图；与
//                                          solution/images 有 416 个同名不同文件，独立命名空间）
//
// 链接重写（解析式，非模式匹配）：每条站内相对链接先按原目录结构解析为绝对路径，
// 再查「原路径 → 新路径」映射表改写为相对链接；图片按解析结果分流到两个命名空间。
// 锚点（#fragment）保留。
//
// 分批构建（dev/content-site.md §3，leetcode 血泪经验）：BATCH_TOTAL / BATCH_INDEX 环境变量
// 把题解按题号切成连续批次；分批时共享页（首页/列表/周赛/专题/题单/public）只在第 0 批。
// 运行：pnpm --filter docs sync:algo（本地全量）或 BATCH_TOTAL=4 BATCH_INDEX=0 …
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../../packages/content/problems-algo");
const DEST = path.resolve(here, "../algo/src");

const BATCH_TOTAL = Math.max(1, parseInt(process.env.BATCH_TOTAL || "1", 10));
const BATCH_INDEX = Math.max(0, parseInt(process.env.BATCH_INDEX || "0", 10));
const batching = BATCH_TOTAL > 1;
const isBatch0 = BATCH_INDEX === 0;

const pad4 = (n: number) => String(n).padStart(4, "0");

// ---------------------------------------------------------------------------
// 第一遍：扫描 solution/contest/topics 建立原路径 → 新 src 相对路径映射
// ---------------------------------------------------------------------------

interface Entry {
  /** 原 md 绝对路径 */
  abs: string;
  /** 新 src 内相对路径（posix） */
  rel: string;
  /** 题号（用于分批切片；非题目为 -1） */
  num: number;
}

const entries: Entry[] = [];

{
  const solRoot = path.join(SRC, "solution");
  for (const range of await readdir(solRoot)) {
    if (!/^\d{4}-\d{4}$/.test(range)) continue;
    for (const f of await readdir(path.join(solRoot, range))) {
      if (!f.endsWith(".md") || f === "INDEX.md") continue;
      const m = /^(\d+)_/.exec(f);
      const lcof = /^LCOF(\d+)_/.exec(f);
      entries.push({
        abs: path.join(solRoot, range, f),
        rel: m ? `algo/${pad4(parseInt(m[1]))}.md` : `algo/lcof-${parseInt(lcof![1])}.md`,
        num: m ? parseInt(m[1]) : 8000 + parseInt(lcof![1]), // LCOF 排最后一批
      });
    }
  }
  if (existsSync(path.join(solRoot, "INDEX.md"))) {
    entries.push({ abs: path.join(solRoot, "INDEX.md"), rel: "algo/index.md", num: -1 });
  }
}

const contestEntries: Entry[] = [];
{
  const cRoot = path.join(SRC, "contest");
  for (const d of await readdir(cRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of await readdir(path.join(cRoot, d.name))) {
      if (!f.endsWith(".md")) continue;
      const q = /^Q(\d+)\./.exec(f);
      if (!q) continue;
      contestEntries.push({
        abs: path.join(cRoot, d.name, f),
        rel: `contest/${d.name}/q${parseInt(q[1])}.md`,
        num: -1,
      });
    }
  }
}

const topicEntries: Entry[] = [];
for (const f of await readdir(path.join(SRC, "topics"))) {
  if (f.endsWith(".md")) topicEntries.push({ abs: path.join(SRC, "topics", f), rel: `algo/topics/${f}`, num: -1 });
}
for (const slug of ["hot-interview", "10-week-plan"]) {
  topicEntries.push({ abs: path.join(SRC, `${slug}.md`), rel: `lists/${slug}.md`, num: -1 });
}

const allEntries = [...entries, ...contestEntries, ...topicEntries];
const byAbs = new Map(allEntries.map((e) => [e.abs, e.rel]));

// ---------------------------------------------------------------------------
// 分批切片（题解按题号连续切；共享页与 public 仅第 0 批）
// ---------------------------------------------------------------------------

let solutionSlice = entries;
if (batching) {
  const sorted = [...entries].sort((a, b) => a.num - b.num);
  const per = Math.ceil(sorted.length / BATCH_TOTAL);
  solutionSlice = sorted.slice(BATCH_INDEX * per, (BATCH_INDEX + 1) * per);
}

// ---------------------------------------------------------------------------
// 第二遍：拷贝 + 链接重写
// ---------------------------------------------------------------------------

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

const IMG_EXT = /\.(svg|png|jpe?g|gif|webp)$/i;
// 匹配 `](目标)`（向前平衡括号确认存在 alt 的 `[`），支持 alt 任意层嵌套括号
// （如 ![示例演算：[1,[4,[6]]] 逐层…](x.svg)）；与 content-kit extractLinks 同策略
const LINK_RE = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function hasAltOpenBracket(masked: string, close: number): boolean {
  let depth = 0;
  let i = close;
  while (i >= 0) {
    const c = masked[i];
    if (c === "]") depth++;
    else if (c === "[") {
      depth--;
      if (depth === 0) return i > 0;
    }
    i--;
  }
  return false;
}

/** 单个 md：拷贝到新位置，重写其中的站内相对链接 */
async function copyRewritten(entry: Entry) {
  let raw = await readFile(entry.abs, "utf8");
  const lines: string[] = [];
  let inFence = false;
  for (const line of raw.split("\n")) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      lines.push(line);
      continue;
    }
    if (inFence || !/]\(/.test(line)) {
      lines.push(line);
      continue;
    }
    // 行内代码占位（与 content-kit extractLinks 同规则）
    const masked = line.replace(/`[^`]*`/g, (s) => "\u0000".repeat(s.length));
    let result = "";
    let last = 0;
    for (const m of masked.matchAll(LINK_RE)) {
      const [full, target] = m;
      if (!hasAltOpenBracket(masked, m.index!)) continue; // 前方无 [alt]，非链接
      if (/^(https?:|mailto:|#|javascript:)/i.test(target)) continue;
      const hashIdx = target.indexOf("#");
      const pure = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
      const hash = hashIdx >= 0 ? target.slice(hashIdx) : "";
      if (!pure) continue;
      let decoded = pure;
      try {
        decoded = decodeURIComponent(pure);
      } catch {
        /* keep */
      }
      const resolved = path.resolve(path.dirname(entry.abs), decoded);
      let replacement: string | null = null;
      const mapped = byAbs.get(resolved);
      if (mapped) {
        // md → md：相对链接（VitePress 按相对路径做 .md → .html + base 转换）
        let rel = path
          .relative(path.dirname(path.join(DEST, entry.rel)), path.join(DEST, mapped))
          .split(path.sep)
          .join("/");
        if (!rel.startsWith(".")) rel = `./${rel}`;
        replacement = rel + hash;
      } else if (IMG_EXT.test(decoded)) {
        // 图片：分流到两个 public 命名空间（根绝对路径自动带 base，见 gpu 分区验证）
        const norm = resolved.split(path.sep).join("/");
        if (norm.includes("/solution/images/")) replacement = `/images/${path.basename(resolved)}`;
        else if (/\/problems-algo\/images\//.test(norm)) replacement = `/contest-images/${path.basename(resolved)}`;
        else if (existsSync(resolved)) replacement = null; // 同目录或未知位置图片，保持相对
      }
      if (replacement != null) {
        const start = m.index! + full.lastIndexOf("(" + target);
        result += line.slice(last, start) + "(" + replacement;
        last = start + 1 + target.length;
      }
    }
    result += line.slice(last);
    lines.push(result);
  }
  raw = lines.join("\n");
  const dest = path.join(DEST, entry.rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, raw);
}

for (const e of solutionSlice) await copyRewritten(e);
// 图片 public：每批都拷（根绝对 /images/... 引用需要 public 存在才能解析；
// 产物为内容相同的原样文件，合并时幂等覆盖）
await cp(path.join(SRC, "solution/images"), path.join(DEST, "public/images"), { recursive: true });
await cp(path.join(SRC, "images"), path.join(DEST, "public/contest-images"), { recursive: true });
if (!batching || isBatch0) {
  for (const e of [...contestEntries, ...topicEntries]) await copyRewritten(e);
}

// ---------------------------------------------------------------------------
// 生成页（首页 / 题解列表 / 周赛列表 / 题单索引）—— 仅第 0 批
// ---------------------------------------------------------------------------

if (!batching || isBatch0) {
  const total = entries.length;
  await writeFile(
    path.join(DEST, "index.md"),
    `---
title: 算法题解
---

<div align="center">

# 算法题解

每日一题 ${total} 篇 · 周赛 ${contestEntries.length} 题 · 题单 2 份

[全部题解](/solutions.html) · [周赛](/contests.html) · [题单](/lists.html)

</div>
`,
  );
  await writeFile(
    path.join(DEST, "solutions.md"),
    `---\ntitle: 全部题解\nlayout: page\nsidebar: false\naside: false\n---\n\n<SolutionList />\n`,
  );
  await writeFile(
    path.join(DEST, "contests.md"),
    `---\ntitle: 周赛题解\nlayout: page\nsidebar: false\naside: false\n---\n\n<ContestList />\n`,
  );
  await writeFile(
    path.join(DEST, "lists.md"),
    `---\ntitle: 题单\n---\n\n# 题单\n\n- [面试高频题 hot-interview](/lists/hot-interview)\n- [10 周刷题计划](/lists/10-week-plan)\n`,
  );
}

console.log(
  `== sync-algo${batching ? ` (batch ${BATCH_INDEX + 1}/${BATCH_TOTAL})` : ""} ==\n${SRC} → ${DEST}\n题解 ${solutionSlice.length}/${entries.length} · 周赛 ${batching && !isBatch0 ? 0 : contestEntries.length} · 专题+题单 ${batching && !isBatch0 ? 0 : topicEntries.length}`,
);
