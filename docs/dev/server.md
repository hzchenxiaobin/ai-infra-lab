# server — API 服务开发指南

> `apps/server`：Hono + tRPC 11 + Drizzle ORM + MySQL 8。以 `interview/apps/server`
> （约 2600 行）为底座拷入起步，本文区分【已有】与【新增】。产品决策见
> [02 架构](../02-architecture.md#2-交互层全面沿用-interview-的技术栈) 与
> [03 数据模型](../03-data-model.md#数据库设计)；DB schema 细节见 [database](database.md)。

## 1. 目录结构

```
apps/server/
├── src/
│   ├── index.ts            # 【已有】Hono 入口：/trpc/* 挂 tRPC，/healthz 健康检查
│   ├── env.ts              # 【已有】zod 校验的环境变量（加载仓库根 .env）
│   ├── trpc.ts             # 【已有】initTRPC + superjson；createContext 注入 userId
│   ├── auth.ts             # 【重写】现为单用户自动 provision，M2 改为 session cookie 认证
│   ├── middleware/         # 【新增】配额计量、限流、错误打点
│   │   └── quota.ts
│   ├── routers/
 │   │   ├── index.ts        # appRouter 聚合出口（web/cli 的类型源头）
 │   │   ├── health.ts       # 【已有】
 │   │   ├── question.ts     # 【已有】题库 CRUD + stats + scopes + seed
 │   │   ├── interview.ts    # 【已有】面试状态机（start/reply/finish/list/get/stats）
 │   │   ├── judge.ts        # 【已队列化】getProblem/submit/getResult（submissions 表 + 轮询）
 │   │   ├── auth.ts         # 【已有】注册/登录/验证码/登出/当前用户 + user:list/ban（admin）
 │   │   ├── content.ts      # 【已有】内容元数据查询（contents/problems 表）
 │   │   ├── progress.ts     # 【已有】进度标记、掌握度聚合、Dashboard 数据
 │   │   └── quota.ts        # 【已有】用量查询 + adminGet/adminSet（CLI quota:*）
 │   ├── interviewer/
 │   │   ├── factory.ts      # 【已有】纯 LLM 模式，getInterviewer()
 │   │   └── llm.ts          # 【已有】OpenAI 兼容封装 + 状态机 prompt（FOLLOWUP/EVAL 分级）
 │   ├── judge/              # 评测队列（in-process worker，开发形态；评测核心在 @ailab/judge-core）
 │   │   ├── context.ts      #   判题上下文装配（problems 表数据源，router 与 worker 共用）
 │   │   ├── worker.ts       #   in-process 队列 worker（生产由独立 judge-worker 接管）
 │   │   └── worker.test.ts  #   队列语义 + 端到端 + AC 联动测试
│   ├── db/
│   │   ├── client.ts       # mysql2 pool + drizzle
│   │   ├── schema.ts       # 全部表定义（见 database.md）
│   │   └── migrations/     # drizzle-kit 生成的迁移
│   ├── seed.ts             # 【已有】15 道内置种子题
│   └── sync/               # sync/index.ts contentHash；github.ts 在线拉仓库（CLI bank:generate 用）
├── drizzle.config.ts
└── package.json            # @ailab/server（bank 管线已收编进 apps/cli，见 dev/cli.md）
```

## 2. 入口与请求链路

`src/index.ts`（现状，21 行）：Hono 应用，`/trpc/*` 先过 `cors()` 再挂
`trpcServer({ router: appRouter, createContext })`，另暴露 `GET /healthz`。
新增非 tRPC 端点（如 docs 搜索索引下载、图片代理）直接挂在同一个 Hono 实例上。

```
浏览器/CLI ──HTTP──▶ Hono ──▶ createContext（解析 session → userId）
                              │
                              ▼
                        appRouter（tRPC，superjson 序列化）
                              ├─ publicProcedure   无需登录（health、注册、登录、验证码）
                              └─ authedProcedure   需登录，ctx.userId 可用
```

`src/trpc.ts` 现状：`createContext` 调 `getCurrentUserId()` 自动 provision 唯一用户。
**M2 改造**：`createContext` 从 cookie 解 session 得 `userId`，未登录时 `userId = null`；
`authedProcedure` 上加 `enforceUser` 中间件，null 即抛 `UNAUTHORIZED`。自动 provision
逻辑删除（06 开发约定：勿在新代码上叠加单用户残留）。

## 3. Router 模块划分

| Router | 状态 | 职责 |
|---|---|---|
| `health` | 已有 | 存活探针 |
| `question` | 已有 | 题库 CRUD / 分页筛选 / stats / scopes / seed |
| `interview` | 已有 | 面试状态机全流程（见 §6） |
| `judge` | 已队列化 | getProblem / submit（写 submissions 队列）/ getResult（轮询 + AC 联动 user_progress）；统一题目 ID 入参（problems 表数据源，2026-09-10 第六批）；执行见 `judge/worker.ts` |
| `auth` | 已有 | 发送验证码 / 注册 / 登录 / 登出 / me；user:list / userSetBanned / userByEmail（admin，CLI 用） |
| `content` | 已有 | contents/problems 元数据查询、统一 ID 解析、import（admin，含 problem_lists 题单 upsert） |
| `progress` | 已有 | 进度标记 upsert、掌握度雷达、Dashboard 聚合（含 streakDays） |
| `problem` | 已有 | 题库浏览（list/facets）+ 题单（lists/getList：成员有序 + AC 联动）+ 周赛（contestSessions/contestProblems：场次聚合与 Q 序） |
| `quota` | 已有 | me + adminGet/adminSet（CLI quota:get/set，admin） |

约定：**每个 router 的输入输出 schema 一律放 `packages/contracts`**，router 内只做
编排，不手写 zod 对象（已有代码的 `z.object({ sessionId: ... })` 这类局部 schema
在新增代码中不再出现，逐步收编进 contracts）。

## 4. 认证（auth router，M2 新增）

开放注册制：邮箱 + 密码 + 注册验证码（2026-09 决策，见 05）。

```
POST 验证码   auth.sendCode     → 写 email_verifications（code 存 hash）+ SMTP 发信
POST 注册     auth.register     → 校验验证码 → 建 users 行 → 种 session cookie
POST 登录     auth.login        → 校验密码（scrypt hash）→ 封禁拒绝 → 种 session cookie
GET  当前用户  auth.me           → session → users 行
POST 登出     auth.logout       → 销 session
```

封禁（`users.banned_at`，cli user:ban）：登录直接 FORBIDDEN；session 为无状态签名
cookie 无法主动吊销，封禁在 `enforceUser` 中间件生效（每个已认证请求一次主键查询，
封禁即全部 authedProcedure 返回 UNAUTHORIZED）。

- **验证码发送限流是开放注册下唯一的闸门**（05 风险清单"滥用与刷接口"）：
  按 IP + 邮箱双维度限流（如每邮箱 1 封/分钟、5 封/天；每 IP 20 封/天），
  `email_verifications.attempts` 记校验失败次数，超限作废。
- session 用签名 cookie（`SESSION_SECRET`），服务端不落库会话表，过期 7 天滑动。
- OAuth（GitHub/Google）只预留 `oauth_identities` 表，M2 不实现登录链路。

## 5. LLM 封装与模型分级

`src/interviewer/llm.ts` 是唯一合法的 LLM 出口，**新增调用点（报告推荐、题解摘要、
搜索增强）必须复用这层封装，禁止散落 fetch**。

现有契约（拷入即得，勿回退）：

- OpenAI 兼容 `POST {LLM_BASE_URL}/chat/completions`，Bearer 鉴权；
  `LLM_VKEY` 非空时加 `x-api-vkey` 头（cannbot 网关要求）。
- **不传 temperature**（kimi-for-coding 等模型锁定为 1，显式传会 400）。
- 超时 60s（reasoning 模型评估调用实测 20–40s）；`max_tokens` 按用途分档：
  发言 2048、评估 8192（reasoning 先吃思考 token，给小了会截断 JSON）。
- 重试一次后抛错，无规则引擎降级；面试官发言做 `leaksKeyPoints` 泄露检查
  （整句复用评分要点即重试）。
- 上下文裁剪：当前题 + 最近 6 条消息。

**模型分级（已落地）**：`LLM_MODEL_FOLLOWUP`（追问/开场，便宜模型）与
`LLM_MODEL_EVAL`（评估，强模型）缺省回落 `LLM_MODEL`；`chatCompletion` 的 `model`
参数由调用方按用途选择（发言类走 `followupModel()`，评估走 `evalModel()`）；
用量与延迟打点进监控（LLM 调用是对外产品主要变动成本，见 02 §6）。

## 6. 关键实现：面试状态机（断点续面）

状态全部落在 `interview_sessions` 行上（`currentIndex` / `followUpIndex` / `status`），
消息落 `interview_messages`——**服务端无内存态，进程重启、换设备均可续面**。

```
interview.start   选题（按方向比例分配 allocateCounts，或按 scope 前缀匹配 sourceKey）
                  → 建场次 + LLM 生成第 1 题开场白（同事务写 session 与首条消息）
interview.reply   写考生消息 → followUpIndex < MAX_FOLLOW_UPS(4) ? LLM 追问
                  : 还有题 ? 换题（LLM 生成新题开场）: 结束 → finishSession
interview.finish  幂等：已 finished 直接返回报告
finishSession     按题分组聚合 GroupedTranscript → LLM 评估（evaluationJsonSchema 校验，
                  LLM 漏题按未作答兜底）→ renderReportMarkdown → 写回报告/等级/finishedAt
```

评估输出契约见 `packages/contracts`：`overallGrade A–D` + 每题 dimensions/diagnosis/
suggestion/answers（answers 与面试官每次提问一一对应）+ `weakDimensions`。
**M2 闭环已落地**（2026-09-10）：报告拆表到 `interview_reports`（`weak_points` =
C/D 维度题目 knowledge_points 并集，缺标签回落题目 tags），finishSession 按
knowledge_points/tags SQL 匹配 contents/problems 生成"薄弱点 → 学习章节/练习题"
链接写进报告（`renderReportMarkdown` 的 `recommendations` 参数），不调 LLM。

## 7. 关键实现：题库幂等入库（sourceKey + contentHash）

`question.bankImport` 路由方法（CLI `bank:import` 调用，原 server scripts
`import-aiinfra-bank.ts` 的逻辑）是全部"内容 → DB"同步的范本：

- **幂等键**：`sourceKey`（如 `bank:ai-infra-notes:aiinfra/daily/week3/...`，
  手工题 `manual:<uuid>`、种子题 `seed:<title>`）。
- **变更判定**：`contentHash` = sha256(title + content + followUps + keyPoints)，
  未变跳过、变了更新、源里消失标 `stale=1`（**不物理删除**，保护历史场次快照，
  source 加「[已失效]」前缀）。
- 批量 insert 按 100 条/批；导入前全量读出已有行建 `Map<sourceKey, row>`。

新产品的 `contents` / `problems` 表同步（content-kit 负责）沿用同一模式，
主键换成统一 ID（见 [content-kit](content-kit.md)）。

## 8. 配额中间件（计量先行，限额后置）

所有评测提交（`judge.submit`）与 LLM 面试（`interview.start`）先过配额中间件：

```ts
// 伪代码：tRPC middleware
const quota = await getUsageQuota(ctx.userId, kind);   // usage_quotas 表
if (quota.quota != null && quota.used >= quota.quota) {
  throw new TRPCError({ code: "FORBIDDEN", message: "配额已用完" });
}
await incrementUsed(ctx.userId, kind);                 // 计量先行：不限额也累加 used
```

- `quota` 为 NULL = 不限（**上线初期默认**，2026-09 决策）；后续仅改配置开启分层。
- 计量无论是否限额都执行——上线后即有用量数据支撑定价决策（05 开放问题 1）。
- 防滥用基础限流（并发上限、请求频率）独立于配额，始终生效。
- **配额中间件必须有测试**（计费相关，06 §7 的硬性要求）。

## 9. DB 迁移工作流

```bash
# 改 src/db/schema.ts 后：
pnpm --filter server db:generate   # drizzle-kit 生成迁移 SQL 到 src/db/migrations/
pnpm --filter server db:migrate    # 执行迁移（drizzle.config.ts 读 DATABASE_URL）
```

- 迁移文件**必须提交**；禁止 `db:push` 直接打到共享/生产环境。
- 本地从零起库可以直接 `db:push`（06 快速开始第 3 步），但不要对部署机用。
- 生产容器启动命令里含 `db:migrate`（沿用 interview Dockerfile 的 CMD 模式），
  升级即自动迁移——升级前先备份（见 [deployment](deployment.md)）。

## 10. 测试

- 样板：`routers/interview.test.ts`（状态机集成测试，MySQL 可用才跑，LLM 用
  `vi.stubGlobal("fetch", ...)` mock）、`judge/worker.test.ts`（队列领取/执行/写回 +
  端到端 AC/WA/CE + AC 联动 user_progress）、
  `routers/content|problem|progress|quota|auth.test.ts`（router 集成）。
- 评测核心纯函数测试在 `packages/judge-core`（签名解析/输出比对/终态映射/本机 exec e2e）；
  Docker 沙箱冒烟在 `apps/judge-worker`（独立测试库 `interview_test_jw`，与 server 的
  `interview_test` 隔离——`pnpm -r test` 并行时队列 FIFO 领取不互抢）。
- 新模块照此补：评测器与配额中间件必须有测试；auth 的验证码限流逻辑要有单测。
- 跑法：`pnpm --filter server test`（vitest）；全仓 `pnpm test`。

## 11. 环境变量

| 变量 | 现状/新增 | 说明 |
|---|---|---|
| `DATABASE_URL` | 已有 | 默认 `mysql://root:root@localhost:3306/interview` |
| `PORT` | 已有 | 默认 **3001**（web 的 vite proxy 也指向 3001） |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_VKEY` | 已有 | OpenAI 兼容端点；未配 key 时面试直接报错（纯 LLM 模式） |
| `LLM_MODEL` | 已有 | 通用模型；FOLLOWUP/EVAL 未配置时作为回落值 |
| `LLM_MODEL_FOLLOWUP` / `LLM_MODEL_EVAL` | 已落地 | 追问/评估分级，空则回落 `LLM_MODEL` |
| `SESSION_SECRET` | 新增 | session cookie 签名 |
| `SMTP_HOST/PORT/USER/PASS` | 新增 | 注册验证码邮件 |
| `QUOTA_DEFAULT_*` | 新增 | 配额默认值（空 = 不限） |
| `JUDGE_CONCURRENCY` | 已落地 | 评测队列并发上限（in-process worker 与独立 judge-worker 通用） |
| `JUDGE_INPROCESS_WORKER` | 已落地 | `false` 时禁用 server 内置 in-process worker——部署形态由独立 judge-worker（Docker 沙箱）接管执行，队列语义不变（2026-09-10 第七批） |
| ~~`LEETCODE_REPO_DIR`~~ | 已退役 | judge 数据源已切 `problems` 表（2026-09-10 第六批）：testcases/judge_meta 由 content-kit 解析入库，本地 leetcode 仓库不再被评测路径读取 |
