# 02 技术架构

## 融合策略

两个候选路线：

| 路线 | 做法 | 评价 |
|---|---|---|
| A. 门户聚合 | 四个仓库保持独立，加一个门户站互链 | 成本低但痛点全保留：进度不通、搜索不通、重复内容照旧。只配当过渡态 |
| B. 单一产品（推荐） | 一个 monorepo，内容统一入库，一个 Web 应用承载全部功能 | 一次性投入大，但闭环功能（进度、掌握度、推荐、统一搜索）只有这条路能实现 |

**推荐路线 B，分阶段落地**（详细排期见 05-roadmap）：

> 边界约束（2026-09 决策）：新产品为**独立新仓库**，不依赖、不改动四个原仓库；
> 内容与代码一律以一次性快照拷入，原仓库继续独立演进。

1. **M0/M1 先数据打通**：新仓库内搭骨架、拷内容，落地统一元数据规范 + 统一题目 ID + 内容管线。
2. **M2/M3 再应用融合**：interview 应用代码拷入新仓库作为交互底座，扩展出全部功能；内容站最后收编。

## 目标 monorepo 结构

沿用 interview 已有的 pnpm workspace 模式扩展：

```
product-repo/
├── apps/
│   ├── web/            # 门户 Web 应用（React 19 + Vite + Tailwind）
│   │                   #   在 interview/apps/web 基础上新增 Learn/Problems/Dashboard 页面
│   ├── server/         # API 服务（Hono + tRPC + Drizzle + MySQL）
│   │                   #   在 interview/apps/server 基础上新增 content/progress/judge 路由
│   ├── docs/           # 静态内容站（VitePress）——学习与题解正文渲染
│   ├── cli/            # 管理 CLI（沿用 interview CLI：seed/题库导入/内容同步）
│   └── judge-worker/   # 评测沙箱服务（新增，见下文"评测沙箱"）
├── packages/
│   ├── contracts/      # zod 共享 schema（沿用 interview/packages/contracts）
│   ├── content/        # 统一内容库：全部 Markdown + frontmatter（见 03 数据模型）
│   │   ├── learn/      #   ← ai-infra-notes 的 daily/topics/paper/profiling
│   │   ├── problems-gpu/   # ← leetgpu solutions
│   │   └── problems-algo/  # ← leetcode solution/contest/topics
│   └── content-kit/    # 内容管线：frontmatter 解析校验、ID 分配、索引导出、
│                       #   题库同步（LLM 抽取）、构建期 lint（吸收 build/check_course.py 等）
└── deploy/             # docker-compose、反向代理、CI 配置
```

关键取舍：**学习内容正文不搬进数据库**。Markdown 仍是内容的编辑形态（保留 Git 工作流 + AI 产题管线），数据库只存元数据、索引、用户数据；docs 站负责渲染正文，web 应用通过链接与嵌入卡片引用内容页。这样避免把 4000+ 篇文档塞进动态渲染链路，也保留了三个内容仓库成熟的构建经验。

## 技术选型决策

### 1. 内容站：保留 VitePress，解决大规模构建问题

leetcode 站 4100+ 页面已 OOM（6GB 堆 + 4 批并行 + 关搜索）。融合后页面更多，必须解决：

| 方案 | 说明 | 结论 |
|---|---|---|
| 分区独立构建 | docs 按 learn / problems-gpu / problems-algo 拆成 3 个 VitePress 子站，各自构建、统一部署 | **推荐（M2 落地）**：每区规模可控（最大 4000 页，沿用已有分批构建经验），构建互不影响 |
| 换框架（Next.js/Nuxt SSG） | 重构内容渲染层 | 成本高：三个站的自定义组件、KaTeX、图片查看器、上一题/下一题推导都要重写；仅当分区方案仍不可行时考虑 |
| 内容入库 + 按需 SSR | 题解正文进数据库，Web 应用按需渲染 | 否决：4000 篇正文进动态链路，性能和工程复杂度都得不偿失 |

搜索随之拆分：每子站保留本地搜索（小站可开），**全站搜索用构建期生成的静态索引 + 独立搜索页**（Pagefind 或 miniSearch 索引托管在 server，由 /search 页查询），规避"分批构建必须关搜索"的限制。

### 2. 交互层：全面沿用 interview 的技术栈

interview 是四个仓库中唯一的真应用，且架构干净（约 6100 行 TS，web/server/cli 三端共享 router）：

- **通信**：tRPC 11 + superjson，端到端类型安全 —— 新增模块直接加 router。
- **ORM/DB**：Drizzle + MySQL 8 —— 新增表见 03 数据模型。
- **前端**：React 19 + Vite 8 + Tailwind 4 + TanStack Query —— 新页面沿用。
- **CLI**：commander + tsx，经 `appRouter.createCaller()` 直调后端 —— 内容同步、题库导入都走这里。

leetcode 的 VitePress 自定义组件（题解列表、难度标注）用 React 重写一份进 web 应用；docs 子站保留 Vue 版本只用于纯内容浏览。

### 3. 评测沙箱（Judge Worker）

interview 现状是**本机裸跑用户代码、无容器隔离，仅限单机** —— 这是产品化最大的安全硬伤。方案：

```
web → server (tRPC) → judge 队列（DB 轮询即可，初期不上 MQ）→ judge-worker
                                                              │
                                        Docker 容器（每提交一个一次性容器）
                                        └─ algo 镜像：g++ -std=c++17 / python3，CPU/内存/时间限额
```

- judge-worker 与 web/server 同仓库独立部署，通过 DB 表 `submissions` 收发任务（初期够用，避免引入消息队列）。
- **GPU 题评测引流 leetgpu.com**（2026-09 决策：部署机无 GPU，不自建 GPU 沙箱）：站内提供 `.cu` harness 下载自测 + 跳转引导，刷题状态手动标记/回传；`leetgpu-challenges` 不再收编，将来若有 GPU 资源再作为自建沙箱基座重启。
- SQL 题（leetcode 有 324 道数据库题）：评测镜像内嵌 SQLite/MySQL，比对查询结果集。

### 4. 内容管线（content-kit）

吸收四个仓库已有的内容工程能力，统一为构建期管线：

| 已有资产（来源） | 收编为 |
|---|---|
| ai-infra-notes `build/check_course.py`、`lint_md_code.py` | content-kit 的 lint：重复标题、悬空链接、陈旧口径检测 |
| leetcode/leetgpu 的 SKILL.md 写作规范 | content-kit 的模板校验：frontmatter 必填字段、6 段式/8 段式结构检查 |
| interview 的 `bank:generate/import`（LLM 抽题 + sourceKey/contentHash 幂等入库） | 题库同步管线：全量内容 → 面试题库 |
| leetgpu `problems.data.ts`（从目录提取元数据） | 统一改为 frontmatter 解析，不再靠目录约定 |
| 各站硬编码统计（题数等，已多处不一致） | 构建期自动统计注入 |

### 5. LLM 接入

沿用 interview 的 OpenAI 兼容协议封装（已适配 Moonshot / Kimi Code / CANNBot / 本地 vLLM，含 reasoning 模型的 temperature/超时适配）。新增用途：评估报告薄弱点 → 内容推荐（可直接用知识点标签匹配，不必 LLM）、题解摘要、搜索语义增强（可选）。

### 6. 多用户与安全（对外产品）

产品定位已确认为**对外多用户产品**，interview 现状（单用户自动 provision、无认证）需补齐：

- **认证**：开放注册，**邮箱注册为主**（邮箱 + 密码 + 注册验证码验证，2026-09 决策），session cookie；OAuth（GitHub / Google）作为可选增强预留（`oauth_identities` 表已设计，见 03）；users 表从"本地单用户"扩展为正式账号体系。
- **授权与隔离**：所有用户数据表已带 user_id；评测、面试、进度接口逐用户鉴权。
- **配额与限流**：评测提交、LLM 面试的用量计量与限流中间件照常建设，但**上线初期免费用户不限额**（2026-09 决策）——限额值默认无限，后续仅改配置即可开启分层限制；防滥用的基础限流（并发上限、请求频率）仍然生效。
- **LLM 成本控制**：面试 LLM 调用是主要变动成本——按用户配额 + 模型分级（追问用便宜模型、评估用强模型）+ 结果缓存；账单与用量打点进监控。
- **审计与合规**：评测代码、面试记录的留存策略；用户协议与隐私政策（用户代码是否用于内容改进需明确告知）。

## 部署架构

**部署形态（2026-09 决策）：自有机器 + Docker 单机部署，不上 GitHub Pages、不上云平台。**
全部组件收进一个 docker-compose 栈：

```
                      ┌──────────────────────────────────┐
                      │  Caddy（反向代理 + 自动 HTTPS）    │
                      └──┬──────────┬───────────┬────────┘
          /learn,/problems│          │ /(其余)   │ /trpc
                          ▼          ▼           ▼
                  ┌───────────┐ ┌─────────┐ ┌──────────────┐   ┌────────┐
                  │ docs      │ │ web     │ │ server       │──▶│ MySQL  │
                  │ (nginx    │ │ (nginx  │ │ (Hono+tRPC)  │   └────────┘
                  │  静态服务) │ │  静态)  │ └──────┬───────┘
                  └───────────┘ └─────────┘        │       ┌──────────────┐
                                                   └──────▶│ judge-worker │
                                                           └──────┬───────┘
                                                                  │ 挂载宿主 /var/run/docker.sock
                                                                  ▼
                                                     一次性评测容器（algo 镜像，纯 CPU）
```

- 一份 `docker-compose.yml` 管全部服务，interview 已有的 Dockerfile + compose 直接扩展；`deploy/` 目录放 compose、Caddyfile、备份脚本。
- **judge-worker 用 Docker-out-of-Docker**：挂载宿主机 `/var/run/docker.sock`，在宿主机上拉起一次性评测容器（而不是在 worker 容器内嵌套 Docker，避免 dind 的存储与性能问题）。
- **无 GPU 依赖**（2026-09 决策）：宿主机无 GPU，评测容器仅 CPU（algo 镜像）；GPU 题评测引流 leetgpu.com，部署栈不需要 nvidia-container-toolkit。
- 静态产物（docs / web）构建进各自 nginx 镜像，不经 CDN；自有域名 + Caddy 自动 TLS，纯内网使用可关 HTTPS。
- **持久化与备份**：MySQL 挂数据卷 + 定时 mysqldump 备份脚本；内容全部在 Git，无需额外备份。
- 原仓库的三个 GitHub Pages 站不受影响、继续独立运行；新产品与原站无运行时依赖、无互链（是否加引流公告见 05 开放问题）。

## 架构风险

1. **docs 构建规模**：分区构建是已验证的路径（leetcode 4 批构建在生产用），但如果内容继续膨胀到单区 5000+ 页，需提前评估换框架。触发条件：单区构建 > 15 min 或内存 > 8GB。
2. **双端组件重复**：VitePress (Vue) 与 web (React) 各有一份题目列表/内容卡片组件。缓解：docs 侧只做"只读浏览"，一切交互（提交、进度）跳转到 web。
3. **内容库体积**：leetcode 含 1.2 万张 SVG（175M），ai-infra-notes 的 `public/`（56M 构建产物）被提交进 Git —— 迁移时构建产物一律不入库；图片已定 Git 直存 + 打进 docs 镜像，兜底为宿主机 assets 卷挂载（见 04-migration）。
