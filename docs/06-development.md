# 06 开发文档（总览与索引）

> 面向开发者的落地指南。产品与技术决策见 [01](01-product-design.md)–[05](05-roadmap.md)，
> 本文是**跨模块的总览**（环境准备、仓库结构、快速开始、测试、环境变量、开发约定、
> interview 代码映射）；各模块的详细开发文档在 [dev/](dev/) 目录。
> 代码以 `interview` 仓库为底座拷入起步（见 [04-migration](04-migration.md#整合步骤)），
> 本文的命令与结构按目标 monorepo 形态编写；尚未收编的模块会标注现状。

## 模块开发文档索引（dev/）

| 文档 | 模块 | 内容 |
|---|---|---|
| [dev/server.md](dev/server.md) | `apps/server` | Hono + tRPC 分层、router 划分、认证、LLM 封装与模型分级、配额中间件、DB 迁移、面试状态机与题库幂等 |
| [dev/web.md](dev/web.md) | `apps/web` | 页面清单与路由、tRPC client + TanStack Query 约定、组件组织、Markdown/KaTeX 渲染、与 docs 职责切分 |
| [dev/content-site.md](dev/content-site.md) | `apps/docs` | VitePress 三分区、Vue 组件拷入清单、大规模构建纪律、KaTeX/Vue 插值转义、ai-infra-notes 模板重写 |
| [dev/cli.md](dev/cli.md) | `apps/cli` | createCaller 模式、命令清单与示例、新管理操作的添加方式 |
| [dev/judge-worker.md](dev/judge-worker.md) | `apps/judge-worker` | submissions 轮询队列、Docker-out-of-Docker、algo 镜像、安全红线、SQL 题评测、GPU 题引流 |
| [dev/content-kit.md](dev/content-kit.md) | `packages/content-kit` | frontmatter 校验、统一 ID、lint、图片规范、内容→DB 同步、搜索索引、LLM 抽题与 cannbot |
| [dev/database.md](dev/database.md) | MySQL + Drizzle | 全量 schema 说明、掌握度模型 SQL、drizzle-kit 命令、备份 |
| [dev/deployment.md](dev/deployment.md) | `deploy/` | docker-compose 全栈拓扑、镜像构建、升级流程、MySQL 备份、监控告警 |

## 1. 环境准备

| 依赖 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥ 20（镜像用 node:22-slim） | server / web / cli / docs / judge-worker |
| pnpm | ≥ 9（镜像 corepack 固定 pnpm@11.18.0） | workspace 包管理（沿用 interview） |
| Docker + docker compose | 任意近期版本 | MySQL、评测沙箱、整套部署 |
| Python | ≥ 3.10 | 迁移期一次性脚本与 cannbot 产题辅助 |
| 构建工具链 | g++ ≥ 11、python3、SQLite | 算法评测镜像（algo）内的编译运行环境 |

不需要：GPU / nvidia-container-toolkit（GPU 题评测引流 leetgpu.com，见 05 已决策）。

## 2. 仓库结构

```
ai-infra-lab/
├── docs/               # 仓库文档：01–06 设计文档 + dev/ 模块开发文档
├── apps/
│   ├── web/            # 门户应用：React 19 + Vite 8 + Tailwind 4 + react-router 7 + TanStack Query
│   ├── server/         # API：Hono + tRPC 11 + Drizzle ORM + MySQL 8
│   ├── docs/           # 内容站：VitePress 三分区（learn / problems-gpu / problems-algo）
│   ├── cli/            # 管理 CLI：commander + tsx，经 appRouter.createCaller() 直调后端
│   │                   #   bank:generate / bank:import（LLM 题库管线）+ data/ 题库 JSON
│   └── judge-worker/   # 评测沙箱：DB 轮询取任务，Docker-out-of-Docker 拉起一次性容器
├── packages/
│   ├── contracts/      # zod 共享 schema（tRPC 端到端类型安全的源头）
│   ├── content/        # 内容库（全部 Markdown + frontmatter）
│   │   ├── learn/          # ← ai-infra-notes：daily/topics/paper/profiling
│   │   ├── problems-gpu/   # ← leetgpu solutions（含 .cu 与 images/）
│   │   └── problems-algo/  # ← leetcode solution/contest/topics（images/ 就地存放）
│   └── content-kit/    # 内容管线：frontmatter 解析校验、统一 ID、lint、索引导出、题库同步
└── deploy/             # docker-compose.yml、Caddyfile、评测镜像 Dockerfile、备份脚本
```

> 图片布局（2026-09 决策修正）：原计划的 `packages/content/assets/` 统一命名空间
> **不执行**——图片就地存放在各分区（`problems-algo/{solution/,}images/`、
> `problems-gpu/images/`、`learn/**/images/`），与内容同 Git 路径演进；URL 解耦
> 由 docs sync 的构建期重写层承担（图片引用在 sync 时改写为分区 public 绝对路径，
> 未来切宿主机卷挂载只改 sync 脚本，不动内容文件）。原 assets/ 方案的两个目标
> （SVGO 压缩去重、URL 切换保险）前者转入 content-kit 的可选任务，后者已由
> sync 重写层达成。

各目录内部的详细结构见对应 dev/ 文档。

## 3. 快速开始

```bash
git clone git@github.com:hzchenxiaobin/ai-infra-lab.git && cd ai-infra-lab
pnpm install

# 1. 起依赖（MySQL 8）
docker compose -f deploy/docker-compose.yml up -d mysql

# 2. 配置环境变量
cp .env.example .env        # 至少填 DATABASE_URL、LLM_*、SMTP_*、SESSION_SECRET

# 3. 建表 + 种子数据
pnpm --filter server db:push        # drizzle-kit 迁移（本地从零起库）
pnpm cli seed                       # 内置 15 道 seed 题
pnpm cli bank:import   # 729 题题库（默认 apps/cli/data/question-bank.ai-infra.json）

# 4. 内容同步（frontmatter 校验 → 元数据入库 → 搜索索引）
pnpm --filter content-kit sync

# 5. 启动开发服务
pnpm --filter server dev            # Hono API，默认 :3001
pnpm --filter web dev               # 门户，默认 :5173（/trpc 代理到 :3001）
pnpm --filter docs dev              # VitePress 内容站，默认 :4173
```

日常开发只改代码时第 1、5 步即可；改了 `packages/content/**` 才需要重跑第 4 步。

## 4. 应用开发指南（索引）

各应用的目录结构、关键文件、数据流、配置项与红线均已拆分为独立文档：

- **server**：router 模块划分（已有 question/interview/judge，新增 auth/content/
  progress/quota）、邮箱+验证码认证、LLM 封装与模型分级、配额中间件（计量先行限额
  后置）、DB 迁移工作流、断点续面状态机与题库 sourceKey/contentHash 幂等 →
  [dev/server.md](dev/server.md)
- **web**：页面清单与路由、数据请求约定（tRPC client + TanStack Query）、组件组织、
  Markdown/KaTeX 渲染组件、与 docs 站的职责切分红线 → [dev/web.md](dev/web.md)
- **docs**：三分区配置、Vue 组件拷入清单、大规模构建纪律（BATCH_INDEX/BATCH_TOTAL、
  buildConcurrency、6GB 堆、分批关搜索）、KaTeX 与 Vue 插值转义、ai-infra-notes
  模板重写策略 → [dev/content-site.md](dev/content-site.md)
- **cli**：createCaller 模式、命令清单与用法示例、新管理操作添加方式 →
  [dev/cli.md](dev/cli.md)
- **judge-worker**：DB 表轮询队列、Docker-out-of-Docker、algo 镜像、资源限额与安全
  红线、SQL 题评测、GPU 题引流 → [dev/judge-worker.md](dev/judge-worker.md)

## 5. 内容开发工作流（索引）

写内容 = 写代码，走同样的 PR 流程。frontmatter 规范与校验、统一 ID 方案、lint
（重复标题/悬空链接/陈旧口径/模板结构）、图片规范（assets 目录、SVGO、URL 重写）、
内容→DB 幂等同步、搜索索引导出、LLM 抽题管线、SKILL.md 规范与 cannbot 产题，
全部详见 → [dev/content-kit.md](dev/content-kit.md)

## 6. 数据库（索引）

schema 全貌与逐表说明、掌握度模型 SQL、drizzle-kit 命令与备份 →
[dev/database.md](dev/database.md)。设计依据见
[03 数据模型](03-data-model.md#数据库设计)。要点：内容正文**不入库**（Git 是唯一
事实来源），DB 只存元数据 / 索引 / 用户数据；`contents`、`problems` 由 content-kit
用 `id + contentHash` 幂等 upsert，失效标 `stale` 不物理删除。

## 7. 测试

- 单测/集成测试：vitest。interview 已有两个样板（`routers/interview.test.ts` 面试
  状态机集成测试、`judge/judge.test.ts` 评测器测试）——新模块照此模式补测试，
  **评测器和配额中间件必须有测试**（安全与计费相关）。
- 内容侧：content-kit lint 即测试，CI 必跑。
- e2e：暂不强求；M3 上线前至少覆盖"注册 → 学习 → 提交评测 → 面试 → 报告"一条闭环冒烟。

## 8. 环境变量

`.env.example` 维护完整清单，核心项（各模块完整清单见对应 dev/ 文档）：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | MySQL 连接串（compose 内为 `mysql:3306`） |
| `PORT` | server 端口，默认 3001 |
| `SESSION_SECRET` | session 签名密钥 |
| `SMTP_HOST/PORT/USER/PASS` | 注册验证码邮件发送 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_VKEY` | OpenAI 兼容端点（Moonshot / Kimi Code / CANNBot / vLLM） |
| `LLM_MODEL_FOLLOWUP` / `LLM_MODEL_EVAL` | 模型分级：追问 / 评估（现状单 `LLM_MODEL`，分级为新增） |
| `JUDGE_CONCURRENCY` / `JUDGE_TIMEOUT_MS` / `JUDGE_MEM_MB` | 评测容器限额 |
| `QUOTA_DEFAULT_*` | 配额默认值（NULL/空 = 不限，上线初期状态） |

## 9. 构建与部署（索引）

自有机器 Docker 单机部署：docker-compose 全栈拓扑（Caddy/web/docs/server/
judge-worker/MySQL）、镜像构建、升级流程、MySQL 备份、监控告警、无 GPU 依赖说明，
全部详见 → [dev/deployment.md](dev/deployment.md)

## 10. 开发约定

- **提交**：conventional commits（`feat/fix/docs/content/chore`）；内容 PR 与代码 PR 同流程。
- **加依赖先确认**：优先复用现有栈（Hono/tRPC/Drizzle/React/VitePress），新依赖在 PR 描述里说明理由。
- **类型安全**：server ↔ web ↔ cli 之间的数据结构必须经 `packages/contracts`，禁止各自重定义。
- **硬编码禁令**：内容统计数、题数、URL base path、题目编号一律由 content-kit 构建期生成。
- **单用户残留清理**：interview 拷入代码里的自动 provision 逻辑（`auth.ts` 的
  `getCurrentUserId`）在 M2 账号体系落地时删除，勿在新代码上叠加。

## 附：interview 仓库代码映射（起步参考）

| interview 现状 | 本产品去向 | 备注 |
|---|---|---|
| `apps/server`（~2600 行） | `apps/server` | question/interview/judge 路由直接可用；`sync/`（GitHub 在线拉取）退役，由 content-kit 本地管线替代 |
| `apps/web`（~2000 行，6 页面） | `apps/web` | 新增 Learn/Problems/注册登录/搜索页 |
| `apps/cli` + `packages/contracts` | 同名目录 | 原样拷入；server 的 `bank:generate/import` 脚本收编为 CLI 子命令 |
| `data/question-bank.ai-infra.json`（729 题） | DB `questions` 表 | `cli bank:import` 入库 |
| `Dockerfile` + `docker-compose.yml` | `deploy/` | 扩展为全栈 compose（现状：单镜像 + 仅 mysql 服务） |
| `vscode-mock-interview/` | **不拷** | 一次性 hack，见 04 拷贝排除清单 |
| leetcode `build.py` / ai-infra-notes `build/` | **不拷** | 自研生成器退役，lint 逻辑用 TS 重写进 content-kit |
