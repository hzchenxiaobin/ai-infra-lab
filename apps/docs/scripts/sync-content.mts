// sync-content.mts —— packages/content/learn → apps/docs/learn/src 的 URL 形态拷贝。
//
// dev/content-site.md §8：内容不进 apps/docs Git 目录重复存放，拷贝属于构建流程。
// 目录重排只做一件事：去掉 daily/ 层级，使文件路径与 contents.url（/learn/...）对齐：
//   daily/weekN/dayM/**   → weekN/dayM/**
//   daily/weekN/README.md → weekN/index.md
//   daily/plan/**         → plan/**          （url /learn/plan/...）
//   daily/reference/**    → reference/**
//   daily/README.md       → path.md          （url /learn/path）
//   topics/**             → topics/**        （原样）
//   paper/{slug}/README.md → papers/{slug}/index.md   （url /learn/papers/{slug}）
//   profiling/**          → profiling/**     （原样）
// SKILL.md / 根 README 不拷（写作规范与仓库说明，非站点内容）。
// 拷贝 .md 时同步重写正文相对链接：内容里写源树路径（GitHub 可读），这里按同一套
// 映射改写成 src 布局路径（README.md → index.md、daily/ 拍平、paper/ → papers/），
// 由 VitePress 再解析成最终 URL。映射表见 srcToDest()，与下方拷贝逻辑一一对应。
// 运行：pnpm --filter docs sync（dev/build 前置自动执行）
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../../packages/content/learn");
const DEST = path.resolve(here, "../learn/src");

const EXCLUDE_FILES = new Set(["SKILL.md"]);

// ---- 链接重写 ----
// 内容仓库里写「源树相对路径」（GitHub 上可读，topics/SKILL.md §5.4 约定），
// 拷贝进 src 时按目录映射改写成 src 布局的相对路径，再由 VitePress 解析成最终 URL
// （index.md → 目录形式，dayN.md → dayN.html）。映射规则须与下方拷贝逻辑一一对应。
function srcToDest(rel: string): string | null {
  const rename = (p: string) => p.replace(/(^|\/)README\.md$/, "$1index.md");
  if (rel === "daily/README.md") return "path.md";
  let m = /^daily\/(week\d+)\/(.+)$/.exec(rel);
  if (m) return rename(`${m[1]}/${m[2]}`);
  m = /^daily\/(plan|reference)\/(.+)$/.exec(rel);
  if (m) return `${m[1]}/${m[2]}`;
  m = /^daily\/([^/]+\.md)$/.exec(rel);
  if (m) return m[1];
  m = /^topics\/(.+)$/.exec(rel);
  if (m) return rename(`topics/${m[1]}`);
  m = /^profiling\/(.+)$/.exec(rel);
  if (m) return rename(`profiling/${m[1]}`);
  m = /^paper\/images\/(.+)$/.exec(rel);
  if (m) return `papers/images/${m[1]}`;
  m = /^paper\/([^/]+)\/README\.md$/.exec(rel);
  if (m) return `papers/${m[1]}/index.md`;
  // PDF 只拷 <slug>.pdf（见下方 paper 拷贝），目标 URL 在 public/ 下、按站点根相对书写
  m = /^paper\/([^/]+)\/(\1\.pdf)$/.exec(rel);
  if (m) return `papers/${m[1]}/${m[2]}`;
  return null;
}

/** 单个链接目标改写；无法映射（站外 / 未拷贝文件）返回 null 保持原样 */
function mapTarget(target: string, srcDir: string, destDir: string): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target)) return null; // 绝对 URL
  if (target.startsWith("/") || target.startsWith("#") || target.startsWith("mailto:")) return null;
  const hashIdx = target.indexOf("#");
  const p = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
  const anchor = hashIdx >= 0 ? target.slice(hashIdx) : "";
  if (!/\.(md|html|pdf)$/.test(p)) return null; // 图片等静态资源相对位置不变
  let rel = path.posix.normalize(path.posix.join(srcDir, p));
  if (rel === ".." || rel.startsWith("../")) return null; // 跳出 learn/ 根（跨分区互链）
  if (p.endsWith(".html")) {
    // 旧部署形态链接（x.html / x/index.html）：还原成源文件再映射
    const stem = rel.slice(0, -".html".length);
    if (existsSync(path.join(SRC, `${stem}.md`))) rel = `${stem}.md`;
    else if (existsSync(path.join(SRC, stem, "README.md"))) rel = path.posix.join(stem, "README.md");
    else return null;
  } else if (!existsSync(path.join(SRC, rel))) return null;
  const dest = srcToDest(rel);
  if (!dest) return null;
  return path.posix.relative(destDir, dest) + anchor;
}

const LINK_RE = /(!?\[[^\]\n]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

function rewriteLinks(md: string, srcRel: string, destRel: string): string {
  const srcDir = path.posix.dirname(srcRel);
  const destDir = path.posix.dirname(destRel);
  return md.replace(LINK_RE, (all, pre: string, target: string, post: string) => {
    const mapped = mapTarget(target, srcDir, destDir);
    return mapped === null ? all : pre + mapped + post;
  });
}

/** md 走链接重写，其余原样拷贝；srcRel/destRel 为相对 SRC/DEST 的 posix 路径 */
async function copyFile(srcAbs: string, destAbs: string, srcRel: string, destRel: string) {
  if (srcAbs.endsWith(".md")) {
    const md = await readFile(srcAbs, "utf8");
    await writeFile(destAbs, rewriteLinks(md, srcRel, destRel));
  } else {
    await cp(srcAbs, destAbs);
  }
}

async function copyFiltered(
  from: string,
  to: string,
  mapName?: (name: string) => string,
  relFrom = "",
  relTo = "",
) {
  await mkdir(to, { recursive: true });
  for (const e of await readdir(from, { withFileTypes: true })) {
    if (e.isFile() && EXCLUDE_FILES.has(e.name)) continue;
    const destName = mapName?.(e.name) ?? e.name;
    if (e.isDirectory()) {
      await copyFiltered(
        path.join(from, e.name),
        path.join(to, destName),
        mapName,
        `${relFrom}${e.name}/`,
        `${relTo}${destName}/`,
      );
    } else {
      await copyFile(
        path.join(from, e.name),
        path.join(to, destName),
        `${relFrom}${e.name}`,
        `${relTo}${destName}`,
      );
    }
  }
}

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

// ---- daily → 扁平化到根 ----
const daily = path.join(SRC, "daily");
for (const e of await readdir(daily, { withFileTypes: true })) {
  if (e.name === "SKILL.md") continue;
  if (e.isFile()) {
    // daily/README.md → path.md（课程总览页，url /learn/path）
    const destName = e.name === "README.md" ? "path.md" : e.name;
    await copyFile(path.join(daily, e.name), path.join(DEST, destName), `daily/${e.name}`, destName);
  } else if (e.name === "weekN" || /^week\d+$/.test(e.name)) {
    // daily/weekN/** → weekN/**（README.md → index.md）
    await copyFiltered(
      path.join(daily, e.name),
      path.join(DEST, e.name),
      (n) => (n === "README.md" ? "index.md" : n),
      `daily/${e.name}/`,
      `${e.name}/`,
    );
  } else {
    // plan / reference → 原名
    await copyFiltered(path.join(daily, e.name), path.join(DEST, e.name), undefined, `daily/${e.name}/`, `${e.name}/`);
  }
}

// ---- topics 原样（README.md → index.md）----
if (existsSync(path.join(SRC, "topics"))) {
  const topicsSrc = path.join(SRC, "topics");
  const topicsDest = path.join(DEST, "topics");
  await mkdir(topicsDest, { recursive: true });
  for (const e of await readdir(topicsSrc, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // 专题目录与共享 images/
      if (e.name === "images") {
        await cp(path.join(topicsSrc, e.name), path.join(topicsDest, e.name), { recursive: true });
      } else {
        await copyFiltered(
          path.join(topicsSrc, e.name),
          path.join(topicsDest, e.name),
          (n) => (n === "README.md" ? "index.md" : n),
          `topics/${e.name}/`,
          `topics/${e.name}/`,
        );
      }
    }
    // 专题根下无散落 md（SKILL.md 已在 EXCLUDE_FILES）
  }
}

// ---- paper/{slug}/ → papers/{slug}/（README → index.md；PDF 走 public 进 dist）----
// VitePress 只把 srcDir 下 .md 编页、src/public/ 原样分发：PDF 统一拷到
// public/papers/{slug}/（README 内相对引用 xxx.pdf 与索引页 /papers/... 均命中）。
// 骨架（只有 PDF）不建页面目录，由 papers 索引页显式列出。
const paperSkel: string[] = [];
if (existsSync(path.join(SRC, "paper"))) {
  const paperSrc = path.join(SRC, "paper");
  for (const e of await readdir(paperSrc, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === "images") continue;
    const hasReadme = existsSync(path.join(paperSrc, e.name, "README.md"));
    if (!hasReadme) paperSkel.push(e.name);
    if (existsSync(path.join(paperSrc, e.name, `${e.name}.pdf`))) {
      await mkdir(path.join(DEST, "public", "papers", e.name), { recursive: true });
      await cp(
        path.join(paperSrc, e.name, `${e.name}.pdf`),
        path.join(DEST, "public", "papers", e.name, `${e.name}.pdf`),
      );
    }
    if (hasReadme) {
      await mkdir(path.join(DEST, "papers", e.name), { recursive: true });
      await copyFile(
        path.join(paperSrc, e.name, "README.md"),
        path.join(DEST, "papers", e.name, "index.md"),
        `paper/${e.name}/README.md`,
        `papers/${e.name}/index.md`,
      );
    }
  }
  // 论文共享插图（README 里 ../images/x.svg 引用）
  if (existsSync(path.join(paperSrc, "images"))) {
    await cp(path.join(paperSrc, "images"), path.join(DEST, "papers", "images"), { recursive: true });
  }
}

// ---- papers 索引页（成文可读，骨架列目录显式表达进度）----
if (existsSync(path.join(SRC, "paper"))) {
  const papersDest = path.join(DEST, "papers");
  const done = (await readdir(papersDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== "images" && existsSync(path.join(papersDest, e.name, "index.md")))
    .map((e) => e.name)
    .sort();
  const pdfLink = (slug: string) =>
    existsSync(path.join(DEST, "public", "papers", slug, `${slug}.pdf`))
      ? `（[PDF](/papers/${slug}/${slug}.pdf)）`
      : "";
  const doneRows = done.map((slug) => `- [${slug}](/papers/${slug}/)${pdfLink(slug)}`);
  const skelRows = paperSkel.sort().map((slug) => `- 🚧 ${slug}（精读进行中${pdfLink(slug)}）`);
  await writeFile(
    path.join(papersDest, "index.md"),
    `---
title: 论文精读
---

# 论文精读

成文 ${doneRows.length} 篇 · 进行中 ${skelRows.length} 篇

## 已完成

${doneRows.join("\n")}

## 精读进行中（骨架）

${skelRows.join("\n")}
`,
  );
}

// ---- profiling 原样（README.md → index.md）----
if (existsSync(path.join(SRC, "profiling"))) {
  await copyFiltered(
    path.join(SRC, "profiling"),
    path.join(DEST, "profiling"),
    (n) => (n === "README.md" ? "index.md" : n),
    "profiling/",
    "profiling/",
  );
}

// ---- topics 索引页（列全部专题，标题取 frontmatter）----
{
  const topicsDest = path.join(DEST, "topics");
  const slugs = (await readdir(topicsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== "images")
    .map((e) => e.name)
    .sort();
  const entries: string[] = [];
  for (const slug of slugs) {
    const md = await readFile(path.join(topicsDest, slug, "index.md"), "utf8");
    const title = md.match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? slug;
    // 链接不写 /learn 前缀：vitepress base（/learn/）会自动补齐，写死会双前缀 404
    entries.push(`- [${title}](/topics/${slug}/)`);
  }
  await writeFile(
    path.join(topicsDest, "index.md"),
    `---\ntitle: 专题\n---\n\n# 专题\n\n${entries.join("\n")}\n`,
  );
}

// ---- cuda-interview-notes（属 problems-gpu 分区内容，但 URL 在 /learn/notes/ 空间）----
if (existsSync(path.resolve(SRC, "../problems-gpu/cuda-interview-notes.md"))) {
  await mkdir(path.join(DEST, "notes"), { recursive: true });
  await copyFile(
    path.resolve(SRC, "../problems-gpu/cuda-interview-notes.md"),
    path.join(DEST, "notes", "cuda-interview-notes.md"),
    "../problems-gpu/cuda-interview-notes.md",
    "notes/cuda-interview-notes.md",
  );
}

// ---- 站点首页（docs 自有文件，非内容快照）-----
await writeFile(
  path.join(DEST, "index.md"),
  `---
title: AI Infra 学习路径
---

<div align="center">

# AI Infra 学习路径

10 周主线 · 18 专题 · 论文精读 · ncu Profiling 实战

[开始学习 →](/week1/day1/)

</div>

## 学习地图

- [10 周主线](/path) —— 从 GPU 执行模型到分布式推理系统
- [专题](/topics/) —— CUDA / Triton / CUTLASS / vLLM / 昇腾 NPU 等 18 个专项
- [论文精读](/papers/) —— FlashAttention / vLLM / Speculative Decoding 等
- [Profiling 实战](/profiling/) —— ncu / nsys 性能分析训练营

> 进度标记、刷题记录与模拟面试请在 <a href="/" target="_blank">web 应用</a> 中进行。
`,
);

let count = 0;
const walk = async (d: string) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(path.join(d, e.name));
    else count++;
  }
};
await walk(DEST);
console.log(`== sync-learn ==\n${SRC} → ${DEST}\n共 ${count} 个文件`);
