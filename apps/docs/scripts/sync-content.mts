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
// 运行：pnpm --filter docs sync（dev/build 前置自动执行）
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../../packages/content/learn");
const DEST = path.resolve(here, "../learn/src");

const EXCLUDE_FILES = new Set(["SKILL.md"]);

async function copyFiltered(from: string, to: string, mapName?: (name: string) => string) {
  await mkdir(to, { recursive: true });
  for (const e of await readdir(from, { withFileTypes: true })) {
    if (e.isFile() && EXCLUDE_FILES.has(e.name)) continue;
    const destName = mapName?.(e.name) ?? e.name;
    if (e.isDirectory()) {
      await copyFiltered(path.join(from, e.name), path.join(to, destName), mapName);
    } else {
      await cp(path.join(from, e.name), path.join(to, destName));
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
    await cp(path.join(daily, e.name), path.join(DEST, destName));
  } else if (e.name === "weekN" || /^week\d+$/.test(e.name)) {
    // daily/weekN/** → weekN/**（README.md → index.md）
    await copyFiltered(path.join(daily, e.name), path.join(DEST, e.name), (n) =>
      n === "README.md" ? "index.md" : n,
    );
  } else {
    // plan / reference → 原名
    await copyFiltered(path.join(daily, e.name), path.join(DEST, e.name));
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
        await copyFiltered(path.join(topicsSrc, e.name), path.join(topicsDest, e.name), (n) =>
          n === "README.md" ? "index.md" : n,
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
      await cp(
        path.join(paperSrc, e.name, "README.md"),
        path.join(DEST, "papers", e.name, "index.md"),
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
  await copyFiltered(path.join(SRC, "profiling"), path.join(DEST, "profiling"), (n) =>
    n === "README.md" ? "index.md" : n,
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
  await cp(
    path.resolve(SRC, "../problems-gpu/cuda-interview-notes.md"),
    path.join(DEST, "notes", "cuda-interview-notes.md"),
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

> 进度标记、刷题记录与模拟面试请在 <a href="/" target="_self">web 应用</a> 中进行。
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
