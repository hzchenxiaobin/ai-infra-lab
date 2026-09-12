# UI 视觉一致性审计报告

> 审计范围：`apps/web/src` 全部组件与 16 个页面（React 19 + Tailwind CSS v4）。
> 基准设计系统：`index.css` @theme 暗色令牌（page/surface/ink/muted/line/divider/faint + 红色 accent 系列 + shadow-soft/lift + 三组动画）与 `components/ui.tsx` 公共组件（PageHeader/SectionTitle/Card/ListCard/Button/SegmentedControl/ProgressBar/Loading/ErrorBox/EmptyBox/Modal/GradeBadge/DifficultyBadge/MicroLabel/InlineError）。
> 审计日期：基于当前工作区代码；行号对应审计时版本。

---

## 1. 不一致清单：未复用公共组件的自行实现

### 1.1 卡片容器重复实现（未用 `Card`）

ui.tsx 的 `Card` = `rounded-2xl border border-line bg-surface p-4 shadow-soft`。以下页面绕过它手写等价或近似样式，且圆角不统一（`rounded-2xl` 与 `rounded-xl` 混用）：

| 文件：行 | 代码片段 | 与 Card 的差异 |
|---|---|---|
| `pages/learn/LearnPage.tsx:117` | `className="rounded-2xl border border-line bg-surface p-5 shadow-soft"` | 完全等价（仅 p-5），应 `<Card className="p-5">` |
| `pages/learn/LearnPage.tsx:170` | `rounded-xl border border-line bg-surface p-4 shadow-soft`（每周节奏卡） | 圆角 rounded-xl，与 Card 的 2xl 不一致 |
| `pages/learn/LearnPage.tsx:191` | `rounded-xl border border-line bg-surface p-4 shadow-soft ...`（专题卡，`<a>`） | 同上；可接受为 link 变体但应抽公共类 |
| `pages/problems/ProblemListsPage.tsx:35` | `rounded-2xl border border-line bg-surface p-5 shadow-soft` | 等价 Card |
| `pages/problems/ContestPage.tsx:34` | `rounded-xl border border-line bg-surface p-4 shadow-soft` | 圆角不一致 |
| `pages/bank/QuestionCard.tsx:30` | `rounded-xl border border-line bg-surface shadow-soft` | 圆角不一致 |
| `pages/HomePage.tsx:74` | `rounded-2xl border border-line bg-surface p-5 shadow-soft sm:p-8`（组卷大卡） | 等价 Card |
| `pages/HomePage.tsx:223` | `rounded-2xl border border-line bg-surface shadow-soft` + divide（数据统计带） | 等价 Card 容器 |
| `pages/bank/BankPage.tsx:90` | `rounded-xl border border-line bg-surface px-4 py-3 ... shadow-soft`（notice 条） | 自写通知条，设计系统无对应组件 |

**全站卡片圆角现状：`rounded-2xl`（ui.Card/ListCard）与 `rounded-xl`（LearnPage×2、ContestPage、QuestionCard、BankPage notice、HomePage 方向卡）两套并存。**

### 1.2 按钮重复实现（未用 `Button`）

| 文件：行 | 代码片段 | 说明 |
|---|---|---|
| `components/Layout.tsx:61-67` | 退出按钮：`rounded-full px-3 py-1.5 text-[13px] text-muted hover:bg-divider hover:text-ink` | 即 Button 的 ghost 变体 |
| `components/Layout.tsx:70-75` | 登录链接：`rounded-full bg-accent-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700` | 即 Button 的 primary 变体（Link 场景缺 as/link 支持） |
| `pages/bank/QuestionCard.tsx:79-84` | 在线评测：`rounded-full bg-accent-50 px-3 py-1 text-xs text-accent-700 ring-1 ring-inset ring-accent-600/20` | 第三种 pill 风格（Button 无此变体） |
| `pages/bank/QuestionCard.tsx:87-93` | 编辑：`rounded-full bg-divider px-3 py-1 text-xs text-ink hover:bg-line` | 与 Button secondary 视觉不同（无描边、底色更深） |
| `pages/bank/QuestionCard.tsx:94-101` | 删除：`rounded-full px-3 py-1 text-xs text-accent-400 hover:bg-accent-600/10` | 近似 Button danger 但无描边 |
| `pages/HomePage.tsx:264-301` | 最近场次整行 `<button>` | 行式 item，可接受，但与 HistoryPage 表格行是两套交互样式 |

### 1.3 徽章重复实现（未用 `GradeBadge`/统一样式）

| 文件：行 | 代码片段 | 说明 |
|---|---|---|
| `pages/HomePage.tsx:283-291` | 圆形等级徽章：`grid size-10 rounded-full border text-sm font-bold border-accent-600 text-accent-600` / `border-faint text-muted` | 与 `GradeBadge`（小 pill、ring-inset）完全不同的第二种等级视觉 |
| `pages/HomePage.tsx:296-299` | 进行中徽章：`rounded-full bg-accent-100 px-3 py-1 text-xs text-accent-600` + pulse 点 | 与 `pages/HistoryPage.tsx:116-119` 几乎逐字重复（仅 px-3 vs px-2.5），两处复制粘贴 |
| `pages/HistoryPage.tsx:111-114` | 已完成徽章：`rounded-full bg-surface px-2 py-0.5 text-xs text-muted ring-1 ring-inset ring-line` | 与 DifficultyBadge 同族但又一份手写 |
| `pages/problems/ProblemRow.tsx:86-88` | AC 徽章：`rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-600` | 第三种"成功态"pill |
| `pages/problems/ProblemRow.tsx:42-44` | 序号徽标：`rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11px] text-page` | 反色 chip，独立风格 |
| `pages/problems/ProblemRow.tsx:58` / `pages/SearchPage.tsx:75,82` | 标签 chip：`rounded-md bg-page px-1.5 py-0.5 text-[11px]` / `bg-accent-50 text-accent-600` | 三种 chip 底色（bg-page / bg-accent-50 / bg-divider 见 QuestionCard:39）并存 |
| `components/ReportBody.tsx:134-139, 204, 235` | LABEL_STYLES / 分类 chip / 维度 chip | 报告内第四、五套 chip 样式 |

### 1.4 标题区重复实现（未用 `PageHeader`/`SectionTitle`）

| 文件：行 | 代码片段 | 说明 |
|---|---|---|
| `pages/JudgePage.tsx:86-103` | 自写顶部条：返回链接 + `h1 text-lg font-semibold` | 全站唯一不用 PageHeader 的"页面级"标题；字号 text-lg 与其他页 text-3xl 断层 |
| `pages/HistoryPage.tsx:34, 50` | 卡片内标题 `h3 text-sm font-medium text-muted` | 弱化成说明文字；与同页 :64 的 `MicroLabel + h3 text-lg font-semibold`（即 PageHeader/SectionTitle 模式）两种层级并存 |
| `pages/dashboard/DashboardPage.tsx:139, 161, 195` | 卡片内标题 `h2/h3 text-[15px] font-semibold` | 未用 SectionTitle（text-lg），形成"卡内 15px"这一未入系统的层级 |
| `components/ReportBody.tsx:186-193` | SectionHeading：红竖条 + `text-base font-semibold` | 与 SectionTitle 并存且带独有装饰（accent 竖条），全站仅此一处 |
| `pages/HomePage.tsx:80, 129, 177` | 步骤标题：`text-[13px] font-bold text-accent-600` 序号 + `text-[15px] font-semibold` | 自成一套步骤标题系统（设计上有意为之，但 15px 层级未入系统） |

### 1.5 其他重复实现

| 文件：行 | 说明 |
|---|---|
| `pages/JudgePage.tsx:60, 63` | Loading/错误态自写 `py-20 text-center text-sm text-muted / text-accent-400`，未用 `Loading`/`ErrorBox`（全站唯一） |
| `components/JudgeResult.tsx:25-28` | spinner `size-3.5 animate-spin rounded-full border-2 border-line border-t-muted` 与 ui.tsx `Loading` 内的 spinner 逐字重复（行内版可接受，但应抽共用类） |
| `pages/problems/ProblemsPage.tsx:198-229` | GPU 知识领域 A–L pills：激活态 `bg-ink font-medium text-page` / 未激活 `bg-divider text-muted` —— 手工复制了 `lib/segmented.ts` 的 `segmentedItemClass` 逻辑但未 import 它 |
| `pages/problems/ProblemsPage.tsx:239-244` | 题单/周赛导航 pill：`rounded-full bg-divider px-3 py-1 text-xs` 手写 |
| `pages/HistoryPage.tsx:72-127` | 表格容器 `overflow-x-auto rounded-2xl border border-line bg-surface shadow-soft` 为 ListCard 的表格变体，样式手写 |
| `pages/bank/ImportModal.tsx:98-100` | 成功提示 `border-accent-200 bg-accent-50/60 text-accent-700` 自写——设计系统有 ErrorBox/InlineError 但无对应 SuccessBox |
| `pages/InterviewPage.tsx:128-133` | "面试官正在输入…"气泡手写（合理，属 MessageBubble 族，但未复用其类） |

---

## 2. 任意值清单（偏离设计令牌的 Tailwind arbitrary values）

### 2.1 频率统计（全 src，含 ui.tsx/Layout）

| 值 | 次数 | 主要用途 |
|---|---|---|
| `text-[11px]` | **15** | 辅助/标签文字（全站最泛滥的非标字号） |
| `text-[15px]` | **14** | 卡片/列表标题（介于 text-sm 与 text-base 之间的事实标准） |
| `text-[13px]` | 8 | Layout 导航/按钮、HomePage 步骤号、ReportBody |
| `text-[10px]` | 7 | SVG 图表文字、气泡角色标签、DayCell、品牌副标 |
| `text-[32px]` | 2 | Dashboard 大数字、HomePage 统计带 |
| `size-[18px]` | 2 | Layout logo 方块、HomePage 勾选圆点 |
| `max-w-[80%]` | 2 | MessageBubble 气泡 |
| `tracking-[0.22em]`/`[.24em]`/`[0.14em]`/`[0.4em]` | 各 1 | MicroLabel/品牌副标/方向英文标签/验证码输入 |
| 其余单发 | — | `text-[9px]`（DayCell ✓）、`text-[28px]`（HomePage 题数）、`text-[0.85em]`（Markdown code）、`rounded-[5px]`（logo）、`max-h-[85vh]`（Modal）、`max-h-[55vh]`/`max-h-[45vh]`/`h-[45vh]`（Judge/Interview 滚动区） |

### 2.2 按页面归类

- **Layout.tsx**: size-[18px], rounded-[5px], text-[15px], text-[10px], tracking-[.24em], text-[13px]×4
- **LearnPage.tsx**: text-[15px]×2, text-[11px]×3, text-[10px], text-[9px]
- **DashboardPage.tsx**: text-[11px]×2, text-[10px], text-[15px]×3, text-[32px]
- **HomePage.tsx**: text-[13px]×3, text-[15px]×3, text-[10px], tracking-[0.14em], text-[28px], size-[18px], text-[32px]
- **ProblemsPage.tsx**: 无任意值 ✓
- **ProblemRow.tsx**: text-[11px]×3, text-[15px]
- **ProblemListsPage.tsx**: text-[15px]
- **ContestPage.tsx**: text-[15px], text-[11px]
- **ContestSessionPage.tsx / ProblemListPage.tsx**: 无任意值 ✓
- **BankPage.tsx / QuestionFormModal.tsx / ImportModal.tsx**: 无任意值 ✓
- **QuestionCard.tsx**: 无任意值 ✓
- **HistoryPage.tsx**: text-[11px], text-[10px]（SVG 内）
- **SearchPage.tsx**: text-[11px]×2, text-[15px]
- **InterviewPage.tsx**: max-h-[45vh], h-[45vh]
- **JudgePage.tsx**: max-h-[55vh]
- **ReportPage.tsx**: 无任意值 ✓（text-6xl 为标准类）
- **ReportBody.tsx**: text-[11px]×2, text-[13px]
- **MessageBubble.tsx**: max-w-[80%]×2, text-[10px]×2
- **Markdown.tsx**: text-[0.85em]
- **ui.tsx**: text-[11px]（MicroLabel）, tracking-[0.22em], max-h-[85vh]（系统内部，可豁免）
- **auth/LoginPage / RegisterPage**: tracking-[0.4em]（验证码），其余干净 ✓

**结论：最需要收敛的是 `text-[11px]`（15 处）与 `text-[15px]`（14 处）——它们已是事实上的设计令牌，应上升为 @theme 字号（如 text-caption / text-cardtitle）或并入 text-xs/text-sm。`text-[10px]`/`text-[13px]`/`text-[9px]` 四档微字号（9/10/11/12/13px）并存，辅助文字层级过碎。**

---

## 3. Typography 现状归纳

| 层级 | 设计系统规定 | 实际使用情况 | 问题 |
|---|---|---|---|
| 页面标题 H1 | PageHeader: `text-3xl font-bold tracking-tight` | 14/16 页面遵守；**JudgePage 用 text-lg font-semibold**；**InterviewPage 无 H1**（状态栏 text-sm font-semibold）；auth 两页手写 text-3xl（未走 PageHeader 但数值一致） | JudgePage 标题层级断层 |
| 区块标题 H2 | SectionTitle: `text-lg font-semibold` | Learn/History(:64)/Home(:246) 遵守；Dashboard 卡内用 **text-[15px]**；ReportBody 用 **text-base + 红竖条**；History 图表卡用 **text-sm text-muted** | 实际存在 text-lg / 15px / text-base / text-sm 四档"区块标题" |
| 卡内小标题 | 无规定 | 事实标准 text-[15px] font-semibold（Dashboard×3、Home×3、JudgePage 卡内、Learn 周卡） | 未入系统，14 处手写 |
| 正文 | Markdown: text-sm leading-relaxed | 全站正文基本统一 text-sm ✓；ReportBody 一处 text-[13px]（:124） | 基本健康 |
| 辅助文字 | 无规定 | text-xs text-muted 为主流，但 text-[11px]×15、text-[10px]×7、text-[9px]×1 并存 | 辅助字号 5 档（9/10/11/12px + xs），过碎 |
| 微型标签 | MicroLabel: text-[11px] semibold uppercase tracking-[0.22em] | Layout 品牌副标 tracking-[.24em]、HomePage 方向标签 text-[10px] tracking-[0.14em] 各自为政 | 同类元素三种规格 |
| 大字数字 | 无规定 | text-[32px]（Dashboard/Home）、text-[28px]（Home 题数）、text-6xl（Report 等级） | 三档展示数字未统一 |
| 字重 | — | bold 仅用于 H1/大数字/步骤号；semibold 用于区块与卡标题；medium 用于列表标题/标签 ✓ | 字重使用较克制、一致 |

---

## 4. 信息层级问题

1. **ReportBody（ReportPage）—— 三层嵌套卡片**：`Card`（surface）→ `rounded-lg bg-page p-3`  labeled 子块（ReportBody.tsx:246）→ 内嵌 `MessageBubble`（surface 卡片 + shadow-soft，:87）→ 参考答案再套 `ml-4 border-l-2 border-accent-200` 块（:91）。暗色下 surface→page→surface 交替，阴影叠阴影，层级靠底色反转维持，视觉嘈杂。旧格式分支（:107）还在 bg-page 块内再套 `rounded-md border bg-surface` 原问题框。
2. **InterviewPage —— Card 海 + Primary Action 不明**：一屏内最多 5 张 Card（状态栏/题面/输入区/编辑器/结果），对话气泡也是卡片；可点操作达 4 个（结束本场 danger、提交、评测 secondary、提交代码 primary），"当前最重要动作"（提交回答）与次要动作同权。
3. **BankPage —— 标题区三个按钮并列**（BankPage.tsx:62-86）：新增题目 primary、批量导入 secondary、一键播种 secondary。"一键播种"是批量数据操作，与日常"新增"同级展示，误触风险；notice 条（:90）又是第四种反馈样式。
4. **DashboardPage —— 信息平铺无重点**：学习路径、刷题统计、雷达、薄弱知识点、配额五个 Card 等宽等高平铺，"掌握度"作为核心卖点（雷达图）与"配额用量"（次要管理信息）视觉权重相同。
5. **ProblemsPage —— 筛选区密度过高**：分区 segmented + 5 个 select + 搜索框 + 统计文字单行 flex-wrap（:95-192），GPU 分区再叠加 13 个 A–L 字母 pill（:196-235），两级筛选无视觉分组。
6. **HistoryPage —— 层级跳跃**：图表卡标题弱化为 text-sm text-muted，而"全部场次"反而用 MicroLabel + text-lg 大标题，重要性与视觉权重倒挂。
7. **JudgePage —— 无 PageHeader 且说明文字右置**（:103）：`评测用例为题面示例…` 放在标题行右侧 text-xs，窄屏时被挤压，且页面缺少全站统一的标题区节奏。
8. **HomePage 最近场次 vs HistoryPage 表格**：同一实体（面试场次）在首页是大行卡片+圆形等级徽章，在历史页是 7 列表格+小 pill 徽章，等级视觉两种语言。

---

## 5. 响应式问题

| 页面 | 问题 |
|---|---|
| **Layout.tsx:31-78** | header 固定 h-16 + px-6，logo（双行文字）+ 7 个导航项 + 用户区三者 flex 并列；导航虽有 `overflow-x-auto`（:41），但 <640px 时 logo 与用户区挤压导航，h-16 无移动端折叠方案，max-w-7xl 容器在小屏 px-6 偏大 |
| **HistoryPage.tsx:72-127** | 7 列表格，多数列 `whitespace-nowrap`，标题列 `max-w-56`；外层有 overflow-x-auto 可滚动（可接受），但移动端 7 列横滑体验差，建议移动端转卡片列表 |
| **LearnPage.tsx:138** | `grid-cols-7` DayCell **无响应式降级**（无 sm:/lg: 前缀），移动端每格约 40px 宽，text-[10px] truncate 后基本不可读 |
| **ProblemsPage.tsx:95-192** | 筛选区 select×5 + `input w-48` 固定宽 + `ml-auto` 统计，移动端 wrap 成 4-5 行；`max-w-44` 的 select 在窄屏仍可能溢出 |
| **JudgePage.tsx:86-103** | 标题行 `flex items-center justify-between` 无 flex-wrap，长题目标题 + 右侧说明文字在移动端互相挤压（标题无 min-w-0/truncate） |
| **HomePage.tsx:125-211** | 02/03 行 `flex flex-wrap gap-x-10`，select 固定 w-52/w-32/w-24，`ml-auto` 的提示文字+lg 大按钮在 ~400px 宽时换行顺序不可控 |
| **InterviewPage.tsx:203** | `lg:grid-cols-2` 以下堆叠 OK；但编辑器 `h-[45vh]` + 题面 `max-h-[45vh]` 在小屏竖屏各吃掉近半屏，对话流被夹在两片固定高区域之间 |
| **MessageBubble** | max-w-[80%] ✓ 良好 |
| **DashboardPage** | lg:grid-cols-5 / radar max-w-sm ✓ 良好；薄弱列表行 `w-12` 百分比列 OK |
| **ReportPage 总评** | text-6xl + flex-wrap ✓ 良好 |

---

## 6. 每页面一句话视觉诊断

1. **HomePage（组卷）**：组卷流程的 01/02/03 步骤化设计清晰，但大卡片、统计带、圆形等级徽章全部手写且与 Card/GradeBadge 是平行宇宙，是"最精致但最游离于系统外"的页面。
2. **LearnPage**：四段式结构节奏好，但三种卡片圆角（2xl/xl）混用、DayCell 7 列网格在移动端不可读、text-[11px]/[10px]/[9px] 微字号过碎。
3. **DashboardPage**：数据可视化完成度高，但五张卡片平铺无主次、"掌握度雷达"这一核心被配额卡稀释，卡内 15px 标题未入系统。
4. **ProblemsPage（题库）**：组件复用最佳（PageHeader/ListCard/Button/segmented 全用），但筛选区 7 控件单行堆叠 + 13 个字母 pill 造成工具区压迫感。
5. **ProblemListsPage**：简洁干净；卡片手写且信息仅两行（标题+题数），"点击进入 →"提示文字（:41）属冗余装饰。
6. **ProblemListPage**：PageHeader 内嵌进度条+外链的做法值得推广，基本无问题；末尾缺元数据提示卡（:69）略突兀。
7. **ContestPage**：与 ProblemListsPage 同构但卡片用 rounded-xl，两页本应共享一个 ListEntryCard。
8. **ContestSessionPage**：最干净的页面之一，完整复用 PageHeader+ListCard+ProblemRow，无槽点。
9. **BankPage**：管理功能齐全，但标题区三按钮并列、notice 自写、QuestionCard 三个行内按钮三种风格，"管理台"感强于系统感。
10. **QuestionFormModal / ImportModal**：Modal/InlineError/Button 复用规范，表单 label 模式统一，是表单类页面范本；ImportModal 成功态缺 SuccessBox。
11. **LoginPage / RegisterPage**：居中窄栏 + MicroLabel + Card 克制美观，验证码 tracking-[0.4em] 细节好；标题区未复用 PageHeader 属合理变体。
12. **HistoryPage**：图表（手写 SVG）质量高，但图表卡标题弱化、场次表格与首页场次卡片两套视觉、表内徽章手写，层级体系混乱度全站最高。
13. **SearchPage**：极简、复用到位（PageHeader children 嵌输入框的用法新颖），结果行三种 chip 底色（page/accent-50）与 ProblemRow 不通用。
14. **InterviewPage**：沉浸式布局合理，但卡片密度过高、操作分散在三个位置、无页面标题锚点，进入面试间后"我在哪"感弱。
15. **JudgePage**：唯一不用 PageHeader、唯一自写 Loading/Error 的页面，标题层级（text-lg）与全站（text-3xl）断层，像另一个产品的页面。
16. **ReportPage**：总评大字 + Tab 切换结构清晰，但正文 ReportBody 三层卡片嵌套+红竖条标题是独立视觉方言，与页面其他部分脱节。

---

## 7. 做得好的地方（应保留并推广）

1. **令牌体系本身**：@theme 暗色令牌命名（page/surface/ink/muted/line/divider/faint）语义清晰，全站几乎无硬编码色值（除 pulse-dot keyframes 中 rgb(238 34 0)），颜色纪律优秀。
2. **单一红色强调 + 暗色 hover 提亮（600→700）**：克制且有辨识度，accent-50/100 暗红选中底与亮红文字（300/400）的暗色可读性处理专业。
3. **ui.tsx 组件覆盖率高**：16 页中 14 页使用 PageHeader，Loading/ErrorBox/EmptyBox 三态几乎全站统一，`ProgressBar` 三档尺寸被 6 处复用，`Modal`/`InlineError` 让 bank 两个弹窗零样式负担。
4. **`.input` 组件类统一表单控件**：所有 input/select/textarea 的 focus ring（accent-600/20）、disabled 态完全一致，是 Tailwind v4 @layer components 的教科书用法。
5. **lib/segmented.ts 抽离分段选择器**：Layout 导航、ProblemsPage 分区、SegmentedControl 三处共享激活态逻辑（bg-ink 反色 pill）， ProblemsPage 的 GPU 字母 pill 是唯一的漏网之鱼。
6. **animate-fade-up + animationDelay 梯队**（0.08s 递增）：全站 section 级入场节奏统一，便宜且有效。
7. **GradeBadge 二值化策略**（A/B 红、其余灰）与 **DifficultyBadge 中性化**：避免多彩徽章破坏单强调色体系，决策成熟。
8. **Markdown.tsx 自研渲染器**：块级样式（引用 border-l-2、代码块 bg-page、标题四档）与令牌完全对齐，无第三方样式污染。
9. **MessageBubble 双气泡反转设计**（考生 bg-ink 亮卡 / 面试官 surface 暗卡）：不用强调色而靠明度对比区分角色，节省红色额度。
10. **手写 SVG 图表（雷达/趋势）**：stroke-divider/fill-accent-600 全部走令牌类，与暗色主题无缝。
11. **RequireAuth 用 Loading 组件做守卫过渡**、**PageHeader 支持 children 内嵌进度条/搜索框**（LearnPage/ProblemListPage/SearchPage 三处活用）——API 设计灵活度好。

---

## 附：改进优先级建议（仅供参考，不在本次审计范围内实施）

1. P0：JudgePage 接入 PageHeader + Loading/ErrorBox（消除最明显的断层）。
2. P0：将 text-[15px]、text-[11px] 上升为 @theme 字号令牌；卡片圆角统一为 rounded-2xl（或给 Card 加 `size` 变体）。
3. P1：抽 `StatusPill`（进行中/已完成/AC）与 `IconChip`（标签/知识点）收敛 5 套 chip；HomePage 圆形等级徽章与 GradeBadge 二选一。
4. P1：ReportBody 降嵌套（labeled 子块去 bg-page 或去 Card 阴影）。
5. P2：LearnPage DayCell 网格加 `grid-cols-4 sm:grid-cols-7` 降级；HistoryPage 表格移动端卡片化；Layout 增加移动端导航方案。
