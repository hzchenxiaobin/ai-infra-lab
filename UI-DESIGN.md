# AIInfra Lab UI 精修设计规范（最终版，含审计结论）

> 原则：保留现有暗色 + 单红 accent 的产品身份与组件架构，只做统一、精修、补全。
> 禁止：蓝紫渐变、霓虹、glow、glassmorphism、大阴影、彩色卡片堆叠、粒子效果、过度动画。
> 禁止：改动业务逻辑、tRPC 调用、数据结构、路由、后端。
> 参考：`UI-AUDIT.md`（全量审计报告，含行号级问题清单）。

## 0. 现状判断

底子很好：颜色令牌纪律优秀、14/16 页面用 PageHeader、三态统一。核心问题是
**平行实现**（手写卡片/按钮/chip 多套并存）、**字号任意值泛滥**（text-[11px]×15、
text-[15px]×14）、**JudgePage 断层**、**ReportBody 三层嵌套卡**、个别移动端问题。

## 1. 色彩（保持现有令牌）

沿用 `index.css @theme`：`page/surface/ink/muted/line/divider/faint` + `accent-50..700`。
- 禁止 Tailwind 调色板颜色；accent 仅用于 primary action、active 态、关键数字、focus ring。
- 新增全局细节（index.css base 层）：
  - `::selection { background: accent-600/30 }`
  - 全局 `:focus-visible`：2px accent-400 outline + 2px offset（组件不再各自写 ring）
  - 细滚动条：thumb 用 `--color-line`，hover 用 `--color-faint`（webkit + scrollbar-width: thin）
  - pulse-dot keyframes 里的硬编码 `rgb(238 34 0)` 改用 accent 色值变量。

## 2. Typography（消灭任意字号 → 收敛到 Tailwind 阶梯）

| 用途 | 统一为 |
|---|---|
| 页面标题 (PageHeader) | text-3xl font-bold tracking-tight（保持） |
| 区块标题 (SectionTitle) | text-lg font-semibold tracking-tight（保持） |
| 卡片/条目主标题 | **text-base font-semibold**（所有 text-[15px] 归并于此） |
| 正文 | text-sm（保持） |
| 描述文字 | text-sm text-muted |
| meta/辅助 | **text-xs text-muted**（所有 text-[11px]/[10px] 归并于此） |
| 大统计数字 | **text-3xl font-bold leading-none**（text-[32px]/[28px] 归并；小统计 text-2xl） |
| MicroLabel | 保持 text-[11px] uppercase tracking-[0.22em]（唯一豁免的系统级任意值） |
| 英文小标签（方向卡等） | 复用 MicroLabel 同款规格：`text-[11px] font-medium uppercase tracking-[0.14em] text-muted` |
| Layout 导航/用户区文字 | text-[13px] → **text-sm** |
| 品牌副标 tracking-[.24em] | 保持（品牌元素豁免） |
| DayCell 的 text-[10px]/[9px] | 格子标题 text-xs；✓ 按钮 text-xs |
| Report 页 text-6xl 大等级 | 保持（展示级数字，合理） |

规则：除上述豁免项，禁止 `text-[Npx]`。

## 3. Spacing 节奏

- 页面区块：`space-y-10`；section 内部：`space-y-4`。
- 卡片 padding 统一：Card 默认 `p-4` → **改为 p-5**；首页组卷大卡 `p-6 sm:p-8`。
- 网格：大卡 `gap-4`；小卡 `gap-3`。
- 页面容器：保持 `max-w-7xl mx-auto px-6 py-10`；移动端 `px-4 sm:px-6`。

## 4. Radius / Border / Shadow

- 所有卡片/面板：**rounded-2xl**（LearnPage 节奏卡/专题卡、ContestPage 卡、QuestionCard、BankPage notice 的 rounded-xl 全部归并）；嵌套小元素（DayCell、chip、代码块）rounded-lg/xl 保持。
- `.input`：rounded-[10px] → **rounded-xl**。
- 阴影仅 shadow-soft / shadow-lift。交互卡片 hover 只做 `hover:border-faint` 颜色过渡。

## 5. 组件改造清单（Stage 2：index.css / ui.tsx / segmented.ts / Layout.tsx）

1. `Card`：默认 padding p-4 → p-5。
2. **新增 `StatusPill`**：`variant: "active" | "done" | "ac"`——
   - active：`bg-accent-100 text-accent-600` + pulse-dot（进行中）
   - done：`bg-surface text-muted ring-1 ring-inset ring-line`（已完成）
   - ac：`bg-accent-100 text-accent-600 font-medium`（评测通过）
   统一尺寸 `rounded-full px-2.5 py-0.5 text-xs`。取代 HomePage:296、HistoryPage:111/116、ProblemRow:86 三套手写。
3. **新增 `Chip`**（标签/知识点）：`rounded-md bg-page px-1.5 py-0.5 text-xs text-muted`；可选 accent 变体 `bg-accent-50 text-accent-600`。收敛 ProblemRow:58、SearchPage:75/82、QuestionCard:39、ReportBody 的 chip。
4. **新增 `SuccessBox`**：与 ErrorBox 同族（`rounded-lg border border-accent-600/30 bg-accent-600/10 text-sm text-accent-300`），供 ImportModal 成功态等使用。
5. `GradeBadge` 保持为唯一等级视觉；HomePage 圆形等级徽章（:283-291）替换为 GradeBadge。
6. `Modal`：面板加 `border border-line`。
7. `Loading` 的 spinner 抽出为 `Spinner` 导出（JudgeResult 复用）。
8. Layout：登录 Link / 退出 button 套用与 Button 一致的 primary/ghost 样式类（从 ui.tsx 导出 `buttonClass(variant, size)` 工具函数，供 Link 场景使用）；header 移动端 `px-4 sm:px-6`，nav 加 `scrollbar-none`。
9. index.css：按 §1 加 selection/focus-visible/scrollbar；`.input` 圆角改 rounded-xl。

## 6. 页面改造要点（Stage 3，按组）

### A. HomePage + HistoryPage
- HomePage：组卷卡/统计带改用 `Card`；方向卡保留自定义交互卡但 rounded-2xl→保持 rounded-xl 为"嵌套元素"档即可（它们是卡内元素，rounded-xl 合规）；步骤号 text-[13px]→text-sm；text-[28px]/[32px]→text-3xl；text-[15px]→text-base；圆形等级徽章→GradeBadge；进行中 pill→StatusPill active；场次行 `<button>` 保留但 hover 统一 `hover:bg-page`。
- HistoryPage：图表卡标题从 text-sm text-muted 提升为 SectionTitle 层级；表格徽章用 StatusPill/GradeBadge；"全部场次"标题层级保持；表格容器样式与 ListCard 对齐（保持 overflow-x-auto，列宽微调即可，不做卡片化改造以免破坏功能）。
- 两页"同一实体"统一：等级=GradeBadge，状态=StatusPill。

### B. LearnPage + DashboardPage
- LearnPage：手写卡 → Card；rounded-xl 卡归并 rounded-2xl；text-[11px]/[10px]→text-xs；DayCell 网格加降级 `grid-cols-4 sm:grid-cols-7`；DayCell 内 ✓ 按钮 text-[9px]→text-xs。
- DashboardPage：卡内 text-[15px] 标题 → text-base font-semibold（与 SectionTitle 体系对齐，但卡内用 text-base）；text-[32px]→text-3xl；保持五卡布局结构不动功能，仅通过标题层级与留白建立主次（不大改 grid，避免破坏）；text-[11px]/[10px]→text-xs（SVG 内 text-[10px] 可豁免为图表刻度）。

### C. Problems 五页
- ProblemsPage：GPU 字母 pills 改用 `segmentedItemClass`（import lib/segmented）；题单/周赛导航 pill 样式与 segmented 体系对齐；筛选区加视觉分组（分区 segmented 一行、select 组一行、搜索+统计一行），移动端 flex-wrap 优化、select 宽度改 `w-full sm:w-44` 类弹性。
- ProblemRow：AC 徽章 → StatusPill ac；序号反色 chip 保留（合理设计）；标签 chip → Chip。
- ProblemListsPage：手写卡 → Card；删除"点击进入 →"冗余提示；text-[15px]→text-base。
- ProblemListPage：基本保持；末尾突兀的提示卡用 EmptyBox/Card 对齐。
- ContestPage：手写卡 → Card（与 ProblemListsPage 同构）。
- ContestSessionPage：保持（范本）。

### D. Bank 三件套 + Auth 两页
- BankPage：标题区三按钮——新增题目 primary 保持，"批量导入"secondary 保持，"一键播种"降为 ghost；notice 条用 Card 或抽成统一样式（border-line bg-surface，不新增颜色）。
- QuestionCard：三个行内按钮统一为 Button size="sm"（评测=secondary accent? 用 ghost/secondary/danger 体系：在线评测 secondary、编辑 ghost、删除 danger）；rounded-xl → 卡片由 BankPage 容器统一。
- ImportModal：成功态改用 SuccessBox。
- Auth 两页：保持居中窄栏设计；tracking-[0.4em] 验证码保留。

### E1. InterviewPage + JudgePage + SearchPage
- JudgePage（P0 断层页）：接入 PageHeader（label="Judge · 评测"、title=题目标题、description 放评测说明）；Loading/Error 换 Loading/ErrorBox；保持左右分栏结构。
- InterviewPage：顶部状态栏补一个轻量位置锚点（题号/进度文案不动逻辑）；操作区收敛——提交回答为唯一 primary，评测 secondary，结束本场 danger 缩小为 sm 并放次要位置；固定高区域 max-h-[45vh] 在小屏改 max-h-none（`max-h-[45vh]` → `sm:max-h-[45vh]` 之类，避免移动端夹心）。
- SearchPage：chip → Chip 组件；text-[11px]/[15px] 归并。

### E2. ReportPage + ReportBody + Markdown + MessageBubble + JudgeResult
- ReportBody：降嵌套——labeled 子块去掉 bg-page 底色改 border-l-2 border-line pl-3 的引用式；MessageBubble 在报告内嵌套时去 shadow-soft；SectionHeading 的红竖条保留（这是报告内唯一的装饰，克制可接受）但字号对齐 text-base；text-[13px]/[11px] 归并。
- JudgeResult：spinner 改用 ui.tsx 导出的 Spinner。
- MessageBubble：text-[10px] 角色标签 → text-xs。
- Markdown.tsx：保持（text-[0.85em] 是相对单位，豁免）。

## 7. Docs 内容站（VitePress ×3：learn / problems-gpu / problems-algo）

- 在各自 `.vitepress/config.mts` 的 themeConfig 或 head 中注入品牌色 CSS 变量（或 theme/custom.css 统一加）：
  `--vp-c-brand-1/2/3` 对齐 web accent（#f2502b / #ff6240 / #b04028 三档），`--vp-c-brand-*` 系列同步；
  暗色下 brand 用亮档 #ff7a52 保证可读。
- appearance 默认 dark（若现状是默认浅色则改为 'dark'，与 web 一致）。
- 正文字体：`--vp-font-family-base` 对齐 Inter + 系统中文字体栈；`--vp-font-family-mono` 对齐 ui-monospace 栈。
- 保留现有加宽布局、灯箱、内容结构；不改 markdown 内容。
- 三个站配置重复的部分保持一致改动。

## 8. 动画纪律

仅 fade-up / pop-in / pulse-dot / 150–250ms 颜色过渡。不新增。

## 9. 验收清单

- `pnpm --filter @ailab/web build` 通过；`oxlint` 无新增错误。
- 全 src 无 `text-[Npx]`（豁免：MicroLabel、英文小标签 tracking 组合、SVG 图表刻度、tracking-[0.4em]、品牌副标）。
- 全 src 无 Tailwind 调色板颜色类。
- JudgePage 使用 PageHeader/Loading/ErrorBox。
- StatusPill/Chip/SuccessBox 被对应页面复用。
- 页面功能不变（路由、tRPC 调用、表单、弹窗逻辑原样）。
