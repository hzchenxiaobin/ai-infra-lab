// sync-gpu.mts —— packages/content/problems-gpu → apps/docs/gpu/src 的 URL 形态拷贝。
//
// 目录映射（对齐 ids.ts 的 contents.url：/problems/gpu/{diff}/{num}-{slug}）：
//   solutions/{diff}/{dir}/index.md → src/{diff}/{dir}/index.md（页面）
//   solutions/{diff}/{dir}/*.{cu,py} → src/public/{diff}/{dir}/…（VitePress 原样拷贝，
//                                     正文用 <a href="./xxx.cu" download> 相对引用）
//   images/**                       → src/public/images/**（正文 /images/x.svg 引用）
//   cuda-interview-notes.md         → 不进本分区（URL 属于 /learn/notes/...，见 sync-content.mts）
// 首页与 easy/medium/hard 列表页由本脚本生成（ProblemList 组件渲染）。
// 运行：pnpm --filter docs sync:gpu
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../../packages/content/problems-gpu");
const DEST = path.resolve(here, "../gpu/src");

const DIFFS = ["easy", "medium", "hard"] as const;

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

/** 读 frontmatter title */
async function fmTitle(abs: string): Promise<string> {
  const m = (await readFile(abs, "utf8")).match(/^title:\s*"?([^"\n]+)"?/m);
  return m?.[1] ?? path.basename(path.dirname(abs));
}

let pages = 0;
for (const diff of DIFFS) {
  const diffDir = path.join(SRC, "solutions", diff);
  if (!existsSync(diffDir)) continue;
  for (const dir of await readdir(diffDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || !existsSync(path.join(diffDir, dir.name, "index.md"))) continue;
    // 页面
    await mkdir(path.join(DEST, diff, dir.name), { recursive: true });
    await cp(
      path.join(diffDir, dir.name, "index.md"),
      path.join(DEST, diff, dir.name, "index.md"),
    );
    pages++;
    // 源码（public 原样分发）
    const probDir = path.join(diffDir, dir.name);
    for (const f of await readdir(probDir)) {
      if (f.endsWith(".cu") || f.endsWith(".py")) {
        await mkdir(path.join(DEST, "public", diff, dir.name), { recursive: true });
        await cp(path.join(probDir, f), path.join(DEST, "public", diff, dir.name, f));
      }
    }
  }
}

// 共享插图
if (existsSync(path.join(SRC, "images"))) {
  await cp(path.join(SRC, "images"), path.join(DEST, "public", "images"), { recursive: true });
}

// ---- 列表页（easy/medium/hard）----
for (const diff of DIFFS) {
  await writeFile(
    path.join(DEST, `${diff}.md`),
    `---\ntitle: ${diff === "easy" ? "Easy · 简单" : diff === "medium" ? "Medium · 中等" : "Hard · 困难"}\nlayout: page\nsidebar: false\naside: false\n---\n\n<ProblemList diff="${diff}" />\n`,
  );
}

// ---- 首页 ----
const counts: Record<string, number> = {};
for (const diff of DIFFS) {
  const d = path.join(DEST, diff);
  counts[diff] = existsSync(d) ? (await readdir(d)).length : 0;
}
await writeFile(
  path.join(DEST, "index.md"),
  `---
title: LeetGPU 题解
---

<div align="center">

# CUDA Kernel 编程题解

🟢 Easy ${counts.easy} 题 · 🟡 Medium ${counts.medium} 题 · 🔴 Hard ${counts.hard} 题

[Easy](${"/easy.html"}) · [Medium](${"/medium.html"}) · [Hard](${"/hard.html"})

</div>

> 评测请前往 [leetgpu.com](https://leetcode.cn/leetgpu) 或站内 [刷题页](/) 标记进度；\`.cu\` 完整源码可在各题解页面下载本地自测。
`,
);

console.log(`== sync-gpu ==\n${SRC} → ${DEST}\n题解 ${pages} 篇`);
