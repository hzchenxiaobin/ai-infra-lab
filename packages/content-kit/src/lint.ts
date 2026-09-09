// lint.ts —— 内容质量门（error 非零退出，warning 仅告警）。
//
// 检查项（dev/content-kit.md §4）：
//   error: frontmatter 结构（缺字段即失败）、ID 全局唯一、目录名 ↔ id 一致性、
//          重复标题（同分区同类型）、悬空链接（相对 md/图片/文件引用）、
//          related_problems ↔ related_learn 对称性与悬空统一 ID 引用
//   warning: 手写统计数（陈旧口径）、GPU 题解 6 段式结构、词表外知识点（汇总）、
//            GPU 目录序号 ↔ 官方题号错位、GPU 难度目录 ↔ 正文难度不一致、
//            孤儿图片、GPU 题目录缺同名 .cu、旧站点外链（汇总）
import fs from "node:fs";
import path from "node:path";
import { extractLinks, isExternalLink, scanContent } from "./content.ts";
import { validateFrontmatter } from "./schema.ts";
import { VOCAB } from "./knowledge-points.ts";
import { CONTENT_ROOT, DIST_DIR, dirnamePosix } from "./util.ts";

const files = scanContent();
const byId = new Map<string, (typeof files)[number]>();

const errors: string[] = [];
const warnings: string[] = [];
const err = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);

// ── 1. frontmatter 结构 + 2. ID 唯一/一致 ──
for (const f of files) {
  if (!f.hasFrontmatter) {
    err(`${f.rel}: 缺少 frontmatter（先跑 backfill）`);
    continue;
  }
  for (const e of validateFrontmatter(f.rel, f.existing, f.cls))
    err(`${e.file}: 字段 ${e.field}: ${e.message}`);
  const prev = byId.get(String(f.existing.id ?? f.cls.id));
  if (prev) err(`${f.rel}: ID 重复（与 ${prev.rel} 同为 ${f.existing.id}）`);
  else byId.set(String(f.existing.id ?? f.cls.id), f);
}

// ── 3. 重复标题（同分区同类型；problem 除外）──
// problem 不查重：LeetCode 官方题名可合法重复——同一题 solution/contest 双写
//（lc:0001 与 lc:contest:518q3 设计上共存，03 §统一题目 ID 方案），以及
// 不同题共用译名（86/725 均为「分隔链表」）。题目重复由 ID 唯一性检查兜底。
{
  const seen = new Map<string, (typeof files)[number]>();
  for (const f of files) {
    if (f.cls.type === "problem") continue;
    const title = typeof f.existing.title === "string" ? f.existing.title.trim() : "";
    if (!title) continue;
    const key = `${f.cls.partition}/${f.cls.type}/${title}`;
    const prev = seen.get(key);
    if (prev)
      err(`${f.rel}: 重复标题「${title}」（与 ${prev.rel}，同分区 ${f.cls.partition}/${f.cls.type}）`);
    else seen.set(key, f);
  }
}

// ── 4. 悬空链接 ──
// 相对链接相对文件目录解析；站点根绝对路径（/images/...）相对所属分区根解析
// （problems-gpu 的历史图片引用均为 /images/xxx.svg，指向 problems-gpu/images/）。
let dangling = 0;
for (const f of files) {
  for (const link of extractLinks(f.body)) {
    if (isExternalLink(link.target)) continue;
    let target = link.target.split("#")[0].split("?")[0];
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      /* 保持原样 */
    }
    let abs: string;
    if (target.startsWith("/")) {
      abs = path.join(CONTENT_ROOT, f.cls.partition, target.replace(/^\/+/, ""));
    } else {
      abs = path.join(CONTENT_ROOT, dirnamePosix(f.rel), target);
    }
    if (!fs.existsSync(abs)) {
      dangling++;
      err(`${f.rel}:${link.line}: 悬空链接 ${link.target}`);
    }
  }
}

// ── 5. related 对称性与统一 ID 引用有效性 ──
{
  let asymmetric = 0;
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const refCheck = (fromRel: string, field: string, ids: unknown, backField: string) => {
    if (!Array.isArray(ids)) return;
    const selfId = byRel.get(fromRel)?.existing.id;
    if (typeof selfId !== "string") return;
    for (const id of ids) {
      const t = byId.get(String(id));
      if (!t) {
        err(`${fromRel}: ${field} 引用了不存在的统一 ID: ${String(id)}`);
        continue;
      }
      const back = t.existing[backField];
      if (!Array.isArray(back) || !back.includes(selfId)) {
        asymmetric++;
        warn(`${fromRel}: ${field} → ${String(id)} 缺少反向引用 ${backField}（跑 backfill 自动补齐）`);
      }
    }
  };
  for (const f of files) {
    refCheck(f.rel, "related_problems", f.existing.related_problems, "related_learn");
    refCheck(f.rel, "related_learn", f.existing.related_learn, "related_problems");
  }
  if (asymmetric) warn(`related 引用不对称共 ${asymmetric} 处（backfill 可自动补齐）`);
}

// ── 6. 手写统计数（陈旧口径，告警）──
{
  const STALE: [RegExp, string][] = [
    [/共\s*约?\s*\d+\s*(?:道|题|篇)/, "手写总数「共 N 题/篇」（应由 stats 注入）"],
    [/(?<![\d.])8\s*周(?!\s*刊)/, "陈旧口径「8 周」（课程实为 10 周）"],
    [/(?<![\d.])56\s*天/, "陈旧口径「56 天」（课程实为 10 周 70 天）"],
    [/LeetGPU[^。\n]{0,30}\d{2,3}\s*道/, "手写 LeetGPU 题数（应由 stats 注入）"],
  ];
  const hit = new Map<string, string[]>();
  for (const f of files) {
    let inFence = false;
    let no = 0;
    for (const line of f.body.split("\n")) {
      no++;
      if (/^```/.test(line.trimStart())) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      for (const [re, label] of STALE) {
        if (re.test(line)) {
          const arr = hit.get(f.rel) ?? [];
          arr.push(`L${no} ${label}: ${line.trim().slice(0, 80)}`);
          hit.set(f.rel, arr);
        }
      }
    }
  }
  let total = 0;
  for (const [rel, list] of hit) {
    total += list.length;
    for (const l of list.slice(0, 3)) warn(`${rel}: 手写统计数 — ${l}`);
    if (list.length > 3) warn(`${rel}: …另 ${list.length - 3} 处手写统计数`);
  }
  if (total) warn(`手写统计数合计 ${total} 处 / ${hit.size} 文件（告警级，建议改用 stats 注入）`);
}

// ── 7. GPU 题解 6 段式结构（告警）──
{
  const SECTIONS: [RegExp, string][] = [
    [/^## 1\. 题目概述/m, "1. 题目概述"],
    [/^## 2\. (CPU 基线|朴素)/m, "2. CPU 基线 / 朴素 GPU 方法"],
    [/^## 3\. GPU 设计/m, "3. GPU 设计"],
    [/^## 4\. Kernel 实现/m, "4. Kernel 实现"],
    [/^## 5\. 性能分析/m, "5. 性能分析与优化"],
    [/^## 6\. 复杂度分析/m, "6. 复杂度分析"],
  ];
  let bad = 0;
  for (const f of files) {
    if (f.cls.partition !== "problems-gpu" || f.cls.type !== "problem") continue;
    const missing = SECTIONS.filter(([re]) => !re.test(f.body)).map(([, name]) => name);
    if (missing.length) {
      bad++;
      warn(`${f.rel}: GPU 题解 6 段式缺段: ${missing.join("、")}`);
    }
  }
  if (bad) warn(`GPU 6 段式不完整共 ${bad} 篇（告警级）`);
}

// ── 8. 词表外知识点（汇总告警）──
{
  const outside = new Set<string>();
  for (const f of files) {
    const kps = f.existing.knowledge_points;
    if (!Array.isArray(kps)) continue;
    for (const kp of kps) if (!VOCAB.has(String(kp))) outside.add(String(kp));
  }
  if (outside.size)
    warn(
      `词表外 knowledge_points: ${outside.size} 个 distinct（长尾标签 slugify 兜底，建议人工补充进 knowledge-points.ts；样例: ${[...outside].slice(0, 10).join(", ")}）`,
    );
}

// ── 9. GPU 目录序号 ↔ 官方题号错位（信息性告警，即 04 的 #109/#110/#113/#114 问题）──
{
  let mis = 0;
  for (const f of files) {
    if (!f.cls.gpuKey) continue;
    const official = f.existing.number;
    if (typeof official === "number" && official !== f.cls.gpuKey.num) {
      mis++;
      warn(
        `${f.rel}: 目录序号 ${f.cls.gpuKey.num} ≠ 正文官方题号 ${official}（ID 以目录序号为准: ${f.cls.id}）`,
      );
    }
  }
  if (mis) warn(`GPU 编号错位共 ${mis} 篇（ID 一律用目录序号，官方题号仅作展示字段）`);
}

// ── 10. GPU 难度目录 ↔ frontmatter 难度一致性 ──
for (const f of files) {
  if (!f.cls.gpuKey) continue;
  if (f.existing.difficulty && f.existing.difficulty !== f.cls.pathDifficulty)
    warn(`${f.rel}: 难度目录 ${f.cls.pathDifficulty} 与 frontmatter difficulty=${String(f.existing.difficulty)} 不一致`);
}

// ── 10b. 题号未标注（contest 新题正文缺 #编号，需人工补）──
for (const f of files) {
  if (f.cls.type === "problem" && f.existing.number === 0)
    warn(`${f.rel}: number=0（正文未标注官方题号，需人工补齐）`);
}

// ── 11. 孤儿图片（未被任何内容引用的 assets，告警汇总）──
{
  const exts = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
  const all: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.has(path.extname(e.name).toLowerCase()))
        all.push(path.relative(CONTENT_ROOT, p).split(path.sep).join("/"));
    }
  };
  walk(CONTENT_ROOT);
  const referenced = new Set<string>();
  for (const f of files) {
    for (const link of extractLinks(f.body)) {
      if (!link.isImage || isExternalLink(link.target)) continue;
      let target = link.target.split("#")[0].split("?")[0];
      try {
        target = decodeURIComponent(target);
      } catch {
        /* keep */
      }
      const abs = target.startsWith("/")
        ? path.join(CONTENT_ROOT, f.cls.partition, target.replace(/^\/+/, ""))
        : path.join(CONTENT_ROOT, dirnamePosix(f.rel), target);
      referenced.add(path.relative(CONTENT_ROOT, path.normalize(abs)).split(path.sep).join("/"));
    }
  }
  const orphans = all.filter((p) => !referenced.has(p));
  if (orphans.length) {
    warn(`孤儿图片 ${orphans.length} 张（未被任何 md 引用；清单见 dist/orphan-images.json）`);
    fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.writeFileSync(DIST_DIR + "/orphan-images.json", JSON.stringify(orphans, null, 2));
  }
}

// ── 12. GPU 题目录缺 .cu（SKILL.md 约定：同名 .cu 可编译）──
{
  let missing = 0;
  for (const f of files) {
    if (!f.cls.gpuKey) continue;
    const dir = path.dirname(f.abs);
    if (!fs.readdirSync(dir).some((n) => n.endsWith(".cu"))) {
      missing++;
      warn(`${f.rel}: 题目录缺少可编译的 .cu 源码`);
    }
  }
  if (missing) warn(`GPU 题目录缺 .cu 共 ${missing} 个（告警级）`);
}

// ── 13. 旧站点外链（汇总告警）──
{
  let n = 0;
  const fileSet = new Set<string>();
  for (const f of files) {
    for (const link of extractLinks(f.body)) {
      if (/^https?:\/\/hzchenxiaobin\.github\.io\//.test(link.target)) {
        n++;
        fileSet.add(f.rel);
      }
    }
  }
  if (n)
    warn(
      `旧 GitHub Pages 站点外链 ${n} 处 / ${fileSet.size} 文件（04：新产品不做跨站互链，建议后续改为站内统一 ID 链接）`,
    );
}

// ── 汇总输出 ──
const MAX_SHOW = 40;
console.log("== lint 结果 ==");
console.log(`文件 ${files.length} 篇 | error ${errors.length} | warning ${warnings.length}\n`);
if (errors.length) {
  console.log("── errors ──");
  for (const e of errors.slice(0, MAX_SHOW)) console.log(`  ✗ ${e}`);
  if (errors.length > MAX_SHOW) console.log(`  …另 ${errors.length - MAX_SHOW} 条`);
}
if (warnings.length) {
  console.log("── warnings ──");
  for (const w of warnings.slice(0, MAX_SHOW)) console.log(`  ⚠ ${w}`);
  if (warnings.length > MAX_SHOW) console.log(`  …另 ${warnings.length - MAX_SHOW} 条`);
}
process.exit(errors.length ? 1 : 0);
