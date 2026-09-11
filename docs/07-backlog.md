# 07 待办清单（Backlog）

> 2026-09-10 四路代码审计（server/web/docs 站/部署）后汇总的未完成事项。
> 对应路线图见 [05-roadmap.md](05-roadmap.md)，各模块规格见 [dev/](dev/) 目录。
> 状态约定：⬜ 未开始 / 🔶 部分完成待收尾 / ✅ 已完成。

## P0 — M2 收尾（应用融合缺口，2026-09-11 清零）

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
- ✅ **认证残留清理**（2026-09-11 第九批）：单用户自动 provision 整体删除（`createContext` 未登录即 null，`auth.ts` 的 provision 段换为 `getUserIdByEmail`/`generatePassword`）；`adminProcedure` 收紧为仅 `ADMIN_EMAILS` 命中（email=NULL 遗留用户不再天然 admin）；遗留数据归属方案落地为 **user:claim 认领**（`auth.userClaim` admin 端点 + CLI `user:claim <userId> <email> [-p]`：绑定邮箱 + 初始密码、历史面试/提交/进度原地保留、随机密码仅显示一次）；CLI 身份显式化——全局 `--user <email>`（根命令与全部子命令注入，preAction 落到 `AILAB_USER`）或直接设 `AILAB_USER`，未指定/不存在均报错退出；文档同步（server.md/cli.md/06 快速开始/.env.example 补 ADMIN_EMAILS/bootstrap 管理员引导）。测试 63 passed（server 44→47：admin 收紧 ×2 + userClaim 端到端），CLI 真实链路冒烟：无身份拒绝 → user:list → user:claim（历史 session 归属不变、重复认领拒绝）→ content:sync admin 通过/非 admin 拒绝
- ✅ **judge 数据源切换**（2026-09-10 第六批）：判题数据从 questions + `LEETCODE_REPO_DIR` 本地仓库迁到 problems 表——content-kit `judge-extract.ts` 构建期解析示例用例（`testcases`）与参考签名（`judge_meta`，迁移 0008）+ `judge_type` 按解析能力推导（4229 题中 3549 可站内评测）；`judge.getProblem/submit` 改统一 ID 入参，`LEETCODE_REPO_DIR` 已从 env/.env.example 移除，`repo_syncs` 表随 0008 删除（`src/sync/` 保留——实为 CLI bank 管线依赖：github.ts 拉仓库、index.ts contentHash，与判题无关， backlog 原表述有误）；`getResult` 读到 ac 顺手 upsert user_progress（mastered 不降级，非统一 ID 遗留行跳过）；web JudgePage 改 problemId + 题面跳 docs + internal 行/题库卡片评测入口；worker/judge 测试 fixture 改用 content 仓库副本
- ✅ **`interview_reports` 独立表**（2026-09-10 第四批）：迁移 0006 建表（`session_id` unique / `overall_grade` / `evaluated_by` / `report` / `weak_points` json）+ 存量 report 数据搬迁 + sessions 拆除 `report`/`evaluated_by` 两列、补 `scope_knowledge_points` 快照列（建场时题目知识点并集）；`interview.get` 返回 `report` 对象，web `ReportPage.tsx` / CLI 已跟进。`weak_points` 推导：C/D 维度题目 knowledge_points 并集，存量题无标签时回落题目 tags（P2 bank 管线补标签后自动切回受控词表）
- ✅ LLM 模型分级（2026-09-10）：`LLM_MODEL_FOLLOWUP`/`LLM_MODEL_EVAL` 已生效（发言类/评估类分模型，空值回落 `LLM_MODEL`），`.env.example` 注释同步
- ✅ 契约收编（2026-09-10）：judge/content/problem/search/interview/question/health 的局部 `z.object` 已全部进 `packages/contracts`（ID 参数/judgeRun/searchQuery 等 schema），`interview.stats` 的 GRADE_SCORES 重复定义一并清理
- ✅ router 测试：problem/progress/quota/content/auth（封禁）已补，judge worker 队列测试已补（submit→worker→getResult 端到端含 AC/WA/CE），测试 50 passed（2026-09-10）
- ✅ CLI（2026-09-10）：bin 名 `interview` → `ailab`；`user:list`/`user:ban --yes`/`user:unban`、`quota:get`/`quota:set <email> <kind> <n|unlimited>`、`db:backup`（mysqldump → deploy/backups/）已落地；server 侧配套 admin 端点（auth.userList/userSetBanned/userByEmail、quota.adminGet/adminSet）

## P1 — M3 主体（评测沙箱与部署，2026-09-11 清零）

- ✅ **judge-worker 全部**（2026-09-10 第七批）：`packages/judge-core` 抽取评测核心（parse/driver/compare/verdict + 本机 exec run，server 与 worker 同源，比对规则两端一致）；`apps/judge-worker` 独立进程落地——轮询 submissions（领取语义与 in-process worker 一致）+ Docker-out-of-Docker 一次性容器（`deploy/images/algo`：debian + g++/python3，run.py 哑执行器 stdin/stdout 协议）+ 安全红线全落地（无网络/只读根 + tmpfs /work/资源与 pids 限额/超时强杀/输出截断/非 root 用户）+ 崩溃恢复与孤儿容器清理。真实 docker 冒烟全过：两数之和 AC（C++/Python）、WA、CE、死循环 TLE、无网络红线（DNS 必败）；队列端到端 + server API 全链路（submit → 独立 worker 容器执行 → getResult 读回 AC/TLE）。SQL 题评测未做（数据库题示例不可机器解析、无数据路径，M4 候选）
- ✅ **server 侧配套**（2026-09-10 第七批）：GPU/非 internal 题 `judge_type` 拒绝投递（第六批已在 getProblem/submit 入口）；本机 exec 路径下线经 `JUDGE_INPROCESS_WORKER=false` 门控（开发保留、部署关闭，队列语义不变）；worker 领取/回报不做内部 HTTP API——按 judge-worker.md §1/§6 设计直接读写 submissions 表（队列即表），原"内部 token 鉴权"方案作废
- ✅ **deploy/ 全部**（2026-09-11 第八批）：六服务 `docker-compose.yml`（caddy/web/docs/server/judge-worker/mysql，DB 连接串由 `MYSQL_*` 组装、server healthcheck、MySQL 仅回环）、`Caddyfile`（docs/web/server 路由矩阵 + `/healthz` 公网探活）、四应用 Dockerfile（web/docs 多阶段 nginx、server 启动即迁移、judge-worker 取 `docker:29-cli` 静态 CLI 二进制——debian 源 docker.io API 1.41 被新 daemon 拒绝）、根 `.dockerignore`（排除模式一律锚定目录：`**/dist_*` 曾误伤题解插图 `dist_islands*.svg` 致 docs 构建 UNRESOLVED_IMPORT）、`bootstrap/backup/restore/monitor` 四脚本（凭据自动读根 .env、compose 插件/独立二进制自适应、备份保留 14 天/8 周）。全栈真实冒烟通过：起栈 → 容器内 content:sync（4490/4229/2）→ 直插 submissions 后独立 worker 容器拉起 algo 一次性容器评测 lc:0001 AC（3783ms）→ caddy 路由矩阵 200/404 正确（docs nginx `$uri.html` 回退对齐统一 ID 无后缀 URL）→ backup 672K → restore 演练抽查行数
- ✅ **CI 接线**（2026-09-11 第八批）：`.github/workflows/ci.yml`（build 排除 docs + web oxlint + content-kit sync 产物量级校验 + MySQL 服务容器双测试库迁移 + algo 镜像构建 + 60 测试）、`docs-build.yml`（learn/gpu/algo 4 批分区构建 + 页面量级校验，workflow_dispatch/周调度/路径触发，不阻塞 PR）。root `build` 排除 `@ailab/docs`（20 分钟全量构建分流到 docs-build）、`test` 前置 judge-core 构建（exports 已指向 dist，独立 runner 不构建会 MODULE_NOT_FOUND）、`packageManager` 固定 pnpm@11.18.0

## P2 — 内容侧收尾（2026-09-11 第十批主体清零）

- ✅ **正文改链**（2026-09-11 第十批）：`content-kit/scripts/fix-oldsite-links.ts` 落地——838 处旧站外链（learn 81 + gpu 2 + SKILL.md）→ 站内统一 ID 链接；形态决策按 vitepress link_open 实测：跨分区链接用原生 HTML `<a href="/problems/...">`（md 链接会被 joinPath 加 base），同分区写分区相对形态（`/week1/day1`）；含 leetgpu 旧 slug → 新目录 alias 表 ×7、day 笔记并入 day 页/exercise 回落周首页等归并规则；目标全部经 url 集校验（唯一命中才改写）。lint §13 旧站外链告警归零
- ✅ **关联字段回填**（2026-09-11 第十批）：backfill 扩展站内统一 URL 识别（md 链接 + HTML href 两形态 → url 集解析 → related 边），改链后跑回填：learn↔problem 边 682、358 文件写入——`learn/daily` 70 篇中 65 篇有 related_problems（5 篇正文无题链接的留空）、`cuda-interview-notes` 关联 86 道 GPU 题（backlog 的考点↔题号对照缺口）；related 对称性 lint 通过
- ✅ **learn 分区接共享 theme**（2026-09-11 第十批）：`learn/.vitepress/theme/index.ts`（ImageLightbox + katex + custom.css，三分区组件统一）
- ✅ **lint 补两项模板检查**（2026-09-11 第十批）：教学日 8 段骨架（day1-6，总结日跳过；暴露 9 篇真实缺段为告警，内容补写留后续迭代）、论文 17 节骨架（成文 9 篇全过）；lint 汇总新增 warnings 分类计数
- ✅ **论文骨架显式标注**（2026-09-11 第十批）：stats.ts 扫 `learn/paper/` 目录（有 README=成文 9，只有 PDF=骨架 16，`paper_skeleton_dirs` 显式列出）；docs papers 索引页同口径（🚧 + PDF 下载）；修复 PDF 从未进过 dist 的分发 bug（改走 `src/public/papers/`）与 learn 侧边栏骨架兼容
- ✅ **stats.json 接流程**（2026-09-11 第十批）：`sync` script 串联 stats（五份产物：contents/problems/lists/search-index/stats）
- ✅ **content-kit README 重写**（2026-09-11 第十批）：模块清单/命令/数据流/替代关系（原「待实现/目录占位」表述废弃）
- 🔶 content-kit 缺口：`skills/` 目录未建（SKILL.md 散落各内容分区，当前由 lint 模板检查器同源引用）、无 assets:optimize（SVGO 压缩，孤儿图片 1 张告警维持）；bank/ LLM 抽题管线已于第三批收编 CLI（`apps/cli/src/bank.ts`），本条原表述过时
- ✅ 怪文件清理（2026-09-11 第十批）：`learn/daily/plan/ SKILL.md`（前导空格）→ `course_review_prompt.md`（git mv，实为课程评审 prompt）
- ✅ `packages/content/README.md` 更新（2026-09-11 第十批）：图片「就地存放 + sync 分区重写」口径替换 assets/ 归并旧方案；红线补旧站外链禁令
- ⬜ GPU 旧编号 alias 表（#109/#110/#113/#114）未建，lint §9 告警级维持（ID 以目录序号为准已定案，alias 表意义为外部跳转兼容，优先级低）

## P3 — M3 增强与产品化（2026-09-11 第十一批主体落地）

- ✅ **GPU 题引流产品化**（2026-09-11 第十一批）：深链接数据核验（106/106 题均有 leetgpu.com externalUrl，content-kit 产物完整）；ProblemRow 按钮语境化——leetgpu 题显示「完成后标记」（title 提示"在 leetgpu.com 完成评测后，回站点此标记通过"），internal 题保持「标记 AC」；行内外站评测链接 + docs 题解跳转维持
- ✅ **SEO 冷启动**（2026-09-11 第十一批）：`apps/docs/scripts/gen-sitemap.mts`——content-kit contents.json url 集（4491 条，与 lint 同源）按渲染分区生成三份 sitemap.xml + robots.txt（`SITE_ORIGIN` 构建参数，缺省占位），挂进 build:learn/gpu/algo scripts 与 docs-build CI；web index.html 补 description meta + WebSite JSON-LD。结构化数据仅做门户级（题目级 JSON-LD 收益存疑，未铺开）
- ✅ **监控告警落地**（2026-09-11 第十一批，deployment.md §5 全表闭环）：LLM 打点（`llm-metrics.ts`：按天+模型分级聚合 calls/errors/token + 延迟环形 500 样本 p95，`chatCompletion` 埋点，`GET /metrics/llm` 输出）；Caddyfile 开 JSON 访问日志 + `/metrics/*` 路由；monitor.sh 六项检查（队列积压 / ie / 探活 / caddy 近 10min 5xx>50 / LLM 日 token 超预算与 p95>60s / 用户用量突增 10 倍——usage_quotas 今日 vs 昨日）。compose 栈端到端验证：正常路径 OK、5xx 阈值告警触发、突增用户检出（#2 judge 50 vs 3）、评测 ce 判定复验
- ⬜ 限流内存实现 → Redis：**有意不做**（2026-09-11 决策）——当前单实例部署，进程内滑动窗口功能完整（重启清零只影响验证码限流窗口，可接受）；多副本部署需求出现时再引入（届时抽象 RateLimiter 接口 + Redis lua 滑动窗口，`rate-limit.ts` 头注释已注明）
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
- 2026-09-11 第八批：P1 清零——deploy/ 全栈落地（compose/Caddyfile/四 Dockerfile/四运维脚本/.dockerignore）+ CI 接线（ci + docs-build 双 workflow）；修复在途问题：judge-worker 容器 docker CLI 过旧（换 docker:29-cli 静态二进制）、`CMD ["tsx"]` PATH 不含 .bin、compose depends_on 重复项、restore.sh 参数截断与 `rows` 保留字、`.dockerignore **/dist_*` 误伤内容插图、docs nginx 缺 `$uri.html` 回退（统一 ID 无后缀 URL 404）；judge-core exports 切 dist（server/worker test 脚本前置构建，root dev/test 同步加守卫，06 快速开始补说明）；全栈 compose 冒烟 + 评测端到端 AC + backup/restore 演练通过；测试 60 passed（build/test 全绿）
- 2026-09-11 第九批：P0 清零——认证残留清理（自动 provision 删除、adminProcedure 仅认 ADMIN_EMAILS、user:claim 认领遗留数据、CLI `--user`/`AILAB_USER` 显式身份、bootstrap 管理员引导、06/cli/server 文档与 .env.example 同步）；测试 63 passed（server +3：admin 收紧 ×2 + userClaim），CLI 真实链路冒烟全过
- 2026-09-11 第十批：P2 主体清零——正文改链（fix-oldsite-links：838 处旧站外链 → 站内统一 ID 链接，跨分区 HTML/同分区 md 形态决策 + leetgpu alias 表，旧外链 lint 归零）+ related 回填（backfill 扩展站内 URL/HTML href 识别，682 边、358 文件，cuda-interview-notes 86 题关联）+ lint 增强（站内 URL url 集校验、教学日 8 段/论文 17 节骨架检查、warnings 分类汇总）+ 论文骨架显式口径（stats 扫目录 9/16 + papers 索引页 + PDF public 分发修复）+ learn theme 接入 + stats 接 sync + README ×2 重写 + 怪文件收编；learn/gpu 分区真实构建通过（跨分区链接根绝对渲染正确）；lint error 0；测试 63 passed
- 2026-09-11 第十一批：P3 主体落地——监控告警全表闭环（LLM 打点 + /metrics/llm + Caddy JSON 日志 + monitor.sh 六项检查，compose 栈端到端验证告警触发）+ SEO 冷启动（三分区 sitemap.xml/robots.txt 生成挂进构建，web JSON-LD）+ GPU 引流语境化（externalUrl 106/106 完整、完成后标记按钮）；限流 Redis 经评估有意不做（单实例内存实现够用，决策记录在案）；测试 65 passed（server +2 llm-metrics）
