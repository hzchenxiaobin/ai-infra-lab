# cli — 管理 CLI 开发指南

> `apps/cli`：commander + tsx 的管理/交互 CLI，经 `appRouter.createCaller()` **直调
> 后端代码，不走 HTTP**。以 `interview/apps/cli` 原样拷入起步。定位：新管理操作
> 优先进 CLI，而不是做管理页面（06 已决策）。

## 1. 目录结构

```
apps/cli/
├── bin/ailab.mjs           # bin 入口：tsx/esm 的 tsImport 直接跑 TS 源码，免构建
├── src/
│   ├── index.ts            # commander 命令注册（全部命令集中此处）
│   ├── session.ts          # getCaller() + 交互式面试会话循环
│   └── ui.ts               # 终端输出助手（banner/表格/着色）
└── package.json            # @ailab/cli，bin 名 ailab
```

依赖关键点：`@ailab/server` 与 `@ailab/contracts` 都是 `workspace:*`——
CLI 与 server 同进程模型共享 router 与 schema；根 `package.json` 用
`"dependencies": { "@ailab/cli": "link:apps/cli" }` 把 bin（`ailab`，经
`apps/cli/bin/ailab.mjs` 以 tsx 直跑 TS 源）链接到仓库根。

## 2. createCaller 模式

`src/session.ts` 的核心（身份显式化，2026-09-11 收紧后形态）：

```ts
import { appRouter, type AppRouter } from "@ailab/server/router";
import { getUserIdByEmail } from "@ailab/server/auth";

export async function getCaller() {
  const email = process.env.AILAB_USER?.trim();   // --user 或环境变量
  if (!email) /* 报错退出：未指定操作身份 */;
  const userId = await getUserIdByEmail(email);   // 按 email 查 users 表
  if (userId == null) /* 报错退出：用户不存在 */;
  return appRouter.createCaller({ userId });      // Context 与 HTTP 请求同构
}
```

- 身份来源：全局 `--user <email>`（`ailab --user x@y start` 与 `ailab start --user x@y`
  均可，index.ts 在 `program.parse()` 前给根命令与全部子命令统一注入该 option，
  `preAction` 钩子落到 `AILAB_USER`）或直接设 `AILAB_USER` 环境变量。
- caller 的 Context 与 server HTTP 链路的 Context **同构**，因此 CLI 天然复用所有
  router 的鉴权与业务逻辑——这也是"管理操作优先进 CLI"成立的原因。
- 管理命令（`content:sync` / `user:*` / `quota:*`）走 `adminProcedure`：
  `--user` 的邮箱必须在服务端 `ADMIN_EMAILS` 中（能登录部署机 + 邮箱白名单双背书）。
- 环境变量（DATABASE_URL、LLM_*）由 server 的 `env.ts` 统一加载仓库根 `.env`，
  CLI 不单独读环境。

## 3. 命令清单

### 已有（拷入即得）

| 命令 | 说明 |
|---|---|
| `cli start [-c cats] [-s scope] [-n count]` | 开始面试；无参数进交互式选题（方向/按周/按专题） |
| `cli resume <sessionId>` | 继续未完成的面试（断点续面） |
| `cli list` | 历史场次表格 |
| `cli report <sessionId>` | 打印评估报告 Markdown |
| `cli stats` | 题库统计 + 面试统计 |
| `cli scopes` | 可选考察范围（按周/天/专题，含题数） |
| `cli seed` | 播种内置 15 题（幂等，`seed:<title>` sourceKey） |
| `cli questions [-c cat] [-s kw] [-p page]` | 题库分页列表 |

面试会话内命令：空行提交回答、`:end` 提前结束并生成报告、`:quit` 退出保存进度。

### bank 管线（已收编，apps/cli/src/bank.ts）

已按 06 的映射计划从 server scripts 收编为 CLI 子命令（数据文件在
`apps/cli/data/`，server 侧入库入口为 `question.bankImport` 路由方法）：

| 命令 | 说明 |
|---|---|
| `cli bank:generate <dir>` | LLM 从内容目录抽面试题 → 静态 JSON（断点续跑：`.bank-checkpoint.jsonl`，完成一个文件追加一行；CONCURRENCY 3、超时 300s、max_tokens 16384） |
| `cli bank:import <json>` | 题库 JSON 幂等入库（sourceKey + contentHash upsert，源消失标 stale，见 [server](server.md#7-关键实现题库幂等入库sourcekey--contenthash)） |

### 新增（随模块落地）

| 命令 | 说明 |
|---|---|
| `cli content:sync` | 触发 content-kit 同步：frontmatter → contents/problems/problem_lists 幂等 upsert（读 dist 三份 JSON，含题单 lists.json） |
| `cli user:list [-s kw]` / `user:ban <email> --yes` / `user:unban <email>` | 用户管理（已落地；ban 打印影响范围并要求 `--yes`，封禁即登录与既有会话失效） |
| `cli user:claim <userId> <email> [-p <pw>]` | 认领遗留用户（email 为空的单用户时代数据）：绑定邮箱 + 初始密码，历史面试/提交/进度原地保留；`-p` 缺省生成随机密码仅显示一次（已落地，2026-09-11） |
| `cli quota:get <email>` / `quota:set <email> <kind> <n\|unlimited>` | 查看/调整用户当前周期配额（已落地） |
| `cli db:backup [-o dir]` | mysqldump 到 `deploy/backups/`（已落地，见 [deployment](deployment.md)） |

## 4. 用法示例

```bash
# 初始化一套新环境（身份显式化：所有命令都接受 --user，或设 AILAB_USER）
pnpm --filter @ailab/server db:migrate
pnpm --filter @ailab/content-kit sync
node apps/cli/bin/ailab.mjs --user ops@example.com content:sync
node apps/cli/bin/ailab.mjs --user ops@example.com seed

# 认领 interview 单机版时代的遗留数据（user:list 找到 email 为空的行）
node apps/cli/bin/ailab.mjs --user ops@example.com user:claim 3 alice@example.com

# 按 week3 考察范围开一场 5 题面试
node apps/cli/bin/ailab.mjs --user alice@example.com start -s "ai-infra-notes:aiinfra/daily/week3/" -n 5

# 中断后继续 / 看报告
node apps/cli/bin/ailab.mjs --user alice@example.com resume 12
node apps/cli/bin/ailab.mjs --user alice@example.com report 12

# 上线后运营操作
node apps/cli/bin/ailab.mjs --user ops@example.com quota:set alice@example.com interview 10
node apps/cli/bin/ailab.mjs --user ops@example.com content:sync
```

## 5. 新管理操作的添加方式

1. **先加 router 方法**：在 `apps/server/src/routers/` 对应模块加
   `authedProcedure`（管理类操作挂到既有 router 即可，不为 CLI 单开 router）；
   输入 schema 加进 `packages/contracts`。
2. **再加 CLI 命令**：`src/index.ts` 里 `program.command(...)`，action 里
   `const caller = await getCaller(); await caller.<router>.<method>(...)`；
   输出用 `ui.ts` 的 `tableRow/successLine/errorLine`，保持既有终端风格。
3. 参数解析失败、后端抛错一律 `errorLine((err as Error).message)` + `process.exit(1)`。
4. 交互式输入（readline）只用于面试会话这类强交互场景；管理命令一律参数化，
   便于脚本化与 CI 调用。

## 6. 注意事项

- CLI 与 server 共用代码意味着 **CLI 跑的即是生产逻辑**，破坏性命令（如未来的
  `user:ban`、数据清理）必须打印影响范围并要求 `--yes` 显式确认。
- `bin/interview.mjs` 用 tsx 运行时加载 TS，**无构建产物**；不要把编译后的 dist
  当 bin 入口，避免与 server 源码版本漂移。
- LLM 相关命令（`bank:generate`）是离线批处理，耗时长；断点续跑文件不要提交 Git
  （`.bank-checkpoint.jsonl` 加 `.gitignore`）。
