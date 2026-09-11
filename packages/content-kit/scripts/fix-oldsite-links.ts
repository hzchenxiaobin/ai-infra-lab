// fix-oldsite-links.ts —— 旧站绝对 URL → 站内统一 ID 链接（backlog P2 正文改链）。
//
// 背景（04 去重矩阵遗留半边）：learn 81 篇 + problems-gpu 2 篇里 ~780 处硬编码
// 指向旧 GitHub Pages 站（hzchenxiaobin.github.io/{leetcode,leetgpu,ai-infra-notes}）
// 的外链，需改为站内统一 ID 链接。
//
// 形态决策（vitepress link_open 渲染规则实测，dev/content-site.md §6）：
//   - md 链接语法里以 / 开头的目标会被 joinPath(base)：同分区链接写分区相对
//     形态（learn 正文 /week1/day1 → 渲染 /learn/week1/day1）；
//   - 跨分区链接（learn ↔ problems/*、gpu 题 ↔ problems/*）必须用原生 HTML
//     <a href>（html_inline token 不走 link_open，不加 base，根绝对直达 caddy）。
//
// 映射规则（唯一命中才改写，未命中保持原样并报告）：
//   leetcode/problems/NNN_*.html   → /problems/algo/{NNNN}
//   leetcode/problems/10-week-plan.html / hot-interview.html → /problems/lists/…
//   leetgpu/leetgpu-<slug>-solution.html → /problems/gpu/{diff}/{num}-{name}（含 alias 表）
//   ai-infra-notes/weekN/dayM…     → /learn/weekN/dayM
//   ai-infra-notes/weekN/notes|profiles/… → 对应 notes/profiling 页（day 笔记并入 day 页）
//   ai-infra-notes/{topic}/index.html、paper/{slug}/index.html → topics/papers
//   ai-infra-notes/interview/      → /learn/notes/cuda-interview-notes
//
// 运行：node scripts/tsx.mjs scripts/fix-oldsite-links.ts [--dry]
import fs from "node:fs";
import path from "node:path";
import { scanContent } from "../src/content.ts";
import { CONTENT_ROOT } from "../src/util.ts";

const DRY = process.argv.includes("--dry");

// ── url 集 + 分区文件 ──
const files = scanContent();
const urlSet = new Set<string>();
for (const f of files) {
  if (!f.cls.url) continue;
  urlSet.add(f.cls.url);
  urlSet.add(f.cls.url.replace(/\/$/, ""));
}

// ── gpu 目录名 → 站内 url（含 alias：leetgpu 旧 slug 与新目录名的变体）──
const gpuByName = new Map<string, string>();
for (const diff of ["easy", "medium", "hard"]) {
  const d = path.join(CONTENT_ROOT, "problems-gpu/solutions", diff);
  if (!fs.existsSync(d)) continue;
  for (const dir of fs.readdirSync(d, { withFileTypes: true })) {
    if (dir.isDirectory() && fs.existsSync(path.join(d, dir.name, "index.md"))) {
      gpuByName.set(dir.name.replace(/^\d+-/, ""), `/problems/gpu/${diff}/${dir.name}`);
    }
  }
}
/** 旧 leetgpu slug → gpu 目录名（缩写/连字符/词序变体，实测未命中的 7 个） */
const LEETGPU_ALIAS: Record<string, string> = {
  "vector-addition": "vector-add",
  "causal-self-attention": "casual-attention", // 新目录名拼写沿用官方题面笔误 casual
  "gpt-2-transformer-block": "gpt2-block",
  "sliding-window-self-attention": "sliding-window-attn",
  "linear-self-attention": "linear-attention",
  "multi-agent-simulation": "multi-agent-sim",
  "2d-jacobi-stencil": "jacobi-stencil-2d",
};

const LEARN_TOPICS = new Set(
  fs
    .readdirSync(path.join(CONTENT_ROOT, "learn/topics"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name),
);

/** 旧站 URL → 站内目标（完整 url 形态）；null = 无法映射 */
function mapOldUrl(raw: string): { url: string; learnPartition: boolean } | null {
  const p = raw.replace(/^https?:\/\/hzchenxiaobin\.github\.io\//, "");
  if (p.startsWith("leetcode/")) {
    const rest = p.slice("leetcode/".length);
    if (rest === "" ) return { url: "/problems", learnPartition: false };
    if (rest === "problems/10-week-plan.html") return { url: "/problems/lists/10-week-plan", learnPartition: false };
    if (rest === "problems/hot-interview.html") return { url: "/problems/lists/hot-interview", learnPartition: false };
    const num = /^problems\/(\d+)_/.exec(rest);
    if (num) return { url: `/problems/algo/${num[1].padStart(4, "0")}`, learnPartition: false };
    return null;
  }
  if (p.startsWith("leetgpu/")) {
    const rest = p.slice("leetgpu/".length);
    if (rest === "") return { url: "/problems/gpu/", learnPartition: false };
    const slug = /^leetgpu-(.+)-solution(\.html)?$/.exec(rest);
    if (!slug) return null;
    const name = LEETGPU_ALIAS[slug[1]] ?? slug[1];
    const url = gpuByName.get(name);
    return url ? { url, learnPartition: false } : null;
  }
  if (p.startsWith("ai-infra-notes/")) {
    const rest = p.slice("ai-infra-notes/".length);
    // url 集内形态统一无尾斜杠（nginx try_files 自会补 /index.html）
    const day = /^(?:aiinfra\/daily\/)?(week\d+)\/day(\d+)(?:\/|\.|$)/.exec(rest);
    if (day) return { url: `/learn/${day[1]}/day${day[2]}`, learnPartition: true };
    const week = /^(week\d+)\/?$/.exec(rest);
    if (week) return { url: `/learn/${week[1]}`, learnPartition: true };
    const notes = /^(week\d+)\/notes\/(.+?)\.(?:html?|md)$/.exec(rest);
    if (notes) {
      const stem = notes[2];
      // day 笔记（day1_hello_gpu.md 等）已并入对应 day 主线页
      const dayInNotes = /^day(\d+)_/.exec(stem);
      if (dayInNotes) return { url: `/learn/${notes[1]}/day${dayInNotes[1]}`, learnPartition: true };
      const slug = stem.replace(/_/g, "-");
      const url = `/learn/${notes[1]}/notes/${slug}`;
      if (urlSet.has(url)) return { url, learnPartition: true };
      // 其余 notes 页（cuda_programming_guide_performance 等）并入周笔记汇总
      return { url: `/learn/${notes[1]}/notes/week${notes[1].slice(4)}-notes`, learnPartition: true };
    }
    const profiles = /^(week\d+)\/profiles\/(.+?)\.(?:html?|md)$/.exec(rest);
    if (profiles) {
      const url = `/learn/${profiles[1]}/profiles/${profiles[2].replace(/_/g, "-")}`;
      if (urlSet.has(url)) return { url, learnPartition: true };
      return { url: `/learn/${profiles[1]}/notes/week${profiles[1].slice(4)}-notes`, learnPartition: true };
    }
    // week1/exercise/* 目录已不存在（练习并入 day 页），回落周首页
    if (/^week\d+\/exercise\//.test(rest)) {
      const w = /^(week\d+)\//.exec(rest)!;
      return { url: `/learn/${w[1]}`, learnPartition: true };
    }
    if (rest === "interview/" || rest === "interview") return { url: "/learn/notes/cuda-interview-notes", learnPartition: true };
    const topic = /^([^/]+)\/index\.html?$/.exec(rest);
    if (topic && LEARN_TOPICS.has(topic[1])) return { url: `/learn/topics/${topic[1]}`, learnPartition: true };
    const paper = /^paper\/([^/]+)\/index\.html?$/.exec(rest);
    if (paper && urlSet.has(`/learn/papers/${paper[1]}`)) return { url: `/learn/papers/${paper[1]}`, learnPartition: true };
    return null;
  }
  return null;
}

// ── 遍历 learn + problems-gpu 的 md（站点内容 + SKILL.md 写作规范），改写旧站链接 ──
const targets = files.filter(
  (f) => f.cls.partition === "learn" || f.cls.partition === "problems-gpu",
);
// SKILL.md 不进站点（scanContent 不扫），但作为写作规范里的参照链接同样去旧站化
{
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name === "SKILL.md") {
        targets.push({
          abs,
          rel: path.relative(CONTENT_ROOT, abs).split(path.sep).join("/"),
          cls: { partition: "learn" } as (typeof targets)[number]["cls"],
        } as (typeof targets)[number]);
      }
    }
  };
  walk(path.join(CONTENT_ROOT, "learn"));
  walk(path.join(CONTENT_ROOT, "problems-gpu"));
}
const OLD_RE = /https?:\/\/hzchenxiaobin\.github\.io\/[^)\s"<>]+/;
const MD_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

let fixed = 0;
let filesTouched = 0;
const unmatched = new Map<string, number>();

const stripInlineFormat = (alt: string) => alt.replace(/\*\*|__|`/g, "");

for (const f of targets) {
  const raw = fs.readFileSync(f.abs, "utf8");
  const outLines: string[] = [];
  let inFence = false;
  let changed = false;

  for (const line of raw.split("\n")) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      outLines.push(line);
      continue;
    }
    // 旧迁移公告（裸 autolink ×2，week6/day7 与 week7/day7）：文案已过时，整行换为站内指引
    const notice =
      /^> 📎 LeetGPU \/ LeetCode 题解已迁移至独立站点：<https:\/\/hzchenxiaobin\.github\.io\/leetgpu\/> 、<https:\/\/hzchenxiaobin\.github\.io\/leetcode\/>/.test(
        line,
      );
    if (notice) {
      outLines.push(`> 📎 LeetGPU / LeetCode 题解已并入本站：<a href="/problems/gpu/">GPU 题解</a> · <a href="/problems">算法题解</a>`);
      fixed++;
      changed = true;
      continue;
    }
    if (inFence || !OLD_RE.test(line)) {
      outLines.push(line);
      continue;
    }
    const masked = line.replace(/`[^`]*`/g, (s) => "\u0000".repeat(s.length));
    let result = "";
    let last = 0;
    for (const m of masked.matchAll(MD_LINK_RE)) {
      const [full, bang, alt, target] = m;
      if (bang === "!" || !/^https?:\/\/hzchenxiaobin\.github\.io\//.test(target)) continue;
      const mapped = mapOldUrl(target);
      if (!mapped) {
        unmatched.set(target, (unmatched.get(target) ?? 0) + 1);
        continue;
      }
      if (!urlSet.has(mapped.url) && mapped.url !== "/problems" && mapped.url !== "/problems/gpu/") {
        unmatched.set(`${target} → 目标缺失 ${mapped.url}`, (unmatched.get(`${target} → 目标缺失 ${mapped.url}`) ?? 0) + 1);
        continue;
      }
      // cuda-interview-notes 渲染在 learn 分区（learn 目标 = 同分区 md 链接）；
      // 其余文件按自身分区判定
      const rendersInLearn = f.rel === "problems-gpu/cuda-interview-notes.md" || f.cls.partition === "learn";
      const samePartition = mapped.learnPartition && rendersInLearn;
      const replacement = samePartition
        ? `[${alt}](${mapped.url.replace(/^\/learn/, "")})`
        : `<a href="${mapped.url}">${stripInlineFormat(alt)}</a>`;
      // 整段替换 [alt](url)（masked 与原行等长，位置对齐）
      const start = m.index!;
      result += line.slice(last, start) + replacement;
      last = start + full.length;
      fixed++;
      changed = true;
    }
    result += line.slice(last);
    outLines.push(result);
  }

  if (changed) {
    filesTouched++;
    if (!DRY) fs.writeFileSync(f.abs, outLines.join("\n"));
  }
}

console.log(`== fix-oldsite-links 结果（${DRY ? "dry run" : "已写回"}）==`);
console.log(`改写 ${fixed} 处 / ${filesTouched} 文件 | 未映射 ${[...unmatched.values()].reduce((a, b) => a + b, 0)} 处`);
for (const [u, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ? ${u} ×${n}`);
