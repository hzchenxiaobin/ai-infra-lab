# 04 内容融合与迁移方案

## 边界约束（2026-09 决策）

- 新产品是**独立的新仓库**：不依赖、不改动四个原仓库。
- 需要的内容与代码以**一次性快照拷贝**迁入；迁入后新产品是唯一维护地，原仓库继续独立演进、互不影响。
- 原仓库的三个 GitHub Pages 站照常运行；新产品不做 301、不做跨站互链，以独立域名冷启动。
- **原仓库停更**（2026-09 决策）：拷贝完成后原仓库内容线停止更新，后续更新（周赛题解、新 GPU 题等）只发生在新仓库——不存在双更窗口与分叉问题。产题管线（SKILL.md + cannbot 脚本）随内容一并拷入，拷贝完成即完成生产地切换。

## 资产盘点与拷贝清单

| 仓库 | 资产 | 规模 | 拷贝目的地 |
|---|---|---|---|
| ai-infra-notes | 课程 10 周 × 7 天、18 专题、论文精读（9 完成 / 27 计划）、profiling、72 个 `.cu`、849 张 SVG | 257 篇 md | `packages/content/learn/` |
| leetcode | 4042 篇题解、81 篇周赛、4 专题、hot-interview、10 周计划、~1.2 万张 SVG | ~175M | `packages/content/problems-algo/` |
| leetgpu | 106 篇题解、108 个 `.cu`、237 张 SVG、cuda-interview-notes | 3.5M（内容） | `packages/content/problems-gpu/` |
| interview | 应用代码（web/server/cli/contracts）、729 题题库 JSON、Dockerfile/compose | 代码 ~6100 行；题库 1.2MB | 代码 → `apps/` + `packages/contracts/`（作底座模板）；题库 → DB |

**拷贝时直接排除**（死代码与构建产物）：

- ai-infra-notes：`public/`（56M 构建产物，误提交进 Git）、`build/` 自研生成器（功能由 apps/docs 重写替代，但其 lint 检查逻辑抽进 content-kit）
- leetcode：旧版 `build.py` + `static/`（已弃用）、`node_modules/`、`dist/`
- interview：`vscode-mock-interview/`（一次性 hack）、`node_modules/`
- 各仓库 `.git`：**不迁移历史**，新仓库从零提交，README 注明内容出处

## 去重矩阵（拷贝期执行）

去重发生在**拷入新仓库时**：同源内容只拷一份，其余位置剔除并改为统一 ID 链接。原仓库全程保持原样。

| 重复对 | 决策（拷贝后唯一事实来源） |
|---|---|
| leetgpu 题解 ↔ ai-infra-notes 教程"实战环节" | GPU 题解只拷 leetgpu 版（6 段式更完整、带 ncu 分析）；每日教程拷贝时剔除内嵌题解，改为 frontmatter `related_problems` 链接 |
| ai-infra-notes `topics/cuda`（LeetGPU 43 题对照）↔ leetgpu | 专题保留知识点综述，题目清单剔除改为链接；对照关系进 `related_problems` |
| interview 题库 cuda/knowledge 729 题 ↔ ai-infra-notes 笔记 | 题库 JSON 直接入库，不存正文，通过统一 ID 回链内容页；LLM 抽取脚本拷入 content-kit，作为新产品的增量抽题工具 |
| leetgpu `cuda-interview-notes.md` ↔ interview 题库 cuda 分区 | 面经作为 learn 内容拷入；考点↔题号对照进 knowledge_points + related_problems，不再维护手工表格 |
| leetcode hot-interview / 10-week-plan ↔ ai-infra-notes 学习路线 | 合并为一个学习路径功能：主路径（AI Infra 10 周）+ 算法副线题单 |
| 各仓库 SVG（风格统一，散落三处，共 ~1.3 万张） | 统一拷入 `packages/content/assets/`，按内容 ID 分目录；构建期校验引用完整性（替代 leetcode 的"缺失图片占位"容忍插件） |

## 编号与口径修正（拷贝期一次性处理）

1. **leetgpu 编号错位**（#109/#110/#113/#114 与官方冲突）：新产品内 ID 一律用目录序号（见 03），官方题号降级为展示字段。新仓库无历史 URL，无需兼容旧编号链接。
2. **统计硬编码不一致**（leetgpu 题数 105/106/96、课程"8 周" vs 实际 10 周等）：改为构建期自动统计注入，文案禁止手写总数。
3. **base path 硬编码**（`/leetgpu/`、`/leetcode/`，图片用站点根绝对路径）：拷入后统一改为内容 ID 相对引用，content-kit 构建期重写为最终 URL。

## 整合步骤

每步独立可验证，全程零改动原仓库：

1. **建新仓库骨架**：以 interview 的 pnpm workspace / Dockerfile / compose 为模板拷入，初始化 `apps/`、`packages/` 结构（从零提交）。
2. **内容快照拷入**：三个内容仓库的 md / kernel / 图片拷入 `packages/content/` 对应分区（排除清单见上）；interview 题库 JSON 直接入库。
3. **frontmatter 补齐**：一次性脚本批量生成（题号/难度从目录名、标签从 `**标签**` 行提取，知识点人工 + LLM 辅助标注），content-kit 校验全绿为完成标准。
4. **去重与改链**：按去重矩阵执行，同源内容只留一份，交叉引用改为统一 ID。
5. **docs 站搭建**：leetcode/leetgpu 的 VitePress 主题组件拷入 `apps/docs`，按三分区配置；ai-infra-notes 的自研生成器不拷，其页面模板用 VitePress 重写（手风琴导航、TOC 高亮、明暗主题等交互，VitePress 均有对应能力或成熟插件）。
6. **DB 同步打通**：CI 跑 content-kit 同步，产出元数据 JSON + 搜索索引；server 导入。
7. **独立上线**：新产品独立域名部署，与原三站零耦合。是否引流见 05 开放问题。

## 主要风险

- **ai-infra-notes 自研站模板 → VitePress 重写**是工作量最大、且唯一没有现成代码可拷的迁移块，建议先做小样（week1 + 一个专题）验证再全量。
- **1.3 万张 SVG + 175M 内容体积**：已定方案（2026-09 决策）——**Git 直存起步**：图片随内容进 `packages/content/assets/`，构建时打进 docs nginx 镜像（SVG 是文本，Git 压缩效率高；自建单机部署消解了镜像体积顾虑）。**兜底方案**：仓库 >1GB 或 clone >5 分钟时切"宿主机 assets 目录 + 卷挂载进 docs 容器"；图片引用统一走内容 ID + content-kit 构建期重写 URL，切换不改任何内容文件。拷贝期先做 SVGO 压缩（Excalidraw 的 feTurbulence SVG 通常可压 30–60%）与跨仓库图片去重。
- ~~内容分叉~~：已消除（2026-09 决策：原仓库停更，更新只在新仓库）。剩余注意点：产题管线拷入时确认其外部依赖（cannbot 工具、LLM 凭据、定时任务）在新环境可用。
- **frontmatter 知识点标注**：4000+ 篇算法题解无法全人工，初版规则（标签映射）+ LLM 批量标注，人工抽查高频题。
