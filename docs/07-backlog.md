# 07 待办清单（Backlog）

> 2026-09-10 四路代码审计（server/web/docs 站/部署）后汇总的未完成事项。
> 对应路线图见 [05-roadmap.md](05-roadmap.md)，各模块规格见 [dev/](dev/) 目录。
> 状态约定：⬜ 未开始 / 🔶 部分完成待收尾 / ✅ 已完成。

## P0 — M2 收尾（应用融合缺口）

### Web 前端

- ✅ **Dashboard M2 扩展**（2026-09-10）：`/dashboard` 个人中心已落地（`apps/web/src/pages/dashboard/DashboardPage.tsx`）——学习路径进度条、刷题统计（AC 数/难度分布/连续天数，`progress.overview` 新增 `streakDays`）、掌握度雷达图（手写 SVG）+ 薄弱知识点信号列表、配额用量（`quota.me`）
- ✅ **面试报告薄弱点 → 学习/练习推荐链接**（2026-09-10 第四批，闭环最后一环）：`renderReportMarkdown` 新增 `recommendations` 参数，专项训练建议里渲染"薄弱点 → 学习章节/练习题"markdown 链接；web `Markdown.tsx` renderInline 支持链接渲染（站内路径当前页、外链新开），`ReportBody.tsx` 走既有 GenericCard 自动生效
- ✅ **主动路由守卫**（2026-09-10）：`components/RequireAuth.tsx` 包裹全部需登录路由，登录页对已登录用户跳回（含 `from` 回跳）
- ✅ **题单页**（2026-09-10 第五批）：`/problems/lists`（索引）+ `/problems/lists/:slug`（成员有序浏览 + AC 进度条 + 编排正文跳 docs）。数据链路：content-kit sync 新增 `lists.json`（解析题单正文「站内题解」链接 → 成员统一 ID 有序列表）→ `content:sync` upsert `problem_lists` 表（迁移 0007）→ `problem.lists/getList`；CLI `content:sync` 已接 lists.json。每日配套题单待 P2 补 related_problems 数据后由同链路接入
- ✅ **周赛页 + GPU 知识领域分组**（2026-09-10 第五批）：`/problems/contest`（20 场次新→旧聚合）+ `/problems/contest/:session`（Q1..Qn 序号徽标浏览）；GPU 分区 ProblemsPage 加 A–L 知识领域快捷 chips（`GPU_DOMAINS` 进 contracts，点击按领域知识点筛选，计数来自 facets）。ProblemsPage 题库/题单/周赛共用 `ProblemRow`（行内 AC 标记）
- ✅ **Problems 筛选未暴露全**（2026-09-10）：tag/knowledgePoint/judgeType 筛选已加（候选项来自新增 `problem.facets`）
- ✅ 顶栏品牌名（2026-09-10）：已改 AIInfra Lab（`Layout.tsx` + `index.html` 标题）
- ✅ `/learn/path`、`/dashboard` 独立路由（2026-09-10）：原 `/` 拆为 HomePage（门户首页，`/`）+ DashboardPage（个人中心，`/dashboard`）；`/learn` 与 `/learn/path` 均渲染 LearnPage
- ✅ **面试间内嵌评测器**（2026-09-10 第六批）：InterviewPage 代码作答面板升级——leetcode 同步题（`Question.judgeProblemId` 由 `judgeProblemIdFromSourceKey` 从 sourceKey 映射统一 ID）显示语言切换 + 「评测」按钮（入队 + 轮询 + `JudgeResultView` 内联结果），AC 自动联动 user_progress；无映射题（seed/manual/cuda）保持纯编辑器。评测结果卡片与 JudgePage 共用 `components/JudgeResult.tsx`（POLL_INTERVAL/isJudgeVerdict 收在 `lib/judge.ts`）

### Server

- ✅ **judge 队列化**（2026-09-10 第三批）：`judge.run` 同步裸跑已下线，改为 `judge.submit`（入队前快速校验 + insert submissions pending）+ `judge.getResult` 轮询；server 内置 in-process worker（`apps/server/src/judge/worker.ts`：轮询/FIFO 条件领取/执行/写回/崩溃恢复，`JUDGE_CONCURRENCY`）；迁移 0004 补 `ie` 终态 + `started_at` 列；web `JudgePage.tsx` 已改提交+轮询。**执行路径仍为本机 exec**（P1 Docker 沙箱接管前的过渡形态，dev/judge-worker.md §1 已注明）
- 🔶 **认证残留清理**：单用户自动 provision（`apps/server/src/auth.ts`、`trpc.ts` 两处 TODO 标注）；`adminProcedure` 对 email=NULL 遗留用户放行待收紧；遗留用户历史数据归属方案待定（注：封禁能力已就位——users.banned_at 迁移 0005 + 登录/enforceUser 双拦截，2026-09-10）
- ✅ **judge 数据源切换**（2026-09-10 第六批）：判题数据从 questions + `LEETCODE_REPO_DIR` 本地仓库迁到 problems 表——content-kit `judge-extract.ts` 构建期解析示例用例（`testcases`）与参考签名（`judge_meta`，迁移 0008）+ `judge_type` 按解析能力推导（4229 题中 3549 可站内评测）；`judge.getProblem/submit` 改统一 ID 入参，`LEETCODE_REPO_DIR` 已从 env/.env.example 移除，`repo_syncs` 表随 0008 删除（`src/sync/` 保留——实为 CLI bank 管线依赖：github.ts 拉仓库、index.ts contentHash，与判题无关， backlog 原表述有误）；`getResult` 读到 ac 顺手 upsert user_progress（mastered 不降级，非统一 ID 遗留行跳过）；web JudgePage 改 problemId + 题面跳 docs + internal 行/题库卡片评测入口；worker/judge 测试 fixture 改用 content 仓库副本
- ✅ **`interview_reports` 独立表**（2026-09-10 第四批）：迁移 0006 建表（`session_id` unique / `overall_grade` / `evaluated_by` / `report` / `weak_points` json）+ 存量 report 数据搬迁 + sessions 拆除 `report`/`evaluated_by` 两列、补 `scope_knowledge_points` 快照列（建场时题目知识点并集）；`interview.get` 返回 `report` 对象，web `ReportPage.tsx` / CLI 已跟进。`weak_points` 推导：C/D 维度题目 knowledge_points 并集，存量题无标签时回落题目 tags（P2 bank 管线补标签后自动切回受控词表）
- ✅ LLM 模型分级（2026-09-10）：`LLM_MODEL_FOLLOWUP`/`LLM_MODEL_EVAL` 已生效（发言类/评估类分模型，空值回落 `LLM_MODEL`），`.env.example` 注释同步
- ✅ 契约收编（2026-09-10）：judge/content/problem/search/interview/question/health 的局部 `z.object` 已全部进 `packages/contracts`（ID 参数/judgeRun/searchQuery 等 schema），`interview.stats` 的 GRADE_SCORES 重复定义一并清理
- ✅ router 测试：problem/progress/quota/content/auth（封禁）已补，judge worker 队列测试已补（submit→worker→getResult 端到端含 AC/WA/CE），测试 50 passed（2026-09-10）
- ✅ CLI（2026-09-10）：bin 名 `interview` → `ailab`；`user:list`/`user:ban --yes`/`user:unban`、`quota:get`/`quota:set <email> <kind> <n|unlimited>`、`db:backup`（mysqldump → deploy/backups/）已落地；server 侧配套 admin 端点（auth.userList/userSetBanned/userByEmail、quota.adminGet/adminSet）

## P1 — M3 主体（评测沙箱与部署，约 40%）

- ✅ **judge-worker 全部**（2026-09-10 第七批）：`packages/judge-core` 抽取评测核心（parse/driver/compare/verdict + 本机 exec run，server 与 worker 同源，比对规则两端一致）；`apps/judge-worker` 独立进程落地——轮询 submissions（领取语义与 in-process worker 一致）+ Docker-out-of-Docker 一次性容器（`deploy/images/algo`：debian + g++/python3，run.py 哑执行器 stdin/stdout 协议）+ 安全红线全落地（无网络/只读根 + tmpfs /work/资源与 pids 限额/超时强杀/输出截断/非 root 用户）+ 崩溃恢复与孤儿容器清理。真实 docker 冒烟全过：两数之和 AC（C++/Python）、WA、CE、死循环 TLE、无网络红线（DNS 必败）；队列端到端 + server API 全链路（submit → 独立 worker 容器执行 → getResult 读回 AC/TLE）。SQL 题评测未做（数据库题示例不可机器解析、无数据路径，M4 候选）
- ✅ **server 侧配套**（2026-09-10 第七批）：GPU/非 internal 题 `judge_type` 拒绝投递（第六批已在 getProblem/submit 入口）；本机 exec 路径下线经 `JUDGE_INPROCESS_WORKER=false` 门控（开发保留、部署关闭，队列语义不变）；worker 领取/回报不做内部 HTTP API——按 judge-worker.md §1/§6 设计直接读写 submissions 表（队列即表），原"内部 token 鉴权"方案作废
- ⬜ **deploy/ 全部**（只有占位 README）：六服务 `docker-compose.yml`、Caddyfile、四个应用 Dockerfile、`backup.sh`/`restore.sh`、`bootstrap.sh`、监控告警脚本。已有进展：algo 评测镜像 Dockerfile + run.py 已落地（`deploy/images/algo/`）、judge-worker 应用 Dockerfile 已就位
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
- drizzle migrations/meta 缺 `0002_snapshot.json`（0002 为手写数据迁移，不影响顺序，首次对真实 MySQL 执行 0003 前建议复核；0004/0005 由 drizzle-kit generate 产出、快照齐全）
- ~~密码哈希文档表述~~ → `dev/server.md` 已改为 scrypt（2026-09-10 修正，实现本就是 scrypt）

## 已完成基线（审计确认，供对照）

- M0：frontmatter 覆盖率近 100%（4490 条）、统一 ID 体系、lint 分级检查、content-kit sync 产物（contents/problems/search-index 三份 JSON）
- M1：三仓库内容快照（4042 题解 + 106 GPU 题 + 257 learn 篇）、docs 三分区 VitePress 站可构建（algo 4047 页分批构建产物在位）、组件全迁移
- M2 server：11 个 router、14 表 schema + 4 迁移、邮箱验证码注册全链路、配额计量挂接、CLI bank 管线收编、测试 27 passed
- M2 web：11 路由（原 6 页 + 登录/注册/Learn/Problems/Search）、Learn 进度格子、Problems 筛选分页 AC 标记、401 全局处理
- 2026-09-10 第二批（backlog P0 清理）：web 路由守卫 + `/dashboard` 个人中心（进度/刷题统计/掌握度雷达/配额）+ `/learn/path` 独立路由 + Problems 全量筛选 + 品牌名改 AIInfra Lab；server LLM 模型分级 + 契约全量收编 + `problem.facets`/`progress.overview.streakDays`；problem/progress/quota router 测试补齐（41 passed）
- 2026-09-10 第三批：judge 队列化（submit/getResult + in-process worker + 迁移 0004 + web 轮询）；CLI bin 改 `ailab` + user:list/ban/unban + quota:get/set + db:backup（server 侧 admin 端点 + users.banned_at 迁移 0005 + 封禁双拦截）；content router 测试补齐（50 passed）
- 2026-09-10 第四批：interview_reports 拆表（迁移 0006：建表 + 存量数据搬迁 + sessions 拆列补 scope 快照）+ 薄弱点 → 学习/练习推荐链接（contracts recommendations 参数 + server SQL 匹配 + web Markdown 链接渲染）；interview router 测试补齐（51 passed）
- 2026-09-10 第五批：题单 + 周赛 + GPU 领域分组（`problem_lists` 表迁移 0007、content-kit `lists.json` 产物、`problem.lists/getList/contestSessions/contestProblems` 四端点、web 四新路由 + ProblemRow 复用 + A–L 领域 chips）；vitest 关文件并行（content.import 全量 stale 标记曾交叉污染并行测试）；CLI content:sync 接 lists.json；测试 52 passed
- 2026-09-10 第六批：judge 数据源切换到 problems 表（content-kit judge-extract 解析 testcases/judge_meta + judge_type 推导、迁移 0008 加 judge_meta 列 + DROP repo_syncs、LEETCODE_REPO_DIR 退役、judge 三端点统一 ID 化、getResult AC 联动 user_progress）+ 面试间内嵌评测器（语言切换/评测/内联结果，JudgeResult 共享组件）；web JudgePage 重构（题面跳 docs）+ 题库/题单行评测入口；测试 53 passed（真实数据端到端：lc:0053 AC → user_progress ac → mastered 不降级）
- 2026-09-10 第七批：评测沙箱落地——`packages/judge-core` 抽取评测核心（server/judge-worker 同源）+ `apps/judge-worker` 独立进程（Docker-out-of-Docker 一次性容器、安全红线全量、崩溃恢复/孤儿容器清理）+ `deploy/images/algo` 镜像（run.py 哑执行器、stdin/stdout 协议、国内 APT 镜像源 ARG）+ server `JUDGE_INPROCESS_WORKER` 门控；测试 60 passed（judge-core 9 + worker 7 含真实 docker 冒烟 + server 44）；全链路真实验证：server API 提交 → 独立 worker 容器执行 → AC/TLE 写回读回
