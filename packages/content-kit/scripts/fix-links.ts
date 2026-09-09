// fix-links.ts —— 一次性修复 problems-algo 题解间的错误相对链接（04 迁移收尾）。
//
// 背景：leetcode 仓库快照里大量题解互链是坏的（本仓库 lint 报 ~610 处悬空），
// 典型形态：
//   1. 文件名含空格、链接漏空格   （45_跳跃游戏 II.md ↔ 45_跳跃游戏II.md）
//   2. 跨目录引用漏写 ../区间/ 前缀（2701-2800 里写 2633_xxx.md）
//   3. 区间目录名写错             （../0181-0200/187_xxx.md，实际在 0101-0200）
//   4. 题名译法漂移               （236_二叉树最近公共祖先 ↔ 236_二叉树的最近公共祖先）
//
// 修复策略（保守，唯一命中才改写）：
//   - 建「去空白后的文件名 → 文件」索引，覆盖 1/2/3；
//   - 文件名未命中时按「题号前缀 NNN_」索引兜底，覆盖 4；
//   - 歧义 / 未命中保持原样，结尾报告人工处理。
// 改写后的相对路径空格与括号做百分号编码（markdown 链接目标要求）。
//
// 运行：node scripts/tsx.mjs scripts/fix-links.ts [--dry]
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "../src/util.ts";

const DRY = process.argv.includes("--dry");
const ALGO_ROOT = path.join(CONTENT_ROOT, "problems-algo");

// ── 索引：去空白文件名 / 题号前缀 → 文件（相对 problems-algo 的 posix 路径）──
const byName = new Map<string, string[]>();
const byNumber = new Map<string, string[]>();
const IMG_EXT = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs);
    else if (
      (e.name.endsWith(".md") && e.name !== "SKILL.md" && e.name !== "README.md") ||
      IMG_EXT.has(path.extname(e.name).toLowerCase())
    ) {
      const rel = path.relative(ALGO_ROOT, abs).split(path.sep).join("/");
      const norm = e.name.replace(/\s+/g, "");
      if (norm !== "INDEX.md") {
        const arr = byName.get(norm) ?? [];
        arr.push(rel);
        byName.set(norm, arr);
      }
      const num = /^(\d+)_/.exec(e.name);
      if (num && e.name.endsWith(".md")) {
        const arr = byNumber.get(num[1]) ?? [];
        arr.push(rel);
        byNumber.set(num[1], arr);
      }
    }
  }
};
walk(ALGO_ROOT);

const encodeTarget = (p: string) => p.replace(/ /g, "%20").replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const LINK_RE = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
let fixed = 0;
let unresolved = 0;
const unresolvedList: string[] = [];

const walkMd = (dir: string, out: string[]) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(abs, out);
    else if (e.name.endsWith(".md") && e.name !== "SKILL.md") out.push(abs);
  }
};
const mdFiles: string[] = [];
walkMd(ALGO_ROOT, mdFiles);

for (const abs of mdFiles) {
  const raw = fs.readFileSync(abs, "utf8");
  const relToAlgo = path.relative(ALGO_ROOT, abs).split(path.sep).join("/");
  const dirPosix = path.dirname(relToAlgo);
  const outLines: string[] = [];
  let inFence = false;
  let changed = false;

  for (const line of raw.split("\n")) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      outLines.push(line);
      continue;
    }
    if (inFence) {
      outLines.push(line);
      continue;
    }
    // 行内代码占位屏蔽（与 lint 的 extractLinks 同规则），保持长度以对齐位置
    const masked = line.replace(/`[^`]*`/g, (s) => "\u0000".repeat(s.length));
    if (!/]\(/.test(masked)) {
      outLines.push(line);
      continue;
    }
    let result = "";
    let last = 0;
    for (const m of masked.matchAll(LINK_RE)) {
      const target = m[2];
      if (/^(https?:|mailto:|#|javascript:)/i.test(target)) continue;
      const [pure, anchor = ""] = target.split("#", 2);
      if (!pure) continue;
      let decoded = pure;
      try {
        decoded = decodeURIComponent(pure);
      } catch {
        /* 保持原样 */
      }
      const absTarget = path.join(ALGO_ROOT, dirPosix, decoded);
      if (fs.existsSync(absTarget)) continue; // 本来就好的
      // 跨仓链接改址：leetcode 题解 → ai-infra-notes 学习路径，新布局为 learn/
      const notes = /(?:\.\.\/)+ai-infra-notes\/aiinfra\/(.+)$/.exec(decoded);
      if (notes) {
        const learnRel = path
          .relative(path.join(ALGO_ROOT, dirPosix), path.join(CONTENT_ROOT, "learn", notes[1]))
          .split(path.sep)
          .join("/");
        const newTarget = encodeTarget(learnRel) + (anchor ? `#${anchor}` : "");
        const start = m.index! + m[0].lastIndexOf("(" + target);
        result += line.slice(last, start) + "(" + newTarget;
        last = start + 1 + target.length;
        changed = true;
        fixed++;
        continue;
      }
      if (!/[/.]/.test(pure)) continue; // 数学/下标记号误判，不是链接
      const base = decoded.split("/").pop() ?? decoded;
      const norm = base.replace(/\s+/g, "");
      let hits = byName.get(norm) ?? [];
      if (hits.length !== 1) {
        const num = /^(\d+)_/.exec(base);
        if (num) hits = byNumber.get(num[1]) ?? [];
      }
      if (hits.length === 1) {
        let relPath = path.relative(dirPosix, hits[0]).split(path.sep).join("/");
        if (!relPath.startsWith(".")) relPath = `./${relPath}`;
        const newTarget = encodeTarget(relPath) + (anchor ? `#${anchor}` : "");
        // 同位置替换（masked 与原行等长）
        const start = m.index! + m[0].lastIndexOf("(" + target);
        result += line.slice(last, start) + "(" + newTarget;
        last = start + 1 + target.length;
        changed = true;
        fixed++;
      } else {
        unresolved++;
        unresolvedList.push(`${relToAlgo} → ${target}${hits.length > 1 ? `（${hits.length} 个候选）` : ""}`);
      }
    }
    result += line.slice(last);
    outLines.push(result);
  }

  if (changed && !DRY) fs.writeFileSync(abs, outLines.join("\n"));
}

console.log(`== fix-links 结果（${DRY ? "dry run" : "已写回"}）==`);
console.log(`修复 ${fixed} 处 | 未解决 ${unresolved} 处`);
for (const u of unresolvedList.slice(0, 30)) console.log(`  ? ${u}`);
if (unresolvedList.length > 30) console.log(`  …另 ${unresolvedList.length - 30} 条`);
