# 06 开发文档

> 面向开发者的落地指南。产品与技术决策见 [01](01-product-design.md)–[05](05-roadmap.md)，
> 本文只讲"怎么开发、怎么跑起来"。代码以 `interview` 仓库为底座拷入起步（见
> [04-migration](04-migration.md#整合步骤)），本文的命令与结构按目标 monorepo 形态编写；
> 尚未收编的模块会标注现状。

## 1. 环境准备

| 依赖 | 版本 | 用途 |
|---|---|---|
| Node.js | ≥ 20（镜像用 node:22-slim） | server / web / cli / docs / judge-worker |
| pnpm | ≥ 9 | workspace 包管理（沿用 interview） |
| Docker + docker compose | 任意近期版本 | MySQL、评测沙箱、整套部署 |
| Python | ≥ 3.10 | content-kit 的内容 lint（吸收自 ai-infra-notes 的检查脚本） |
| 构建工具链 | g++ ≥ 11、python3 | 算法评测镜像（algo）内的编译运行环境 |

不需要：GPU / nvidia-container-toolkit（GPU 题评测引流 leetgpu.com，见 05 已决策）。

## 2. 仓库结构

```
ai-infra-lab/
├── apps/
│   ├── web/            # 门户应用：React 19 + Vite 8 + Tailwind 4 + react-router 7 + TanStack Query
│   ├── server/         # API：Hono + tRPC 11 + Drizzle ORM + MySQL 8
│   ├── docs/           # 内容站：VitePress 三分区（learn / problems-gpu / problems-algo）
│   ├── cli/            # 管理 CLI：commander + tsx，经 appRouter.createCaller() 直调后端
│   └── judge-worker/   # 评测沙箱：DB 轮询取任务，Docker-out-of-Docker 拉起一次性容器
├── packages/
│   ├── contracts/      # zod 共享 schema（tRPC 端到端类型安全的源头）
│   ├── content/        # 内容库（全部 Markdown + frontmatter）
│   │   ├── learn/          # ← ai-infra-notes：daily/topics/paper/profiling
│   │   ├── problems-gpu/   # ← leetgpu solutions（含 .cu）
│   │   ├── problems-algo/  # ← leetcode solution/contest/topics
│   │   └── assets/         # 全部 SVG 插图（SVGO 压缩 + 去重后）
│   └── content-kit/    # 内容管线：frontmatter 解析校验、统一 ID、lint、索引导出、题库同步
└── deploy/             # docker-compose.yml、Caddyfile、评测镜像 Dockerfile、备份脚本
```

## 3. 快速开始

```bash
git clone git@github.com:hzchenxiaobin/ai-infra-lab.git && cd ai-infra-lab
pnpm install

# 1. 起依赖（MySQL 8）
docker compose -f deploy/docker-compose.yml up -d mysql

# 2. 配置环境变量
cp .env.example .env        # 至少填 DATABASE_URL、LLM_*、SMTP_*、SESSION_SECRET

# 3. 建表 + 种子数据
pnpm --filter server db:push        # drizzle-kit 迁移
pnpm cli seed                       # 内置 15 道 seed 题
pnpm cli bank:import apps/server/data/question-bank.ai-infra.json   # 729 题题库

# 4. 内容同步（frontmatter 校验 → 元数据入库 → 搜索索引）
pnpm --filter content-kit sync

# 5. 启动开发服务
pnpm --filter server dev            # Hono API，默认 :3000
pnpm --filter web dev               # 门户，默认 :5173
pnpm --filter docs dev              # VitePress 内容站，默认 :4173（三分区见 4.3）
```

日常开发只改代码时第 1、5 步即可；改了 `packages/content/**` 才需要重跑第 4 步。

## 4. 应用开发指南

### 4.1 server（apps/server）

- **入口与分层**：Hono 挂 tRPC 路由；业务逻辑按模块分 router：`interview`（已有）、`judge`、`content`、`progress`、`auth`、`quota`（后四个为新增）。每个 router 一个目录，输入输出校验一律用 `packages/contracts` 的 zod schema。
- **认证**：邮箱 + 密码 + 注册验证码（开放注册制，见 05 已决策）；session cookie。注册验证码写入 `email_verifications` 表，**发送接口必须按 IP/邮箱限流**（这是开放注册下唯一的闸门）。
- **LLM 封装**：沿用 interview 的 OpenAI 兼容协议封装（已适配 Moonshot / Kimi Code / CANNBot / 本地 vLLM；reasoning 模型不传 temperature、60s 超时）。新增调用点必须走这层封装，禁止散落 fetch。模型分级：追问用便宜模型、评估用强模型，模型名走环境变量。
- **配额**：所有评测提交和 LLM 面试先过配额中间件——读 `usage_quotas`，`quota` 为 NULL 表示不限（上线初期默认），仅累加 `used`。**计量先行，限额后置**（见 05 开放问题 1）。
- **DB 变更**：改 `schema.ts` 后跑 `pnpm --filter server db:generate` 生成迁移，提交迁移文件；禁止 `db:push` 直接打到共享环境。

### 4.2 web（apps/web）

- 六个主页面 + 新增：Dashboard / 题库 / 面试间 / 评测 / 报告 / 历史（interview 已有）+ Learn 路径页 / Problems 题库页 / 注册登录（新增）。
- 数据请求一律走 tRPC client + TanStack Query；Markdown/公式渲染复用现有组件（KaTeX 已接入）。
- **职责切分红线**：交互（提交、进度、面试）全在 web；docs 站只做只读浏览，不给 docs 开发任何交互组件（避免 Vue/React 双端重复，见 05 风险清单）。

### 4.3 docs（apps/docs）

- VitePress 三分区，各自独立 `config.mts`、独立构建，产物合并部署到 `/learn`、`/problems/gpu`、`/problems/algo` 路径下。
- 组件来源：leetcode / leetgpu 的 Vue 组件（题目列表、难度标注、图片查看器、上一题/下一题推导）拷入复用；ai-infra-notes 的自研 Python 生成器**不拷**，其页面模板用 VitePress 重写（先做 week1 小样验证再全量，见 04 风险）。
- **大规模构建纪律**（leetcode 的既有经验，必须保留）：
  - `BATCH_INDEX/BATCH_TOTAL` 分批并行构建，CI 4 批；
  - `buildConcurrency: 8`，Node 堆 `--max-old-space-size=6144`；
  - 分批模式下关闭本地搜索，全站搜索走 content-kit 导出的静态索引 + `/search` 页；
  - 触发线：单区构建 > 15 min 或内存 > 8GB → 上报评估换框架（05 风险清单）。
- 数学公式用 `@traptitech/markdown-it-katex`；`{{` 需转义防 Vue 插值误判（leetcode 已有插件，拷入）。

### 4.4 cli（apps/cli）

命令经 `appRouter.createCaller()` 直调后端，不走 HTTP——新管理操作优先进 CLI 而不是做管理页面。

```
cli seed                          # 种子题
cli bank:import <json>            # 题库导入（sourceKey + contentHash 幂等）
cli bank:generate <dir>           # LLM 从内容抽面试题
cli questions ...                 # 题库 CRUD
cli interview start/resume/report # 面试全流程（已有）
```

### 4.5 judge-worker（apps/judge-worker）

- 任务队列就是 DB 表 `submissions`（status: pending → running → ac/wa/ce/tle/mle），worker 轮询领取，不引入 MQ。
- 每个提交起一个一次性容器：algo 镜像（g++ -std=c++17 / python3 / SQLite），限 CPU/内存/时间；容器通过挂载宿主 `/var/run/docker.sock` 在**宿主机**上拉起（Docker-out-of-Docker，不用 dind）。
- 安全红线：容器无网络、只挂只读输入、超时强杀；评测输出比对逻辑沿用 interview 的 `judge/`。
- GPU 题不走这里——题目页引流 leetgpu.com，站内只提供 `.cu` harness 下载与手动标记完成。

## 5. 内容开发工作流

内容是产品的一半，写内容 = 写代码，走同样的 PR 流程。

1. **新建内容**：在 `packages/content/` 对应分区建 md，frontmatter 必填项见
   [03 数据模型](03-data-model.md#统一内容元数据frontmatter)——`id` / `type` / `title` / `tags` / `knowledge_points` 缺一个构建就失败。
2. **统一 ID**：`lc:0001`、`gpu:m:007`、`learn:w03d02`、`paper:xxx` 等规则见
   [03](03-data-model.md#统一题目-id-方案)。GPU 题以目录序号为 ID 真相，官方题号只是展示字段。
3. **图片**：放 `packages/content/assets/<内容ID命名空间>/`，新增 SVG 先过 SVGO；
   正文引用用内容 ID 相对路径，最终 URL 由 content-kit 构建期重写（这是图片存储方案一→四切换的保险，见 04）。
4. **校验**：`pnpm --filter content-kit lint`（重复标题 / 悬空链接 / 陈旧口径 / frontmatter 结构 /
   6 段式与 8 段式模板检查）。**lint 失败即构建失败**，禁止绕过。
5. **统计数字禁止手写**（"共 N 题""10 周"这类），用构建期自动统计注入——历史教训见 04 编号与口径修正。
6. **AI 产内容**：沿用 SKILL.md 规范（每日教程 8 段骨架 / GPU 题解 6 段式 / 论文 17 节 Reviewer 骨架），
   cannbot 批量产题脚本在 content-kit 下运行；周赛更新只在本仓库进行（原仓库已停更）。
7. **提交后**：CI 跑 lint + 分区构建 + `content-kit sync` 产物校验；合并后由部署流程发布（见第 9 节）。

## 6. 数据库

schema 全貌见 [03](03-data-model.md#数据库设计)。常用命令：

```bash
pnpm --filter server db:generate   # 改 schema 后生成迁移
pnpm --filter server db:migrate    # 执行迁移
pnpm cli db:backup                 # mysqldump 到 deploy/backups/（部署机上由 cron 每日跑）
```

要点：内容正文**不入库**（Git 是唯一事实来源），DB 只存元数据 / 索引 / 用户数据；
`contents`、`problems` 由 content-kit 用 `id + contentHash` 幂等 upsert，失效标 `stale` 不物理删除。

## 7. 测试

- 单测/集成测试：vitest。interview 已有两个样板（面试状态机集成测试、评测器测试）——新模块照此模式补测试，**评测器和配额中间件必须有测试**（安全与计费相关）。
- 内容侧：content-kit lint 即测试，CI 必跑。
- e2e：暂不强求；M3 上线前至少覆盖"注册 → 学习 → 提交评测 → 面试 → 报告"一条闭环冒烟。

## 8. 环境变量

`.env.example` 维护完整清单，核心项：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | MySQL 连接串（compose 内为 `mysql:3306`） |
| `SESSION_SECRET` | session 签名密钥 |
| `SMTP_HOST/PORT/USER/PASS` | 注册验证码邮件发送 |
| `LLM_BASE_URL` / `LLM_API_KEY` | OpenAI 兼容端点（Moonshot / Kimi Code / CANNBot / vLLM） |
| `LLM_MODEL_FOLLOWUP` / `LLM_MODEL_EVAL` | 模型分级：追问 / 评估 |
| `JUDGE_CONCURRENCY` / `JUDGE_TIMEOUT_MS` / `JUDGE_MEM_MB` | 评测容器限额 |
| `QUOTA_DEFAULT_*` | 配额默认值（NULL/空 = 不限，上线初期状态） |

## 9. 构建与部署（自有机器 Docker）

```bash
docker compose -f deploy/docker-compose.yml build      # web/docs/server/judge-worker 四个镜像
docker compose -f deploy/docker-compose.yml up -d      # 全栈：caddy + web + docs + server + worker + mysql
```

- 拓扑与端口见 [02 部署架构](02-architecture.md#部署架构)；Caddy 自动 TLS，内网使用可关。
- docs/web 静态产物打进各自 nginx 镜像；图片随 docs 镜像分发（方案一，切换阈值见 04）。
- 升级流程：宿主机 `git pull` → `compose build` → `compose up -d`；MySQL 数据在命名卷，先备份再升级。
- 监控（M3 起）：评测队列积压、LLM 成本/延迟、构建时长、错误率、异常用量告警。

## 10. 开发约定

- **提交**：conventional commits（`feat/fix/docs/content/chore`）；内容 PR 与代码 PR 同流程。
- **加依赖先确认**：优先复用现有栈（Hono/tRPC/Drizzle/React/VitePress），新依赖在 PR 描述里说明理由。
- **类型安全**：server ↔ web ↔ cli 之间的数据结构必须经 `packages/contracts`，禁止各自重定义。
- **硬编码禁令**：内容统计数、题数、URL base path、题目编号一律由 content-kit 构建期生成。
- **单用户残留清理**：interview 拷入代码里的自动 provision 逻辑在 M2 账号体系落地时删除，勿在新代码上叠加。

## 附：interview 仓库代码映射（起步参考）

| interview 现状 | 本产品去向 | 备注 |
|---|---|---|
| `apps/server`（~2600 行） | `apps/server` | interview/judge/sync/seed 路由直接可用 |
| `apps/web`（~2000 行，6 页面） | `apps/web` | 新增 Learn/Problems/注册登录页 |
| `apps/cli` + `packages/contracts` | 同名目录 | 原样拷入 |
| `data/question-bank.ai-infra.json`（729 题） | DB `questions` 表 | `cli bank:import` 入库 |
| `Dockerfile` + `docker-compose.yml` | `deploy/` | 扩展为全栈 compose |
| `vscode-mock-interview/` | **不拷** | 一次性 hack，见 04 拷贝排除清单 |
| leetcode `build.py` / ai-infra-notes `build/` | **不拷** | 自研生成器退役，lint 逻辑抽进 content-kit |
