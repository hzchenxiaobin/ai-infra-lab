# 07 待办清单（Backlog）

> 2026-09-10 四路代码审计（server/web/docs 站/部署）后汇总的未完成事项。
> 对应路线图见 [05-roadmap.md](05-roadmap.md)，各模块规格见 [dev/](dev/) 目录。
> 状态约定：⬜ 未开始 / 🔶 部分完成待收尾。

## P0 — M2 收尾（应用融合缺口）

### Web 前端

- ⬜ **Dashboard M2 扩展**：server `progress.overview`（`apps/server/src/routers/progress.ts`）数据已就绪但前端零调用。补：学习路径进度条、刷题统计（AC 数/难度分布/连续天数）、掌握度雷达图（SVG 手写，不引图表库）、配额用量（`quota.me` 也已就绪未用）。落点：`apps/web/src/pages/DashboardPage.tsx`
- ⬜ **面试报告薄弱点 → 学习/练习推荐链接**（闭环最后一环）：后端 `renderReportMarkdown`（`packages/contracts/src/index.ts`）目前只把 weakDimensions 渲成纯文本；需输出带链接的结构，web `ReportBody.tsx` 配合链接化。依赖 P1 的 `interview_reports` 拆表 + weak_points→knowledge_points 映射
- ⬜ **主动路由守卫**：App.tsx 无 RequireAuth，目前靠"authedProcedure 401 → 全局跳登录"被动兜底，页面会先闪空态；登录页也无"已登录跳回首页"
- ⬜ **题单页** `/problems/lists/:slug`（hot-interview、10 周计划、每日配套题单）：前后端均无，需新增 router
- ⬜ **周赛页** `/problems/contest`、**GPU 知识领域 A–H 分组**（ProblemsPage 目前无分组视图）
- 🔶 **Problems 筛选未暴露全**：contracts `problemFilterSchema` 支持 tag/knowledgePoint/judgeType，前端只做了难度/AC/搜索
- ⬜ 顶栏品牌名仍是"模拟面试 Mock Interview"（`apps/web/src/components/Layout.tsx`），未改 AIInfra Lab
- ⬜ `/learn/path`、`/dashboard` 独立路由（设计信息架构中有，目前 LearnPage 与 `/` 兼职）
- ⬜ 面试间内嵌评测器（现在只跳独立 `/judge/:id` 页）

### Server

- 🔶 **judge 队列化**：`judge.run` 仍是 `execFileSync` 本机同步裸跑（`apps/server/src/judge/run.ts`），`submissions` 表无写入路径。需改为：submit → insert pending → worker 异步执行 → `judge.getResult` 轮询（web 端 `JudgePage.tsx` 同步改轮询）
- 🔶 **认证残留清理**：单用户自动 provision（`apps/server/src/auth.ts`、`trpc.ts` 两处 TODO 标注）；`adminProcedure` 对 email=NULL 遗留用户放行待收紧；遗留用户历史数据归属方案待定
- ⬜ **judge 数据源切换**：从 `LEETCODE_REPO_DIR` 读题解改为 `problems.testcases` 入库（字段已建未用），`LEETCODE_REPO_DIR` 与 `src/sync/` 模块、`repo_syncs` 表随迁移退役
- ⬜ `interview_reports` 独立表（报告现在是 `interview_sessions.report` text 字段）+ `interview_sessions` 补 scope 快照关联 knowledge_points 列
- 🔶 LLM 模型分级未实现：现状单一 `LLM_MODEL`，`LLM_MODEL_FOLLOWUP/EVAL` 拆分未做（`.env.example` 已占位）
- 🔶 契约收编：judge/content/problem/search/interview 等 router 仍有局部 `z.object`，未全部进 `packages/contracts`
- ⬜ content/problem/progress/quota router 无测试
- ⬜ CLI bin 名仍为 `interview`（可改 ailab）；缺 `user:list`/`user:ban`（M2）、`quota:get/set`（M3）、`db:backup`

## P1 — M3 主体（评测沙箱与部署，约 0%）

- ⬜ **judge-worker 全部**：`apps/judge-worker/` 只有占位 README。对照 `docs/dev/judge-worker.md`：主循环、队列原子领取（submissions 表缺 `ie` 终态值和 `started_at` 列，需补迁移）、Docker-out-of-Docker 拉起一次性容器、algo 镜像（g++/python3/SQLite）、资源限额与安全红线（无网络/只读/超时强杀/输出截断）、SQL 题评测、崩溃恢复。评测核心从 `apps/server/src/judge/` 抽 `packages/judge-core/` 共享
- ⬜ **server 侧配套**：worker 领取/回报内部 API（内部 token 鉴权）、GPU 题 `judge_type` 拒绝投递队列、本机 exec 路径下线
- ⬜ **deploy/ 全部**（只有占位 README）：六服务 `docker-compose.yml`、Caddyfile、四个应用 Dockerfile、algo 评测镜像 Dockerfile、`backup.sh`/`restore.sh`、`bootstrap.sh`、监控告警脚本
- ⬜ **CI 接线**：无 `.github/workflows/`——lint 必跑、algo 4 批构建、sync 产物校验、测试

## P2 — 内容侧收尾

- 🔶 **正文改链（去重矩阵只做了半边）**：838 处指向旧站 `hzchenxiaobin.github.io` 的硬编码外链，分布在 83 个 md（learn 81 个、problems-gpu 2 个），需改为统一 ID 链接。`content-kit/scripts/fix-links.ts` 目前不处理旧站绝对 URL，需扩展
- 🔶 **关联字段留空**：`learn/daily` 53 篇 `related_problems: []`；topics 与 problems 侧 `related_learn` 基本全空；`cuda-interview-notes.md` 的考点↔题号对照未进 knowledge_points/related
- 🔶 **learn 分区未接共享 theme**：`apps/docs/learn/.vitepress/` 只有 config.mts，缺 theme/index.ts（ImageLightbox/custom.css 未接入）
- 🔶 **lint 缺两项模板检查**：每日教程 8 段骨架、论文 17 节骨架（目前只有 GPU 6 段式）
- ⬜ 论文骨架显式标注 `status: skeleton`（26 个目录中 17 篇只有 PDF 无 README，目前靠隐式表达）
- ⬜ `stats.json` 未产出（stats.ts 声明了但脚本未跑/未接流程）
- ⬜ **content-kit README 误导**：仍写"待实现/目录占位"，实际 src 已 2400+ 行全实现——需重写
- ⬜ content-kit 缺口：`skills/` 目录未建（SKILL.md 散落各内容分区）、bank/ LLM 抽题管线未拷入、无 assets:optimize（SVGO）
- ⬜ 怪文件清理：`learn/daily/plan/ SKILL.md`（文件名带前导空格）
- ⬜ `packages/content/README.md` 仍写 assets/ 归并旧方案，与"图片就地存放"的 2026-09 修正不一致
- ⬜ GPU 旧编号 alias 表（#109/#110/#113/#114）未建，lint 只报告警

## P3 — M3 增强与产品化

- ⬜ GPU 题引流产品化细化：深链接、回站一键标记完成（web 已有基础跳转按钮）
- ⬜ 限流内存实现 → Redis（`apps/server/src/rate-limit.ts` TODO）
- ⬜ SEO 冷启动（sitemap、结构化数据）
- ⬜ 监控告警落地：评测队列积压、LLM 成本/延迟、构建时长、5xx
- ⬜ M4 候选项：论文精读补完（9/27）、商业化分层、社区功能

## 待核实

- 04 去重矩阵提到的 `topics/cuda`（LeetGPU 43 题对照）在新旧仓库均不存在；专题实际 17 个而非文档所述 18 个——需确认该对照表是否本就不在 topics/cuda，并修正 04 文档
- drizzle migrations/meta 缺 `0002_snapshot.json`（0002 为手写数据迁移，不影响顺序，首次对真实 MySQL 执行 0003 前建议复核）
- 密码哈希实现用 scrypt，`dev/server.md` 写 argon2/bcrypt——实现 OK，需修正文档表述

## 已完成基线（审计确认，供对照）

- M0：frontmatter 覆盖率近 100%（4490 条）、统一 ID 体系、lint 分级检查、content-kit sync 产物（contents/problems/search-index 三份 JSON）
- M1：三仓库内容快照（4042 题解 + 106 GPU 题 + 257 learn 篇）、docs 三分区 VitePress 站可构建（algo 4047 页分批构建产物在位）、组件全迁移
- M2 server：11 个 router、14 表 schema + 4 迁移、邮箱验证码注册全链路、配额计量挂接、CLI bank 管线收编、测试 27 passed
- M2 web：11 路由（原 6 页 + 登录/注册/Learn/Problems/Search）、Learn 进度格子、Problems 筛选分页 AC 标记、401 全局处理
