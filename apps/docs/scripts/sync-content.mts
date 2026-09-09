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

// ---- paper/{slug}/README.md → papers/{slug}/index.md（仅完成的论文；骨架只有 PDF 不拷）----
if (existsSync(path.join(SRC, "paper"))) {
  const paperSrc = path.join(SRC, "paper");
  for (const e of await readdir(paperSrc, { withFileTypes: true })) {
    if (!e.isDirectory() || !existsSync(path.join(paperSrc, e.name, "README.md"))) continue;
    await mkdir(path.join(DEST, "papers", e.name), { recursive: true });
    await cp(
      path.join(paperSrc, e.name, "README.md"),
      path.join(DEST, "papers", e.name, "index.md"),
    );
  }
  // 论文共享插图（README 里 ../images/x.svg 引用）
  if (existsSync(path.join(paperSrc, "images"))) {
    await cp(path.join(paperSrc, "images"), path.join(DEST, "papers", "images"), { recursive: true });
  }
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
    entries.push(`- [${title}](/learn/topics/${slug}/)`);
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

[开始学习 →](/learn/week1/day1/)

</div>

## 学习地图

- [10 周主线](/learn/path) —— 从 GPU 执行模型到分布式推理系统
- [专题](/learn/topics/) —— CUDA / Triton / CUTLASS / vLLM / 昇腾 NPU 等 18 个专项
- [论文精读](/learn/papers/) —— FlashAttention / vLLM / Speculative Decoding 等
- [Profiling 实战](/learn/profiling/) —— ncu / nsys 性能分析训练营

> 进度标记、刷题记录与模拟面试请在 [web 应用](/) 中进行。
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
