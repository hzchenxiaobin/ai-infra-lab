// backfill.ts —— 批量补齐 frontmatter（幂等）。
//
// 规则：
//   - id/type 始终按目录推导（ids.ts classify），其余字段「已有人工值优先」；
//     数组字段（tags/knowledge_points/related_*）取 人工 ∪ 机器 并集排序。
//   - 难度/标签从题解正文 `**难度**` / `**标签**` 行机器提取；languages 从代码块
//     fence 语言提取；updated 用文件 mtime（首次写入后被人工值保留，稳定）。
//   - related_problems：learn 类内容正文中的 leetgpu.com/challenges/<slug> 链接
//     （经 SKILL.md §1.4 slug↔编号表解析）+ 指向 problems-* 分区 md 的相对链接 +
//     站内统一 URL（fix-oldsite-links 产物：md 链接与 HTML <a href> 两形态）；
//     related_learn 由反向引用对称补齐（含 GPU 题解正文指向 daily 教程的链接）。
//   - 迁移期一次性改链：正文里指向旧仓库路径的 `(../)*aiinfra/...` 相对链接
//     重写为新布局 learn/... 下的等价相对路径（幂等）。
//
// 运行：pnpm --filter @ailab/content-kit backfill
import fs from "node:fs";
import path from "node:path";
import {
  extractChallengeSlugs,
  extractDifficulty,
  extractLanguages,
  extractLinks,
  extractMetaTable,
  extractNumberLine,
  extractTags,
  extractTitle,
  scanContent,
  type ContentFile,
} from "./content.ts";
import { serializeFrontmatter, type Fm } from "./frontmatter.ts";
import { loadGpuSkillMap, lookupDomain, PLATFORM_SLUG_ALIASES } from "./gpu-skill-map.ts";
import {
  cleanTag,
  GPU_DOMAINS,
  GPU_DOMAIN_SUPPLEMENT,
  IGNORE_TAGS,
  mapTagsToKps,
  slugifyTag,
  TOPIC_KP,
  WEEK_KP,
  WEEK_TAGS,
} from "./knowledge-points.ts";
import { CONTENT_ROOT, dirnamePosix, relLink, slugify } from "./util.ts";

const files = scanContent();
const byRel = new Map(files.map((f) => [f.rel, f]));
const skillMap = loadGpuSkillMap();

// GPU 题查找：难度+目录序号 / 目录名规范化
const gpuByNumDiff = new Map<string, ContentFile>();
const gpuByName = new Map<string, ContentFile>();
for (const f of files) {
  if (!f.cls.gpuKey) continue;
  gpuByNumDiff.set(`${f.cls.pathDifficulty}:${f.cls.pathNumber}`, f);
  gpuByName.set(slugify(f.cls.gpuKey.name), f);
}

const report = {
  total: files.length,
  written: 0,
  unchanged: 0,
  linksRewritten: 0,
  challengeLinksResolved: 0,
  challengeLinksUnresolved: new Map<string, number>(),
  difficultyFallback: [] as string[],
  numberFallback: [] as string[],
  gpuDomainMiss: [] as string[],
  unmappedTags: new Map<string, number>(),
  edges: 0,
};

// ──────────────────────── 正文改链（旧仓库 aiinfra/ 路径 → learn/） ────────────────────────

const STALE_LINK_RE = /\]\(((?:\.\.\/)+)aiinfra\/((?:daily|topics|paper|profiling)\/[^)\s]+)\)/g;
const staleUnresolved: string[] = [];

function rewriteStaleLinks(f: ContentFile): string {
  let changed = 0;
  const lines = f.body.split("\n");
  let inFence = false;
  const out = lines.map((line) => {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line.replace(STALE_LINK_RE, (whole, _ups, rest) => {
      const target = `learn/${rest}`;
      if (!fs.existsSync(path.join(CONTENT_ROOT, target))) {
        staleUnresolved.push(`${f.rel} → ${rest}`);
        return whole;
      }
      changed++;
      return `](${relLink(dirnamePosix(f.rel), target)})`;
    });
  });
  if (changed) report.linksRewritten += changed;
  return out.join("\n");
}

// ──────────────────────── 各分区 frontmatter 计算机 ────────────────────────

function baseFm(f: ContentFile, title: string, tags: string[], kps: string[]): Fm {
  return {
    id: f.cls.id,
    type: f.cls.type,
    title,
    tags,
    knowledge_points: kps,
    updated: f.updated,
  };
}

function trackUnmapped(unmapped: string[]) {
  for (const t of unmapped) report.unmappedTags.set(t, (report.unmappedTags.get(t) ?? 0) + 1);
}

function problemFm(f: ContentFile): Fm {
  const isGpu = f.cls.partition === "problems-gpu";
  const title = extractTitle(f);
  const tags = extractTags(f.body);
  const { kps, unmapped } = mapTagsToKps(tags);

  let difficulty = extractDifficulty(f.body) ?? f.cls.pathDifficulty ?? null;
  if (!difficulty) {
    difficulty = "medium";
    report.difficultyFallback.push(f.rel);
  }

  let number: number;
  if (isGpu) number = extractNumberLine(f.body) ?? f.cls.pathNumber ?? 0;
  else if (f.cls.source === "contest") number = extractNumberLine(f.body) ?? -1;
  else number = f.cls.pathNumber ?? extractNumberLine(f.body) ?? -1;
  if (number < 0) {
    report.numberFallback.push(f.rel);
    number = 0;
  }

  // GPU：知识点 = 领域（SKILL.md §1.5 或补充表）+ 领域知识点行 + 标签映射
  if (isGpu && f.cls.gpuKey) {
    const dom = lookupDomain(
      skillMap,
      f.cls.pathDifficulty!,
      f.cls.gpuKey.num,
      f.cls.gpuKey.name,
    );
    const letter =
      dom?.domain ??
      GPU_DOMAIN_SUPPLEMENT[`${f.cls.pathDifficulty}:${f.cls.gpuKey.name}`] ??
      null;
    if (letter && GPU_DOMAINS[letter]) {
      kps.push(GPU_DOMAINS[letter].slug);
      for (const p of dom?.points ?? []) {
        const slug = slugifyTag(cleanTag(p));
        if (slug) kps.push(slug);
      }
    } else {
      report.gpuDomainMiss.push(f.rel);
    }
  }

  const languages = extractLanguages(f.body);
  if (isGpu && !languages.includes("cuda")) languages.unshift("cuda");

  trackUnmapped(unmapped);
  return {
    ...baseFm(f, title, tags.filter((t) => !IGNORE_TAGS.some((re) => re.test(cleanTag(t)))), [
      ...new Set(kps),
    ].sort()),
    source: f.cls.source!,
    number,
    difficulty,
    languages,
    judge: isGpu ? "leetgpu-com" : "none",
    related_learn: [],
  };
}

function learnFm(f: ContentFile): Fm {
  const title = extractTitle(f);
  let tags: string[] = [];
  let kps: string[] = [];

  if (f.cls.week != null) {
    tags = [...(WEEK_TAGS[f.cls.week] ?? [`week-${f.cls.week}`])];
    kps = [...(WEEK_KP[f.cls.week] ?? [])];
    if (f.cls.id.includes(":")) tags.push("notes");
  } else if (f.cls.topic) {
    const topic = f.cls.topic;
    tags = [topic];
    const mapped = TOPIC_KP[topic];
    if (mapped && mapped.length) kps = [...mapped];
    else if (mapped && mapped.length === 0) {
      // misc 等：用文件自身 slug
      const self = f.cls.id.split(":").pop()!;
      kps = [self === topic ? topic : self];
    } else kps = [topic.replace(/^algo-/, "")];
    if (topic.startsWith("algo-")) tags = ["algo", topic.replace(/^algo-/, "")];
  } else if (f.cls.id === "learn:note:cuda-interview-notes") {
    tags = ["cuda", "interview"];
    kps = ["cuda", "interview-prep"];
  } else if (f.cls.id === "lc:index") {
    tags = ["algo", "index"];
    kps = ["interview-prep"];
  } else if (f.cls.id.startsWith("lc:list:")) {
    tags = ["algo", "problem-list"];
    kps = ["interview-prep"];
  } else if (f.cls.id.startsWith("learn:plan:")) {
    tags = ["cuda-course", "plan"];
    kps = ["cuda-course"];
  } else if (f.cls.id.startsWith("learn:reference:")) {
    tags = ["cuda-course", "reference"];
    kps = ["cuda-course"];
  } else {
    tags = ["cuda-course"];
    kps = ["cuda-course"];
  }

  const fm = baseFm(f, title, [...new Set(tags)], [...new Set(kps)].sort());
  if (f.cls.week != null) fm.week = f.cls.week;
  if (f.cls.day != null && /^(learn:w\d{2}d|learn:topic:)/.test(f.cls.id)) fm.day = f.cls.day;
  if (f.cls.topic) fm.topic = f.cls.topic;
  fm.related_problems = [];
  fm.related_questions = [];
  return fm;
}

function paperFm(f: ContentFile): Fm {
  const title = extractTitle(f);
  const slug = f.cls.id.replace(/^paper:/, "");
  const keywordsRaw = extractMetaTable(f.body, "关键词") ?? "";
  const keywords = keywordsRaw
    .split(/[,，、]/)
    .map((s) => slugify(s.trim()))
    .filter(Boolean)
    .slice(0, 8);
  const { kps: kwKps, unmapped } = mapTagsToKps(keywordsRaw.split(/[,，、]/));
  trackUnmapped(unmapped);
  return {
    ...baseFm(f, title, ["paper", ...new Set(keywords)], [slug, ...new Set(kwKps)].sort()),
    venue: extractMetaTable(f.body, "Venue") ?? "",
    status: f.body.length > 2000 ? "done" : "skeleton",
  };
}

function profilingFm(f: ContentFile): Fm {
  const title = extractTitle(f);
  const tools = ["ncu", "nsys"].filter((t) => f.body.toLowerCase().includes(t));
  const kps = new Set<string>(["profiling"]);
  const wm = f.cls.id.match(/^profiling:w(\d+)d/);
  if (wm) for (const kp of WEEK_KP[+wm[1]] ?? []) kps.add(kp);
  return baseFm(f, title, ["profiling", ...tools], [...kps].sort());
}

// ──────────────────────── 引用关系（related_problems / related_learn 对称） ────────────────────────

const learnRelated = new Map<string, Set<string>>(); // learn id → problem ids
const problemRelated = new Map<string, Set<string>>(); // problem id → learn ids

function addEdge(learnId: string, problemId: string) {
  if (!learnRelated.has(learnId)) learnRelated.set(learnId, new Set());
  if (!problemRelated.has(problemId)) problemRelated.set(problemId, new Set());
  const s1 = learnRelated.get(learnId)!.size;
  const s2 = problemRelated.get(problemId)!.size;
  learnRelated.get(learnId)!.add(problemId);
  problemRelated.get(problemId)!.add(learnId);
  if (learnRelated.get(learnId)!.size > s1 || problemRelated.get(problemId)!.size > s2)
    report.edges++;
}

/** 平台 challenge slug → GPU 题文件：§1.4 表 → 别名表 → 名称相容校验 → 名称包含匹配兜底 */
function resolveChallenge(slug: string): ContentFile | null {
  const entry = skillMap.bySlug.get(slug);
  const alias = PLATFORM_SLUG_ALIASES[slug];
  const difficulty = entry?.difficulty ?? alias?.difficulty;
  const num = entry?.num ?? alias?.num;
  if (difficulty == null || num == null) {
    // 表里完全没有：直接按目录名匹配（新题还没进 SKILL 表时兜底）
    return (
      gpuByName.get(slug) ??
      [...gpuByName.entries()].find(([n]) => n.includes(slug) || slug.includes(n))?.[1] ??
      null
    );
  }
  const byNum = gpuByNumDiff.get(`${difficulty}:${num}`);
  const nameNorm = slugify(entry?.name ?? "");
  const compatible = (f: ContentFile) => {
    const dirName = slugify(f.cls.gpuKey!.name);
    return dirName === slug || dirName.includes(slug) || slug.includes(dirName) ||
      (nameNorm !== "" && (dirName.includes(nameNorm) || nameNorm.includes(dirName)));
  };
  if (byNum && compatible(byNum)) return byNum;
  // 名称兜底（编号错位：如 115-layer-normalization ↔ challenges #113）
  const nameHit =
    gpuByName.get(slug) ??
    [...gpuByName.entries()].find(
      ([n]) => n.includes(slug) || slug.includes(n) || (nameNorm !== "" && (n.includes(nameNorm) || nameNorm.includes(n))),
    )?.[1];
  if (nameHit) return nameHit;
  return byNum ?? null;
}

/** 站内 URL → 内容文件：兼容完整形态（/learn/...、/problems/...）与分区相对
 * 形态（/week1/day1，按文件所属渲染分区补 base） */
const urlIndex = (() => {
  const m = new Map<string, ContentFile>();
  const put = (k: string, f: ContentFile) => {
    if (k && !m.has(k)) m.set(k, f);
  };
  for (const f of files) {
    if (!f.cls.url) continue;
    put(f.cls.url, f);
    put(f.cls.url.replace(/\/$/, ""), f);
  }
  return m;
})();

function urlToFile(target: string, f: ContentFile): ContentFile | undefined {
  const t = target.split("#")[0].split("?")[0];
  const base =
    f.rel === "problems-gpu/cuda-interview-notes.md"
      ? "/learn"
      : f.cls.partition === "learn"
        ? "/learn"
        : f.cls.partition === "problems-gpu"
          ? "/problems/gpu"
          : "/problems";
  const candidates = [
    t,
    t.replace(/\/$/, ""),
    `${base}${t}`,
    `${base}${t.replace(/\/$/, "")}`,
  ].flatMap((c) => [c, c.replace(/index\.html$/, "").replace(/\.html$/, "")]);
  for (const c of candidates) {
    const hit = urlIndex.get(c);
    if (hit) return hit;
  }
  return undefined;
}


for (const f of files) {
  if (f.cls.type === "learn" && !f.cls.id.startsWith("lc:list:")) {
    // 1) leetgpu 平台链接
    for (const slug of extractChallengeSlugs(f.body)) {
      const g = resolveChallenge(slug);
      if (g) {
        addEdge(f.cls.id, g.cls.id);
        report.challengeLinksResolved++;
      } else {
        report.challengeLinksUnresolved.set(
          slug,
          (report.challengeLinksUnresolved.get(slug) ?? 0) + 1,
        );
      }
    }
  }
  // 2) 相对 md 链接 → learn ↔ problem 边
  if (f.cls.id.startsWith("lc:list:")) continue;
  for (const link of extractLinks(f.body)) {
    if (/^(https?:|mailto:|#)/i.test(link.target)) continue;
    let target = link.target.split("#")[0].split("?")[0];
    if (!target.endsWith(".md")) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      continue;
    }
    if (target.startsWith("/")) continue;
    const rel = relLinkResolve(dirnamePosix(f.rel), target);
    const t = rel ? byRel.get(rel) : undefined;
    if (!t) continue;
    if (f.cls.type === "learn" && t.cls.type === "problem") addEdge(f.cls.id, t.cls.id);
    else if (f.cls.type === "problem" && t.cls.type === "learn") addEdge(t.cls.id, f.cls.id);
  }
  // 3) 站内统一 URL（fix-oldsite-links 产物）→ learn ↔ problem 边。
  //    md 链接（同分区相对形态 /week1/day1）与 HTML <a href>（跨分区完整形态
  //    /problems/algo/0001）两形态都识别；url 经 scanContent url 集解析到文件
  const addEdgeByTarget = (target: string): void => {
    const t = urlToFile(target, f);
    if (!t || t.cls.id === f.cls.id) return;
    if (f.cls.type === "learn" && t.cls.type === "problem") addEdge(f.cls.id, t.cls.id);
    else if (f.cls.type === "problem" && t.cls.type === "learn") addEdge(t.cls.id, f.cls.id);
  };
  for (const link of extractLinks(f.body)) {
    if (link.target.startsWith("/")) addEdgeByTarget(link.target);
  }
  const HTML_HREF_RE = /<a\s+href="(\/(?:learn|problems)\/[^"]*)"/g;
  for (const m of f.body.matchAll(HTML_HREF_RE)) addEdgeByTarget(m[1]);
}

function relLinkResolve(fromDir: string, target: string): string | null {
  const parts = [...fromDir.split("/").filter(Boolean), ...target.split("/")];
  const out: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

// ──────────────────────── 合并 + 写盘 ────────────────────────

const ARRAY_KEYS = new Set(["tags", "knowledge_points", "related_problems", "related_questions", "related_learn", "languages"]);

for (const f of files) {
  let computed: Fm;
  switch (f.cls.type) {
    case "problem":
      computed = problemFm(f);
      break;
    case "learn":
      computed = learnFm(f);
      break;
    case "paper":
      computed = paperFm(f);
      break;
    case "profiling":
      computed = profilingFm(f);
      break;
  }

  // 引用关系（对称并集）
  if (f.cls.type === "learn")
    computed.related_problems = [...(learnRelated.get(f.cls.id) ?? [])].sort();
  if (f.cls.type === "problem")
    computed.related_learn = [...(problemRelated.get(f.cls.id) ?? [])].sort();

  // 合并：已有人工字段优先；数组取并集
  const merged: Fm = {};
  const keys = new Set([...Object.keys(computed), ...Object.keys(f.existing)]);
  for (const key of keys) {
    const hasExisting = key in f.existing && f.existing[key] !== "";
    if (key === "id" || key === "type") {
      merged[key] = computed[key]; // 结构字段始终按目录推导
    } else if (ARRAY_KEYS.has(key)) {
      const a = Array.isArray(f.existing[key]) ? (f.existing[key] as string[]) : [];
      const b = Array.isArray(computed[key]) ? (computed[key] as string[]) : [];
      merged[key] = [...new Set([...a, ...b])].sort();
    } else if (hasExisting) {
      merged[key] = f.existing[key];
    } else {
      merged[key] = computed[key];
    }
  }

  const newBody = rewriteStaleLinks(f);
  const content = serializeFrontmatter(merged) + newBody.replace(/^\n+/, "");
  if (content !== f.raw) {
    fs.writeFileSync(f.abs, content);
    report.written++;
  } else {
    report.unchanged++;
  }
}

// ──────────────────────── 报告 ────────────────────────

const byType = new Map<string, number>();
const byPartition = new Map<string, number>();
for (const f of files) {
  byType.set(f.cls.type, (byType.get(f.cls.type) ?? 0) + 1);
  byPartition.set(f.cls.partition, (byPartition.get(f.cls.partition) ?? 0) + 1);
}

console.log("== backfill 报告 ==");
console.log(`处理文件: ${report.total}（写入 ${report.written}，无变化 ${report.unchanged}）`);
console.log(`分区: ${[...byPartition].map(([k, v]) => `${k}=${v}`).join("  ")}`);
console.log(`类型: ${[...byType].map(([k, v]) => `${k}=${v}`).join("  ")}`);
console.log(`旧仓库链接重写: ${report.linksRewritten} 处`);
if (staleUnresolved.length) {
  console.log(`旧仓库链接无法解析（保留原样，${staleUnresolved.length} 处）:`);
  for (const r of staleUnresolved.slice(0, 20)) console.log(`  ${r}`);
}
console.log(
  `learn↔problem 引用边: ${report.edges}（其中 leetgpu challenge 链接解析成功 ${report.challengeLinksResolved}）`,
);
if (report.challengeLinksUnresolved.size) {
  console.log(`未解析的 challenge slug（${report.challengeLinksUnresolved.size} 种）:`);
  for (const [s, n] of [...report.challengeLinksUnresolved].sort((a, b) => b[1] - a[1]))
    console.log(`  ${s} (${n})`);
}
if (report.difficultyFallback.length) {
  console.log(`难度行缺失/无法解析（已兜底 medium，${report.difficultyFallback.length} 篇）:`);
  for (const r of report.difficultyFallback.slice(0, 20)) console.log(`  ${r}`);
}
if (report.numberFallback.length) {
  console.log(`题号缺失（已兜底 0，${report.numberFallback.length} 篇）:`);
  for (const r of report.numberFallback.slice(0, 20)) console.log(`  ${r}`);
}
if (report.gpuDomainMiss.length) {
  console.log(`GPU 领域未匹配（${report.gpuDomainMiss.length} 篇）:`);
  for (const r of report.gpuDomainMiss) console.log(`  ${r}`);
}
const unmapped = [...report.unmappedTags].sort((a, b) => b[1] - a[1]);
console.log(`未映射标签（slugify 兜底，distinct ${unmapped.length}，top 20）:`);
for (const [t, n] of unmapped.slice(0, 20)) console.log(`  ${t} (${n})`);
