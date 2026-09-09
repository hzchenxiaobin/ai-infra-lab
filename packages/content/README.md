# @ailab/content — 内容库

全产品唯一的内容事实来源（Git 为准，DB 只存元数据/索引，正文不入库）。
全部 Markdown 需补齐 frontmatter，规范见 [dev/content-kit.md](../../dev/content-kit.md)
与 [03-data-model.md](../../03-data-model.md)。

## 目录结构（三仓库一次性快照拷入，迁入后本目录为唯一维护地）

| 目录 | 来源仓库 | 内容 |
|---|---|---|
| `learn/` | `ai-infra-notes` | 学习路径：daily（10 周路线）/ topics（专题）/ paper（论文精读）/ profiling |
| `problems-gpu/` | `leetgpu` | GPU 题库：CUDA 题解（含可编译 `.cu`） |
| `problems-algo/` | `leetcode` | 算法题库：solution / contest / topics / hot-interview 榜单 |
| `assets/` | 各仓库图片汇总 | 全部 SVG 插图（SVGO 压缩 + 去重后，迁移期归并） |

## 红线

- 每篇内容/每道题只有一个 home，交叉引用一律用统一 ID 链接，禁止双份维护。
- 内容统计数、题数、URL base path、题目编号一律由 content-kit 构建期生成，禁止硬编码。
- 改动本目录后需重跑 `pnpm --filter content-kit sync`（frontmatter 校验 → 元数据入库 → 搜索索引）。
