# 08 iOS App 设计：AIInfra Lab 原生客户端

> 目标：做一个功能对等的原生 iOS 客户端，覆盖 http://47.93.85.170:8080/ 网站的全部功能。
> 原则：**后端零改动**——直接复用现有 tRPC HTTP API 与 Cookie 会话；正文内容继续外链 docs 站（Git 是唯一事实来源），App 只做元数据、交互与进度。

## 1. 部署事实（App 的接入前提）

生产入口为 Caddy（`deploy/Caddyfile`），单域名同源暴露三类资源：

| 路径 | 指向 | App 用法 |
|---|---|---|
| `/trpc/*` | server:3001（tRPC + superjson） | App 全部 API 调用 |
| `/healthz` | server | 启动连通性探测 |
| `/learn/*`、`/problems/gpu/*`、`/problems/algo/*`、`/problems/contest/*/*`、`/problems/lists/*.html` | docs 内容站 | App 内嵌浏览器加载题解/学习正文 |
| 其余 | web SPA | App 不依赖（原生实现同等页面） |

- **BaseURL**：`http://47.93.85.170:8080`（可配置，支持未来切 HTTPS 域名）。
- **认证**：`ailab_session` HttpOnly Cookie（HMAC 签名、7 天、滑动续期），由 `URLSession` 的 `HTTPCookieStorage` 自动携带与续期，App 不接触 token 本体。

## 2. 技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 语言/UI | Swift 6 + SwiftUI，iOS 17+ | `@Observable`、`NavigationStack`、`Swift Charts` |
| 架构 | MVVM（`@Observable` ViewModel）+ Repository | 不引入重型框架；查询缓存用轻量自研 `QueryStore`（key + TTL + invalidate） |
| 网络 | URLSession async/await + 自研 tRPC 客户端（~200 行） | 详见 §4；无第三方依赖 |
| Markdown | swift-markdown-ui | 面试官消息、题面、报告正文；主题对齐 web 暗色令牌 |
| 图表 | Swift Charts + Canvas 自绘雷达图 | 历史趋势折线 / 掌握度雷达（≤8 轴） |
| 内嵌浏览 | WKWebView（sheet） | docs 正文、leetgpu.com 外链 |
| 代码编辑 | `TextEditor` + 等宽字体起步 | M4 可选升级 Runestone（语法高亮） |

UI 设计令牌直接移植 `UI-DESIGN.md`：暗色底 `page/surface/ink/muted/line`、单一红色 accent（`#f2502b` 系）、`rounded-2xl` 卡片、GradeBadge/StatusPill/Chip/DifficultyBadge 组件族。

## 3. 信息架构与导航

### 3.1 Tab 结构（对齐 web 顶栏 5 个主导航）

```
RootView（SessionStore 未登录 → fullScreenCover(LoginScreen)）
└── TabView
    ├── Tab 1 学习  (learn)     ← web `/`、`/learn`
    ├── Tab 2 刷题  (problems)  ← web `/problems/gpu|algo|lists|contest`
    ├── Tab 3 面试  (interview) ← web `/start`、`/bank`、`/history`（Tab 内二级 Segmented）
    ├── Tab 4 我的  (dashboard) ← web `/dashboard`
    └── Tab 5 搜索  (search)    ← web `/search`
```

- 每个Tab一个独立 `NavigationStack`，push 型页面：题单详情、周赛场次、评测页（`/judge/:id`）、面试间（`/interview/:id`）、报告页（`/report/:id`）。
- 面试 Tab 内 `SegmentedControl`：开始面试 / 题库 / 历史（对应 web `InterviewSection`）。
- 深链（M4）：`ailab://interview/{id}`、`ailab://judge/{id}`、`ailab://problems/lists/{slug}`。

### 3.2 功能对等清单（web 路由 → iOS 屏幕）

| Web 路由 | iOS 屏幕 | 交互要点 |
|---|---|---|
| `/login` | `LoginScreen` | 邮箱+密码；错误内联提示；登录后回跳 |
| `/register` | `RegisterScreen` | 邮箱 + 6 位验证码（60s 倒计时）+ 密码≥8 + 昵称可选 |
| `/`、`/learn` | 学习Tab · `LearnScreen` | 三阶段×10周、DayCell 三态标记、专题、论文、总进度条 |
| `/start` | 面试Tab · `StartScreen` | 三步组卷（方向多选卡/范围联动/题量1–5）+ 统计带 + 最近 5 场 |
| `/bank` | 面试Tab · `BankScreen` | 筛选+防抖搜索+分页；QuestionCard 展开；新增/编辑表单、JSON 批量导入、一键播种；仅本人题可编辑删除 |
| `/history` | 面试Tab · `HistoryScreen` | 方向均分条形图、近10场趋势折线、场次列表（删除需 confirm） |
| `/interview/:id` | `InterviewRoomScreen`（push） | 聊天流+乐观更新；代码题分栏（题面/代码面板）；结束本场 confirm |
| `/report/:id` | `ReportScreen`（push） | 总评大字等级；报告/对话回放 Tab；生成进度轮询；失败可重新生成 |
| `/problems/gpu`、`/problems/algo` | 刷题Tab · `ProblemsScreen` | 分区胶囊切换、5 组筛选、标签防抖搜索、A–L 字母分组、高频/中频分组、分页 50 |
| `/problems/lists`、`/lists/:slug` | `ProblemListsScreen` / `ProblemListScreen`（push） | 题单网格 / 题单详情（进度条+有序题目行） |
| `/problems/contest`、`/contest/:session` | `ContestScreen` / `ContestSessionScreen`（push） | 场次网格 / Q1..Qn 有序列表 |
| `/judge/:id` | `JudgeScreen`（push） | 示例用例卡、语言切换（不可用禁用+原因）、代码编辑、提交、结果轮询渲染 |
| `/dashboard` | 我的Tab · `DashboardScreen` | 连续活跃天数、学习进度、按难度AC、掌握度雷达+薄弱点三路信号、配额用量 |
| `/search` | 搜索Tab · `SearchScreen` | 300ms 防抖、类型筛选、结果外链 docs |
| （docs 外链） | `InAppBrowserSheet` | WKWebView + 标题+完成按钮；leetgpu.com 等外部域用 Safari 外跳 |

## 4. 网络层：tRPC-over-HTTP 客户端

### 4.1 协议（已对线上实测校准）

```
query:    GET  {base}/trpc/{router}.{procedure}?input=<urlencoded {"json":{…input}}>
mutation: POST {base}/trpc/{router}.{procedure}
          Content-Type: application/json
          Cookie: ailab_session=…（HTTPCookieStorage 自动附加）

成功响应: {"result": {"data": {"json": <data>, "meta": …}}}
错误响应: {"error": {"json": {"message": "…", "data": {"code": "UNAUTHORIZED|FORBIDDEN|BAD_REQUEST|…", "httpStatus": 401, "path": "…"}}}}
```

- **tRPC v11 约束**：query 过程只接受 GET（POST 返回 `METHOD_NOT_SUPPORTED` 405），mutation 走 POST —— 客户端必须区分两种方法。
- **错误信封也走 superjson 包装**（`error.json.*` 而非 `error.*`），需双兼容解码。

- **轻量 superjson 编解码**：只需解 `.json` 信封。Date 类字段（`createdAt` 等）在线上即 ISO 字符串（superjson 把类型信息放 `meta`、值本体留在 JSON），Swift DTO 用 ISO8601 字符串解码即可；可选字段天然容忍缺失键。若未来出现 Map/Set/BigInt 再扩展 codec（当前 API 未使用）。
- 逐过程调用封装为类型化方法，`packages/contracts` 的 Zod schema 是 DTO 唯一事实来源，人工对齐成 Swift `Codable`（见 §7）。

### 4.2 API Client（`AilabClient`）

```swift
final class AilabClient {
    func call<Input: Encodable, Output: Decodable>(
        _ path: String,               // "auth.login"、"judge.submit" …
        input: Input?
    ) async throws -> Output          // 抛 TRPCError
}

struct TRPCError: Error { let code: String; let message: String }
```

- **401 全局拦截**：`code == "UNAUTHORIZED"` 且非 `auth.me` 探测 → 发 `sessionExpired` 通知 → `SessionStore` 置未登录 → 根视图弹 `LoginScreen`（记录待回跳路由，登录成功后恢复）。对齐 web `trpc.ts` 的全局 QueryCache 策略。
- **`auth.me` 探测豁免**：登录页挂载即发，匿名 401 属预期，不触发登出跳转。
- **配额错误**：`FORBIDDEN` + "配额已用完" → 友好 Alert，并在面试/评测入口前置 `quota.me` 预检（缓存 60s）。
- **重试**：查询类网络错误（URLError）自动重试 1 次；mutation 不自动重试（`interview.reply` 无幂等保护，UI 层 pending 禁用防重复发送；`finish`/`mark`/`getResult` 服务端幂等，可安全重试）。

### 4.3 API 覆盖清单（App 消费的 procedure）

| Router | 使用的 procedure |
|---|---|
| auth | `sendCode` `register` `login` `logout` `me` |
| interview | `start` `reply` `finish` `remove` `list` `stats` `get` |
| question | `list` `stats` `scopes` `create` `update` `remove` `bulkImport` `seed` |
| problem | `list` `get` `facets` `lists` `getList` `contestSessions` `contestProblems` |
| judge | `getProblem` `submit` `getResult` |
| learn | `overview` |
| progress | `mark` `setNote` `overview` |
| quota | `me` |
| search | `query` |

裁剪（不进 App）：`content.import`、`question.bankImport`（content-kit 管线）、auth/quota 的 admin procedures、`/metrics/llm`。

## 5. 核心技术方案

### 5.1 面试聊天室（InterviewRoomScreen）——最复杂的屏幕

- **状态恢复**：`interview.get` 返回 `{session, report, messages, questions, reportProgress}`，进出自如（断点续面）。
- **乐观更新**：点「提交」→ 本地插入 `candidate` 消息（负数本地 id）→ `interview.reply` → 成功插入返回的 `interviewer` 消息；失败插入居中 `system` 错误气泡提示重试。pending 期间输入区禁用。
- **打字指示**：reply pending 时显示"面试官正在输入…"气泡；新消息自动 `scrollTo` 底部（`ScrollViewReader`）。
- **两种布局**：knowledge 纯聊天；代码题（leetcode/cuda）上下结构——上方题面卡（Markdown + 难度徽标），下方聊天流 + 可展开代码面板（换题按 questionId 重置）。
- **内嵌评测**：语言 Segmented（C++/Python，不可用禁用+原因）、starter code 预填、`judge.submit` → 轮询 `judge.getResult` → `JudgeResultView` 原生渲染；「提交代码」把当前代码作为考生消息发给面试官。
- **结束流程**：confirm（"生成可能需要数十秒"）→ `interview.finish`；本地立即置 finished（服务端状态先落库）→ 报告生成期间 2s 轮询 `interview.get` 的 `reportProgress`（pending/evaluating/rendering/failed/done），failed 显示原因 + 「重新生成」。
- **报告渲染**：移植 web `ReportBody` 解析器到 Swift——按 `## ` 分节成卡片、维度行（"准确性 C · 深度 C"→ Chip+GradeBadge）、`【答】`分段与面试官提问一问一答配对、"专项训练建议"的薄弱点→学习/练习链接（点击进内嵌浏览器或站内路由）；解析不匹配时兜底整段 Markdown。Tab 切换：评估报告 / 对话回放（复用气泡组件）。

### 5.2 轮询引擎

```swift
actor Poller<T> {
    func start(interval: Duration, fetch: @escaping () async throws -> T,
               isTerminal: @escaping (T) -> Bool) -> AsyncStream<T>
}
```

- 评测：1.5s，终态 `{ac, wa, ce, tle, mle, ie}` 停止；ac 时服务端自动联动 `user_progress`。
- 报告进度：2s，`done/failed` 停止；页面销毁即 cancel（Task 生命周期绑定）。
- 全屏退出仍需轮询的场景（无）：当前两处都随屏幕生命周期终止，恢复时重新拉取。

### 5.3 评测页（JudgeScreen）

- `judge.getProblem` → 示例用例列表（输入/期望 等宽展示）、cpp/python 可用性 + starter code（cpp 不可用自动切 python）。
- 提交 → `submit` 返回 `{submissionId}` → 轮询 → 结果卡：排队/运行中 spinner；`compile_error` 显示编译输出；`ie/no_cases` 显示服务异常 + 详情；其余"通过 X/Y + 耗时 + 逐用例（输入/期望/实际，未过红色高亮）"。
- AC 触发 success haptic + 刷新题库列表进度（invalidate）。

### 5.4 学习页（LearnScreen）

- `learn.overview` → 三阶段分组（基础内功 W1-4 / 推理系统 W5-8 / 分布式与冲刺 W9-10）、每周 7 格 `DayCell`（灰框/浅绿/深绿✓ 三态）、格点长按循环标记 `progress.mark`（unseen→seen→mastered，mastered 不可回退）、格点点击进 docs（内嵌浏览器）。
- 专题卡（进度条）、论文列表、每周节奏说明卡；总进度条置顶。

### 5.5 刷题（ProblemsScreen 及题目行）

- `ProblemRow`（题库/题单/周赛共用）：序号徽标、标题（外链 docs）、难度徽标、高频/中频徽标、标签 Chip、入口按钮（internal → push `JudgeScreen`；leetgpu-com → 内嵌浏览器/外跳）、备注按钮（圆点标记，≤2000 字）、三态掌握切换（`progress.mark`，leetgpu 题 AC 有专门提示文案）。
- 筛选状态本地持有，服务端过滤 + 内存分页（50/页），`LazyVStack` 保证 4000+ 题滚动性能。

### 5.6 我的（DashboardScreen）

- 标题行：连续活跃 N 天（注意 UTC 日切，展示层按 UTC 对齐）、已学 X/Y、AC Z/W。
- 学习路径卡、按难度三条进度、掌握度雷达（Canvas 自绘正 n 边形，薄弱在前排序）+ 薄弱点三路信号 Chip（学习 0.2 / 刷题 0.5 / 面试 0.3 权重说明）、配额卡（今日已用 X/Y，NULL 显示"不限量"，注"按 UTC 日重置"）。

### 5.7 搜索

- 300ms 防抖（Combine/debounce Task）、类型 Segmented（全部/学习/题目/论文/Profiling）、`search.query` limit 50；结果行 = 类型 Chip + 标题 + 知识点 accent Chip + 两行摘要，整行进内嵌浏览器。

### 5.8 外链内容（InAppBrowserSheet）

- 同源 docs 站 URL 直接 WKWebView 加载（保留站内跳转）；`externalUrl`（leetgpu.com）用 `SFSafariViewController` 或外跳 Safari。
- 阅读器模式不做（docs 站自适应即可）。

## 6. 认证与会话（SessionStore）

```swift
@Observable final class SessionStore {
    enum State { case unknown, loggedOut, loggedIn(User) }
    var state: State = .unknown
    func bootstrap() async      // 冷启动 auth.me（cookie 存在则静默恢复）
    func login/register/logout
}
```

- Cookie 由 `HTTPCookieStorage.shared` 持久化（跨启动保留，等效"记住我"），滑动续期自动生效。
- 注册：`sendCode` 成功后按钮 60s 倒计时；`register` 成功即登录。
- 登出：`auth.logout`（服务端清 cookie）+ 清本地缓存与 QueryStore。

## 7. Swift 数据模型（对齐 `@ailab/contracts`）

```swift
struct User: Codable { let id: Int; let email: String?; let name: String;
                       let avatar: String?; let tier: String; let emailVerified: Bool }
enum QuestionCategory: String, Codable { case leetcode, cuda, knowledge }
enum Difficulty: String, Codable { case easy, medium, hard }
enum ProgressStatus: String, Codable { case unseen, seen, mastered, ac }
enum JudgeStatus: String, Codable { case pending, running, ac, wa, ce, tle, mle, ie }

struct Question: Codable { … }                 // category/difficulty/title/content/followUps/keyPoints/tags/sourceKey/stale
struct InterviewSession: Codable { … }         // status/currentIndex/followUpIndex/questionIds/overallGrade/scope…
struct ChatMessage: Codable { … }              // id/questionId?/role(interviewer|candidate|system)/content/createdAt
struct JudgeVerdict: Codable { … }             // status/cases[{input,expected,actual,pass,error}]/passed/total/compileError
struct ProblemListItem: Codable { … }          // id/source/number/difficulty/judgeType/externalUrl/title/tags/knowledgePoints/progressStatus/note/tier/ac
struct ReportData: Codable { … }               // overallGrade/report(markdown)/weakPoints/createdAt
struct LearnOverview: Codable { … }            // weeks[{week,title,url,seenDays,days[…]}]/topics/papers
struct ProgressOverview: Codable { … }         // learning/practice.byDifficulty/mastery[{knowledgePoint,signals{learn,problem,interview}}]/streakDays
struct QuotaUsage: Codable { … }               // kind/period/used/quota?
struct SearchItem: Codable { … }               // id/title/type/url/tags/knowledgePoints/summary/score
```

- 无本地数据库（v1 不做离线）：服务端是唯一事实来源；仅加内存级 `QueryStore` 缓存（TTL + 登出清空）。M4 可选 SwiftData 缓存题库列表改善冷启动。

## 8. 安全与合规

- **ATS**：当前为 HTTP 明文，Info.plist 加 `NSExceptionDomains: { "47.93.85.170": { NSExceptionAllowsInsecureHTTPLoads: true } }`（不用全局任意加载）；BaseURL 可配置，服务器切 Caddy 自动 HTTPS 后移除豁免。
- 会话凭据全部由系统 Cookie store 管理，不落 Keychain/UserDefaults。
- 评测代码只上行至自有后端（沙箱容器 `--network none` 隔离，App 侧无新增风险面）。

## 9. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1（~2 周） | 项目骨架、tRPC 客户端 + superjson、认证（登录/注册/401 拦截）、学习Tab、刷题浏览（两分区/筛选/题单/周赛）、内嵌浏览器、进度标记/备注 | 无登录可浏览→登录后标记进度；401 全局登出 |
| M2（~1.5 周） | JudgeScreen 全流程（提交/轮询/结果渲染/AC haptic）、题库 CRUD/批量导入/播种 | 评测端到端通过；AC 联动题库状态 |
| M3（~2 周） | 面试闭环：组卷、聊天室（乐观更新/打字指示/断点续面）、内嵌评测、结束、报告解析渲染、历史统计图表 | 一场完整面试→报告→薄弱点推荐可点 |
| M4（~1.5 周） | 我的Tab（雷达/配额）、搜索、深链、haptics/动效打磨、TestFlight | 功能对等清单逐项核对全绿 |

## 10. 风险与备选

| 风险 | 应对 |
|---|---|
| superjson 兼容（未来出现 Date 以外 meta 类型） | codec 预留 meta 处理钩子；上线前用契约测试跑全 API 快照 |
| HTTP 明文（ATS 豁免、传输安全） | 推动服务器上 HTTPS（Caddy 一键）；App 侧 BaseURL 可配置 |
| `problem.list` 内存分页大结果 | iOS 侧 50/页分页 + LazyVStack；只请求当前页 |
| LLM 评估长耗时（数十秒~分钟） | 进度轮询 + 阶段文案 + 失败重试入口（对齐 web） |
| 面试 `reply` 无幂等 | pending 禁用提交按钮；失败不自动重试，提供手动重试 |
