# @ailab/content — 内容库

全产品唯一的内容事实来源（Git 为准，DB 只存元数据/索引，正文不入库）。
全部 Markdown 需补齐 frontmatter，规范见 [dev/content-kit.md](../../docs/dev/content-kit.md)
与 [03-data-model.md](../../docs/03-data-model.md)。

## 目录结构（三仓库一次性快照拷入，迁入后本目录为唯一维护地）

| 目录 | 来源仓库 | 内容 |
|---|---|---|
| `learn/` | `ai-infra-notes` | 学习路径：daily（10 周路线）/ topics（专题）/ paper（论文精读，含同名 PDF）/ profiling |
| `problems-gpu/` | `leetgpu` | GPU 题库：CUDA 题解（含可编译 `.cu`）+ `cuda-interview-notes.md`（渲染在 learn 分区 `/learn/notes/`） |
| `problems-algo/` | `leetcode` | 算法题库：solution / contest / topics / hot-interview 榜单 |

## 图片存放（2026-09 修正）

**图片就地存放在各内容分区内部**（`learn/images/`、`problems-gpu/images/`、
`problems-algo/solution/images/` 等），由 docs 站 sync 脚本按分区重写为
`/images/...` 根绝对 URL 后进镜像分发——不再做跨分区 assets/ 归并
（原方案已废弃；SVGO 压缩为 content-kit 可选任务，见 backlog）。

## 红线

- 每篇内容/每道题只有一个 home，交叉引用一律用统一 ID 链接（站内 URL 形态，
  见 `content-kit/scripts/fix-oldsite-links.ts` 头注释），禁止双份维护、禁止
  指向旧 GitHub Pages 站（`hzchenxiaobin.github.io`）的外链。
- 内容统计数、题数、URL base path、题目编号一律由 content-kit 构建期生成，禁止硬编码。
- 改动本目录后需重跑 `pnpm --filter @ailab/content-kit sync`（frontmatter 校验 →
  元数据入库 → 搜索索引 → stats 口径）。
