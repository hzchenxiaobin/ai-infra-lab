# database — 数据库开发指南

> MySQL 8 + Drizzle ORM。schema 单一事实来源是 `apps/server/src/db/schema.ts`，
> 设计依据见 [03 数据模型](../03-data-model.md#数据库设计)。**内容正文不入库**
> （Git 是唯一事实来源），DB 只存元数据 / 索引 / 用户数据（02 关键取舍）。

## 1. 总览

```
账号域        users · oauth_identities · email_verifications
配额域        usage_quotas
内容元数据域   contents · problems · knowledge_points
用户数据域     user_progress · submissions
面试域        questions · interview_sessions · interview_messages · interview_reports · interview_notes
```

迁移工作流（改 schema 必走）见 [server §9](server.md#9-db-迁移工作流)；
备份见 [deployment](deployment.md#4-mysql-备份)。

## 2. 表说明

### 2.1 账号域（M2 新增/扩展）

| 表 | 列（要点） | 说明 |
|---|---|---|
| `users` | `id` PK, `email` UNIQUE, `password_hash`, `email_verified`, `name`, `avatar`, `tier(free/pro)`, `created_at` | 正式账号体系，**替代 interview 的单用户自动 provision**（现状 users 只有 id/name/created_at，M2 扩展列并删 `auth.ts` 的 provision 逻辑） |
| `oauth_identities` | `provider`, `provider_account_id`, `user_id` FK | OAuth 预留（GitHub/Google），M2 只建表不接登录链路 |
| `email_verifications` | `email`, `code_hash`, `expires_at`, `attempts`, `created_at` | 注册验证码；`attempts` 记失败次数；发送限流以它为依据（IP 维度另计），**开放注册的唯一闸门** |

### 2.2 配额域（M3 新增）

| 表 | 列 | 说明 |
|---|---|---|
| `usage_quotas` | `user_id`, `kind(judge/interview)`, `period`, `used`, `quota` | `quota` 为 **NULL 表示不限**（上线初期默认，2026-09 决策）；`used` 无论是否限额都累加（计量先行）。UNIQUE(user_id, kind, period) |

### 2.3 内容元数据域（M1 新增）

| 表 | 列 | 说明 |
|---|---|---|
| `contents` | `id`(统一 ID, PK varchar), `type`, `title`, `tags`(json), `knowledge_points`(json), `url`(docs 站路径), `content_hash`, `status(active/stale)`, `updated_at` | 构建期从 frontmatter 同步（content-kit），contentHash 幂等 upsert，失效标 stale 不物理删除 |
| `problems` | `id`(PK, FK→contents), `source(leetcode/leetgpu/contest)`, `number`, `difficulty`, `languages`(json), `judge_type(internal/leetgpu-com/none)`, `testcases`(json), `judge_meta`(json), `external_url` | contents 的 problem 子集单列，带评测字段；`testcases`/`judge_meta` 由 content-kit 从题解机器解析（2026-09-10 judge 数据源切换），`judge_type` 按解析能力推导（leetgpu-com 显式保留）；GPU 题 `external_url` 跳 leetgpu.com |
| `knowledge_points` | `id`(slug, PK), `name`, `category(gpu/algo/system/cpp/...)`, `description` | 知识点受控词表，闭环的公共坐标系；content-kit lint 校验 frontmatter 标签必须命中词表 |
| `problem_lists` | `id`(题单统一 ID `lc:list:{slug}`, PK), `title`, `url`, `problem_ids`(json 有序), `content_hash`, `updated_at` | 题单（hot-interview / 10 周计划）：成员由 content-kit sync 解析正文题解链接产出，随 content.import upsert；已落地（迁移 0007，2026-09-10） |

### 2.4 用户数据域（M2 新增）

| 表 | 列 | 说明 |
|---|---|---|
| `user_progress` | `user_id`, `content_id`, `status(unseen/seen/mastered/ac)`, `score`, `last_at`, UNIQUE(user_id, content_id) | 学习/刷题进度，每用户 × 每内容一行；GPU 题手动标记完成也写这里 |
| `submissions` | `id`, `user_id`, `problem_id`, `language`, `code`, `status(pending/running/ac/wa/ce/tle/mle)`, `verdict_detail`(json), `runtime_ms`, `memory_kb`, `created_at` | **兼作 judge-worker 的任务队列**（02 已决策，初期不上 MQ）；状态机与领取方式见 [judge-worker](judge-worker.md#6-队列与状态机细节) |

### 2.5 面试域（已有，扩展列）

| 表 | 现状（interview schema.ts） | 扩展 |
|---|---|---|
| `questions` | `id`, `user_id`, `category(leetcode/cuda/knowledge)`, `title`, `content`, `difficulty`, `tags`, `follow_ups`(json), `key_points`, `source`, `source_key`, `content_hash`, `stale`, 时间戳 | 补 `knowledge_points` 列（json）；729 题经 `cli bank:import` 入库 |
| `interview_sessions` | `id`, `user_id`, `title`, `categories`(json), `question_ids`(json), `current_index`, `follow_up_index`, `status(active/finished)`, `overall_grade`, `scope_knowledge_points`(json，建场时题目知识点并集快照), 时间戳 | `report`/`evaluated_by` 已拆到 interview_reports（迁移 0006，2026-09-10）；状态机字段说明见 [server §6](server.md#6-关键实现面试状态机断点续面) |
| `interview_messages` | `id`, `session_id`, `question_id`(可空), `role(interviewer/candidate/system)`, `content`, `created_at` | 不变 |
| `interview_reports` | `id`, `session_id`(unique), `user_id`, `overall_grade`, `evaluated_by`, `report`(text), `weak_points`(json), `created_at` | 已落地（迁移 0006）：报告自 sessions 拆出，`weak_points` 为 C/D 维度题目 knowledge_points 并集（缺标签回落题目 tags），驱动"报告 → 学习章节/练习题"推荐 |
| `interview_notes` | `id`, `user_id`, `title`, `content`(text, markdown), 时间戳 | 复盘笔记（迁移 0011）：面试板块「复盘笔记」页，用户以 markdown 记录每次面试过程，仅本人可见 |

`repo_syncs`（GitHub 同步记录）已随迁移 0008 删除（2026-09-10，judge 数据源切换，
无写入方）。`src/sync/` 模块保留——它服务 CLI bank 管线（github.ts 拉仓库、
index.ts 的 contentHash 幂等键），与判题数据源无关。

## 3. 掌握度模型（SQL 实现）

v1 刻意从简（03）：每个 (user, knowledge_point) 的掌握度三路加权——

```
mastery = 0.2 × 学习信号（相关 learn 内容 seen/mastered 比例）
        + 0.5 × 刷题信号（相关题目 AC 比例，按难度加权 hard=3/medium=2/easy=1）
        + 0.3 × 面试信号（相关面试题最近得分归一化）
```

用 SQL 聚合实现（`user_progress` ⋈ `contents` ⋈ `knowledge_points` +
`interview_reports` 的 weak_points 映射），不引入独立推荐服务；消费方是
progress router（Dashboard 雷达图）与报告推荐。

## 4. drizzle-kit 命令

```bash
pnpm --filter server db:generate   # 改 schema.ts 后生成迁移（提交迁移文件）
pnpm --filter server db:migrate    # 执行迁移（读 DATABASE_URL）
pnpm --filter server db:push       # 仅本地从零起库用；禁止打共享/生产环境
pnpm cli db:backup                 # mysqldump 备份（见 deployment）
```

`drizzle.config.ts`（拷自 interview）：`dialect: mysql`，schema 指向
`./src/db/schema.ts`，迁移输出 `./src/db/migrations`，连接串读 `DATABASE_URL`
（默认 `mysql://root:root@localhost:3306/interview`）。

约定：

- 表/列命名 snake_case，TS 侧 camelCase（drizzle 映射）；枚举用 `mysqlEnum`，
  取值集合同时进 `packages/contracts`（两端共享）。
- json 列用 `$type<T>()` 标注类型（现有 `follow_ups`/`question_ids` 的模式）。
- 所有用户数据表带 `user_id`；查询一律 `and(eq(...), eq(table.userId, ctx.userId))`
  逐用户隔离（02 §6 授权与隔离）。
- `serial` PK（bigint auto_increment）沿用；统一 ID 类主键用 varchar PK。

## 5. 备份

- MySQL 数据在 compose 命名卷；`cli db:backup` 调 mysqldump 输出到
  `deploy/backups/`，部署机上由 cron 每日跑，保留策略与恢复演练见
  [deployment](deployment.md#4-mysql-备份)。
- 内容无需备份（Git 即备份）；需要备份的只有 DB。
- **升级先备份**：compose 升级前跑一次 `db:backup`（生产容器启动命令内含
  `db:migrate`，升级即迁移，回滚依赖备份）。
