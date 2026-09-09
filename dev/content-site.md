# content-site — docs 内容站开发指南

> `apps/docs`：VitePress 三分区静态站，渲染全部学习与题解正文。组件与构建经验拷自
> leetcode / leetgpu 两个既有站点；ai-infra-notes 的自研 Python 站**不拷**，用
> VitePress 重写。选型决策见 [02 架构 §1](../02-architecture.md#1-内容站保留-vitepress解决大规模构建问题)，
> 迁移步骤见 [04 §整合步骤 5](../04-migration.md#整合步骤)。

## 1. 三分区结构

```
apps/docs/
├── learn/                  # ← ai-infra-notes（257 篇：daily/topics/paper/profiling）
│   ├── .vitepress/config.mts
│   └── ...                 # 内容文件由构建脚本从 packages/content/learn/ 拷入或软链
├── problems-gpu/           # ← leetgpu（106 篇 6 段式题解 + .cu）
│   ├── .vitepress/config.mts
│   └── ...
├── problems-algo/          # ← leetcode（4042 题解 + 81 周赛 + 专题 + 榜单）
│   ├── .vitepress/config.mts
│   └── ...
├── theme/                  # 共享主题：拷入的 Vue 组件 + custom.css（见 §2）
├── package.json
└── scripts/                # 分区构建编排、产物合并
```

- 三个分区各自独立 `config.mts`、独立构建、独立 `outDir`，产物合并部署到
  `/learn`、`/problems/gpu`、`/problems/algo` 路径下（Caddy 路由见
  [deployment](deployment.md)）。
- 每区规模可控：最大约 4100 页（problems-algo），沿用 leetcode 已验证的分批构建经验；
  构建互不影响，单区失败不阻塞其他区。
- `srcExclude` 必须排除 `README.md`、`**/SKILL.md`、构建产物目录（leetcode 现状如此，
  拷入时保留）。

## 2. Vue 组件拷入清单

| 来源 | 组件 | 用途 | 去向 |
|---|---|---|---|
| leetcode `.vitepress/theme/` | `SolutionList.vue` | 题解列表（题号排序） | problems-algo |
| 同上 | `ContestList.vue` | 周赛列表 | problems-algo |
| 同上 | `BackLink.vue` | 返回上级索引 | 两题库分区共用 |
| 同上 | `lightbox.ts` | 图片点击放大 | 三分区共用 |
| leetgpu `.vitepress/theme/` | `ProblemList.vue` | GPU 题列表（按难度分组） | problems-gpu |
| 同上 | `ImageLightbox.vue` | 图片查看器 | 与 lightbox.ts 合并为一份 |
| 同上 | `BackLink.vue` | 返回列表 | 与 leetcode 版合并去重 |
| 两站 `custom.css` | 手绘风/题解排版样式 | 合并为 `theme/custom.css` | 三分区共用 |

拷入时做一次去重合并（两站的 `BackLink.vue` 功能相同），合并后放 `apps/docs/theme/`，
各分区 `config.mts` 的 `themeConfig` 引用同一份。**只读原则**：不为这些组件加交互
（进度勾选、提交按钮等），交互一律跳 web（见 [web](web.md#7-与-docs-站的职责切分红线)）。

ai-infra-notes 侧**没有可拷的 Vue 组件**（自研 Python 站），其页面交互（手风琴导航、
TOC 高亮、明暗主题）用 VitePress 自带能力或成熟插件重写，见 §6。

## 3. 大规模构建纪律（必须保留）

leetcode 站 4100+ 页已 OOM，以下纪律是血泪经验，**逐条保留**：

| 措施 | 配置 | 说明 |
|---|---|---|
| 分批并行构建 | `BATCH_INDEX` / `BATCH_TOTAL` 环境变量 | 按区间目录切批，各批独立 `outDir`（`dist_${BATCH_INDEX}`）再合并；CI 4 批；不带变量时本地单批全量 |
| 共享页只在第 0 批 | `batchIndex === 0 ? [] : ['contest/**', 'index.md', ...]` 进 srcExclude | 避免合并产物时互相覆盖 |
| SSR 并发上限 | `buildConcurrency: 8` | 默认 64 并发会把 Node 堆打爆 |
| Node 堆 | `NODE_OPTIONS=--max-old-space-size=6144` | 6GB，CI 与 Dockerfile 里都要设 |
| 分批关本地搜索 | `batching` 时不配 `search` | 每批只能索引本批页面，合并后搜索结果残缺 |
| 全站搜索替代 | content-kit 导出静态索引 + web `/search` 页 | 见 [content-kit](content-kit.md#7-搜索索引导出) |
| 死链容忍 | `ignoreDeadLinks: true` | 正文有指向仓库内非页面文件的相对链接 |

**触发线**（05 风险清单）：单区构建 > 15 min 或内存 > 8GB → 上报评估换框架，
不要继续往上加批次硬扛。

搜索若单区开启（learn 区规模小可开），沿用 leetcode 的 miniSearch 中文二元组分词
（默认分词对中文整句不切分会产生海量超长唯一词导致 OOM）与"剔除代码块"的
`_render` 裁剪，配置原样拷自 leetcode `config.mts`。

## 4. KaTeX 与 Vue 插值转义

数学公式用 `@traptitech/markdown-it-katex`，配套转义规则**整套拷入**（leetcode
`config.mts` 的 `markdown.config`，少一条都会有页面编译失败）：

1. `md.use(katex, { output: 'html', strict: 'ignore' })`——不输出 MathML：
   annotation 里的 TeX 源码（如 `\mathrel{{+}{=}}`）含 `{{`，会被 Vue 当插值。
2. `math_inline` / `math_block` 渲染结果里的 `{` `}` 再转义为 HTML 实体——
   KaTeX 可见输出也可能含字面花括号（如 `$\{\{1\},…\}$`）。
3. 禁用 `curly_attributes` 与 `attrs` 规则——VitePress 的行尾 `{…}` 属性语法会把
   正文里的集合记号（如 `{0, 1, 2}`）误解析成 HTML 属性。
4. 行内代码含 `{{`（C++ 初始化列表）时给 token 加 `v-pre`；正文裸 `{{` 拆成
   `&#123;&#123;` 实体。
5. 图片路径重写规则（如周赛的 `images/xxx.svg` → 根绝对路径）拷入后改为走
   content-kit 的统一 URL 重写，不再在 config 里特判。

problems-gpu 区额外拷 `languageAlias: { cuda: 'cpp' }`（CUDA 代码块高亮）。

## 5. 上一题/下一题与列表数据

- leetcode 模式：`config.mts` 构建期扫描目录得到全局题目顺序，`transformPageData`
  注入 `frontmatter.prev/next`——**改为从 frontmatter/统一 ID 派生**，不再靠目录
  扫描 + H1 正则（04 已决策：frontmatter 是唯一元数据来源）。
- 题号区间、周赛场次的排序规则保持现状（题号升序、场次→Q 号升序）。
- 缺失图片容忍插件（`tolerate-missing-images`，把缺失图片解析为 1px 占位图）
  **不拷**——04 已决策由 content-kit 构建期校验引用完整性，缺图即 lint 失败，
  不再容忍 404 占位。

## 6. ai-infra-notes 模板重写策略（learn 区）

自研 Python 生成器（`build/home.py`、`weeks.py`、`topics.py`、`paper.py`）产出的
页面能力，逐块映射到 VitePress：

| 自研站能力 | VitePress 替代 |
|---|---|
| 手风琴式课程导航 | 分区 sidebar 配置（构建期从 frontmatter week/day 生成） |
| TOC 高亮 | 自带 `outline: { level: [2, 3] }` |
| 明暗主题 | 自带 |
| 首页/周/专题索引页 | 自定义 VitePress 主题页 + 构建期数据注入 |
| 每日 8 段骨架排版 | 内容本身即 md，无需模板 |

**先小样后全量**（04 主要风险）：先做 week1 + 一个专题的小样验证导航/排版/公式/图片
四项能力，验收通过再全量 257 篇。这是整个迁移中唯一没有现成代码可拷、工作量最容易
被低估的一块。

## 7. 常用命令

```bash
pnpm --filter docs dev                    # 本地开发（默认单区全量，:4173）
pnpm --filter docs build                  # 三区串行全量构建（本地）
# CI 分批（以 problems-algo 为例，4 批）：
BATCH_TOTAL=4 BATCH_INDEX=0 NODE_OPTIONS=--max-old-space-size=6144 \
  pnpm --filter docs build:algo
# 合并各批 dist_* 产物 → 部署目录（scripts/merge-dist.mts）
```

构建产物打进 docs 的 nginx 镜像分发，图片随镜像走（方案一，切换阈值与兜底见
[deployment](deployment.md) 与 04 主要风险）。

## 8. 注意事项

- `base` 路径按部署路径配置（`/learn/`、`/problems/gpu/`、`/problems/algo/`），
  禁止在内容文件里硬编码（内容里是内容 ID 相对引用，构建期由 content-kit 重写）。
- 内容文件不进 `apps/docs/` Git 目录重复存放——构建脚本从 `packages/content/` 拷入
  或软链，拷入动作属于构建流程而非手工步骤。
- 统计数字（"共 N 题"）由 content-kit 构建期注入，页面文案禁止手写（06 硬编码禁令）。
