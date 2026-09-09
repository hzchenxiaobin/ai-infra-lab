# AIInfra Lab（暂定名）— 产品设计说明书

> 将 `ai-infra-notes`、`leetcode`、`leetgpu`、`interview` 四个仓库融合为一个
> **AI Infra 学习 + 刷题 + 面试** 一体化产品的设计方案。
>
> 边界约束（2026-09 决策）：新产品是**独立的新仓库**，不依赖、不改动四个原仓库；
> 需要的内容与代码以一次性快照拷贝迁入，迁入后新产品为唯一维护地。

## 一句话定位

面向 AI Infra 方向（推理系统 / CUDA 内核 / 大模型工程化）求职者的
**"学 — 练 — 面"闭环备战平台**：体系化学习路径，配套 GPU/算法题库与在线评测，
LLM 驱动的模拟面试，三者通过统一知识图谱互相引用、用同一份进度数据串联。

## 四个仓库的角色映射

| 仓库 | 现状 | 融合后角色 |
|---|---|---|
| `ai-infra-notes` | 10 周学习路线 + 18 专题 + 论文精读，自研 Python 静态站（257 篇 md，72 个 CUDA kernel，849 张 SVG） | **学习（Learn）模块**：课程、专题、论文、面经知识库 |
| `leetcode` | VitePress 中文算法题解站（4042 篇题解 + 81 篇周赛 + hot-interview 榜单 + 10 周刷题计划） | **题库（Problems）模块**的算法分区 |
| `leetgpu` | VitePress CUDA 题解站（106 篇 6 段式题解 + 108 个可编译 `.cu` + ncu 分析） | **题库（Problems）模块**的 GPU 分区 |
| `interview` | 可运行的全栈模拟面试应用（React + Hono + tRPC + Drizzle + MySQL，LLM 面试官 + 729 题题库 + 在线评测） | **交互底座**：面试（Interview）、评测（Judge）、进度（Progress）模块由此扩展 |

设计动机详见 [01 产品设计的"背景与痛点"](01-product-design.md#背景与痛点)。

## 文档导航

| 文档 | 内容 |
|---|---|
| [01-product-design.md](01-product-design.md) | 产品定位、目标用户、核心闭环、功能模块、信息架构 |
| [02-architecture.md](02-architecture.md) | 融合策略、monorepo 结构、技术选型决策、部署架构 |
| [03-data-model.md](03-data-model.md) | 统一内容元数据规范、统一题目 ID 方案、数据库设计 |
| [04-migration.md](04-migration.md) | 资产盘点、去重矩阵、编号冲突处理、迁移步骤 |
| [05-roadmap.md](05-roadmap.md) | 里程碑（M0–M4）、验收标准、风险与开放问题 |
| [06-development.md](06-development.md) | 开发文档：环境准备、快速开始、各应用开发指南、内容工作流、部署运维 |

## 核心设计决策速览

1. **融合策略**：不做"四个站互链"的门户聚合，最终形态为单一 monorepo 单一产品；
   新产品独立成仓（原仓库零改动、零依赖，内容与代码快照拷入），分阶段迁移，先数据打通、
   再应用融合（见 [02](02-architecture.md#融合策略) 与 [04](04-migration.md)）。
2. **交互底座**：以 `interview` 应用（React 19 + Hono + tRPC + Drizzle）为唯一交互层底座，
   学习路径、题库浏览、评测、面试、进度全部收进这一个 Web 应用。
3. **内容形态**：学习内容与题解继续以 Markdown 静态渲染（VitePress），
   但全部补齐 frontmatter 元数据，构建期同步入库，成为可检索、可推荐、可追踪进度的数据。
4. **唯一事实来源**：每篇内容/每道题只有一个 home，交叉引用一律用统一 ID 链接，
   消除 leetgpu↔ai-infra-notes 的双份维护（见 [04](04-migration.md#去重矩阵)）。
5. **评测安全**：评测从"本机裸跑"升级为容器隔离的沙箱执行，这是产品化上线的前置条件
   （见 [02](02-architecture.md#评测沙箱)）。
6. **定位为对外产品**（2026-09 决策）：多用户账号体系、GPU 评测沙箱、配额限流与 LLM 成本
   控制均进入主路线图，不再是可选项（见 [02](02-architecture.md#6-多用户与安全对外产品)
   与 [05](05-roadmap.md)）。
7. **部署形态**（2026-09 决策）：自有机器 Docker 单机部署，一份 docker-compose 管全部服务；
   不上 GitHub Pages、不上云平台（见 [02](02-architecture.md#部署架构)）。
8. **图片存储**（2026-09 决策）：Git 直存 + 打进 docs 镜像起步；仓库 >1GB 或 clone >5 分钟时
   切宿主机 assets 目录 + 卷挂载兜底，URL 重写层保证切换不改内容（见 [04](04-migration.md#主要风险)）。
9. **GPU 评测**（2026-09 决策）：部署机无 GPU，不自建 GPU 沙箱；GPU 题评测引流 leetgpu.com，
   站内提供 `.cu` harness 下载自测 + 刷题状态手动标记（见 [01](01-product-design.md)、
   [02](02-architecture.md#评测沙箱judge-worker)）。
