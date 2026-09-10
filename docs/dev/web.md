# web — 门户前端开发指南

> `apps/web`：React 19 + Vite 8 + Tailwind 4 + react-router 7 + TanStack Query。
> 以 `interview/apps/web`（约 2000 行、6 页面）为底座拷入起步。信息架构见
> [01 产品设计](../01-product-design.md#信息架构)；与 docs 内容站的职责切分见
> [02 架构风险 §2](../02-architecture.md#架构风险)。

## 1. 目录结构

```
apps/web/
├── src/
│   ├── main.tsx            # 入口：QueryClientProvider + App
│   ├── App.tsx             # 路由表（BrowserRouter + Routes）
│   ├── index.css           # Tailwind 4（@tailwindcss/vite 插件，无 tailwind.config）
│   ├── lib/
│   │   ├── trpc.ts         # tRPC client + TanStack Query 代理（见 §3）
│   │   └── format.ts       # 日期/时长等格式化
│   ├── components/
│   │   ├── Layout.tsx      # 顶栏 + 导航壳
│   │   ├── RequireAuth.tsx # 路由守卫（未登录跳 /login，见 §3）
│   │   ├── Markdown.tsx    # 轻量 Markdown + KaTeX 渲染器（见 §5）
│   │   ├── MessageBubble.tsx   # 面试对话气泡
│   │   ├── ReportBody.tsx  # 评估报告渲染
│   │   └── ui.tsx          # 基础控件（按钮/卡片/徽标等）
│   └── pages/
│       ├── HomePage.tsx            # 门户首页（组卷 + 最近场次）
│       ├── dashboard/              # 个人中心（进度/统计/掌握度雷达/配额，progress.overview + quota.me）
│       ├── bank/                   # 面试题库页（BankPage + 题目卡片/表单弹窗）
│       ├── InterviewPage.tsx       # 面试间
│       ├── JudgePage.tsx           # 评测页（接队列化提交）
│       ├── ReportPage.tsx          # 评估报告
│       ├── HistoryPage.tsx         # 历史场次
│       ├── auth/                   # 注册 / 登录
│       ├── learn/                  # Learn 路径页（10 周 × 7 天进度）
│       ├── problems/               # Problems 题库页（GPU/算法两分区 + 题单）
│       └── SearchPage.tsx          # 全站搜索（查 server 托管的静态索引）
├── vite.config.ts          # 见 §6
└── package.json            # @interview/web（拷入后改名 @ailab/web）
```

## 2. 页面清单与路由

| 路由 | 页面 | 状态 |
|---|---|---|
| `/` | 门户首页（组卷 + 最近场次） | 已有 |
| `/dashboard` | 个人中心（进度 / 统计 / 掌握度雷达 / 配额用量） | 已有（M2 扩展） |
| `/bank` | 面试题库（729 题 CRUD） | 已有 |
| `/interview/:id` | 面试间（leetcode 同步题内嵌评测器：语言切换 + 评测入队 + 结果内联，2026-09-10 第六批） | 已有 |
| `/judge/:id` | 在线评测（统一题目 ID；题面/完整题解跳 docs，站内示例评测 + AC 联动） | 已有（数据源切 problems，2026-09-10） |
| `/report/:id` | 评估报告（薄弱点 → 学习/练习推荐链接，M2 已闭环） | 已有 |
| `/history` | 面试历史 | 已有 |
| `/login` `/register` | 登录 / 注册（邮箱 + 验证码） | 已有（M2） |
| `/learn` `/learn/path` | 学习路径总览（10 周/专题/论文 + 进度标记） | 已有（M2） |
| `/problems/gpu` `/problems/algo` | 题库浏览（难度/AC/标签/知识点/评测方式筛选；GPU 分区带 A–L 知识领域快捷分组 chips） | 已有（M2） |
| `/problems/lists` `/problems/lists/:slug` | 题单索引 + 详情（成员有序浏览 + AC 进度条，编排正文跳 docs） | 已有（2026-09-10 第五批） |
| `/problems/contest` `/problems/contest/:session` | 周赛场次列表（新→旧）+ 单场 Q1..Qn 浏览 | 已有（2026-09-10 第五批） |
| `/search` | 全站搜索 | 已有（M1） |

路由集中维护在 `App.tsx`，新页面先加路由再建 `pages/` 目录文件。
**正文阅读页不在 web**：`/learn/week{n}/day{m}`、题目正文这类只读内容由 docs 站渲染，
web 侧的 Learn/Problems 页是"导航 + 进度 + 交互"，点击正文跳 docs 站对应 URL。

## 3. 数据请求约定（tRPC client + TanStack Query）

`lib/trpc.ts`（拷入即得）是三端类型安全的收口：

```ts
export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/trpc", transformer: superjson })],
});
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });
```

约定：

- **一律走 `trpc`（`@trpc/tanstack-react-query` 的 options proxy）+ `useQuery` /
  `useMutation`**，不手写 `fetch`，不引入 REST。
- `AppRouter` 类型直接 `import type { AppRouter } from "@ailab/server"`——server 改了
  router，web 编译期即报错，这是 contracts 之外的第二道类型防线。
- 常用返回类型用 `Awaited<ReturnType<typeof trpcClient.xxx.query>>` 从 client 推导
  （`lib/trpc.ts` 底部已有样板），避免引入 `@trpc/server`。
- mutation 成功后按需 `queryClient.invalidateQueries`；列表类 query 用
  `queryKey` 带筛选参数（tRPC proxy 自动处理）。
- **路由守卫**：`components/RequireAuth.tsx` 包裹需登录路由（`App.tsx` 中 login/register
  之外的路径均在其内）——依据 `auth.me` 判定（遗留单用户 email 为 NULL 视为未登录），
  未登录带 `from` 跳 `/login`；登录/注册页对已登录用户反向跳回。
- 认证后的 401：TanStack Query 全局 onError 捕获 `UNAUTHORIZED` → 跳 `/login`（守卫的兜底）。

## 4. 组件组织

- `components/ui.tsx`：无依赖基础控件，新增页面先在这里找；不够再建独立文件。
- 业务组件就近放页面目录（如 `pages/bank/QuestionCard.tsx`），跨页面复用才提升到
  `components/`。
- leetcode/leetgpu 的 Vue 组件（题目列表、难度标注）**在 web 侧用 React 重写一份**
  （02 已决策）；docs 侧保留 Vue 原版做只读浏览。重写时对照 Vue 版 props/展示逻辑，
  不照搬实现。
- 样式一律 Tailwind 原子类；已有代码用 `text-ink`/`bg-divider` 等语义色
  （`index.css` 里定义），新组件沿用同一套语义色，不要引入新的色板。

## 5. Markdown / KaTeX / SVG 渲染

`components/Markdown.tsx` 是一个**手写的轻量渲染器**（不引入 react-markdown）：
支持标题/列表/引用/代码块/加粗/行内代码/`$公式$`（KaTeX `renderToString`，
`throwOnError: false`）。面试消息、报告、题面都走它。

- 需要新语法（表格、脚注、任务列表）时**先评估是否升级该组件**；改动要同时回归
  面试页与报告页。若需求超出轻量渲染器能力（如表格），再议引入完整 markdown 库——
  在 PR 描述里说明理由（06 开发约定"加依赖先确认"）。
- KaTeX css 在组件内 import（`katex/dist/katex.min.css`），Vite 自动分包。
- **SVG 插图**：web 不渲染内容正文，题目卡片/学习卡片里的缩略图直接 `<img>` 指向
  docs 站的最终 URL（content-kit 构建期重写产出，见
  [content-kit](content-kit.md#5-图片规范)）；不要在 web 里内联 SVG 源文件。
- 报告里的"参考答案折叠""要点对照"等交互在 `ReportBody.tsx`；薄弱点推荐链接由报告
  markdown 里的 `[标题](url)` 承载，`Markdown.tsx` 的 renderInline 负责链接化（站内路径
  当前页跳转，http 外链新开标签）。

## 6. 构建与开发

```bash
pnpm --filter web dev      # vite dev，:5173，/trpc 代理到 :3001
pnpm --filter web build    # tsc -b && vite build（类型检查随构建）
pnpm --filter web lint     # oxlint
```

`vite.config.ts` 要点：`@` → `./src` 别名；dev server `/trpc` proxy 到
`http://localhost:3001`（与 server 的 `PORT` 默认值一致，改端口两边一起改）。
生产构建产物是纯静态文件，打进 web 的 nginx 镜像（见
[deployment](deployment.md)），`/trpc` 由 Caddy 反代到 server。

## 7. 与 docs 站的职责切分（红线）

| 维度 | web（React） | docs（VitePress/Vue） |
|---|---|---|
| 职责 | 一切交互：提交评测、进度标记、面试、搜索、账号 | 只读浏览：学习正文、题解正文 |
| 数据 | tRPC 实时数据 | 构建期静态产物 |
| 组件 | React 版题目列表/卡片 | Vue 版列表/图片查看器 |

**红线**（02 架构风险 §2、05 风险清单）：

1. 不为 docs 开发任何交互组件；用户在 docs 上想"做"任何事（提交、标记、跳面试），
   链接回 web 对应页面。
2. 同一份展示逻辑需要两端各写一份时，web 侧 React 重写，docs 侧维持拷入的 Vue 版；
   不要尝试跨框架共享组件代码。
3. docs 页面 URL 是 web 的外链目标，web 内引用内容页一律用 content-kit 注入的
   `contents.url`，不手拼路径（硬编码禁令）。
