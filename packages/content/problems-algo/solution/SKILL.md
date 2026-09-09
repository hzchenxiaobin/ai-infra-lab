---
name: leetcode-daily
description: 用于在 leetcode/solution 下编写每日 LeetCode 题解。规定了按序号补全的选题逻辑、目录组织、题解文档结构、手绘 sketch 风 SVG 插图规范与网站构建集成。触发于"写 leetcode 每日题解"、"补全 solution 题解"、"按序号补缺题"、"加一道 leetcode 题解"等请求。
---

# 写 LeetCode Daily 题解 Skill

本工程(`leetcode`)的 LeetCode 每日题解遵循一套固定的目录组织、文档结构和插图规范。本 skill 描述如何产出符合仓库惯例的题解。

## 1. 选题逻辑：按序号补全

每日题解的目标是**按题号顺序逐题补全，形成题号 1–N 的连续覆盖**，而非按面试频率挑选。选题时遵循以下原则。

### 1.1 选题原则

| 原则 | 说明 |
|------|------|
| **按序号顺序** | 从最小缺失题号开始补，逐题填写，不跳号；下一个要写的题号用 1.3 的扫描脚本实时得出 |
| **逐区间推进** | 先补完 `0001-0100` 区间的所有缺题，再进入 `0101-0200`，依此类推；区间目录与题号映射见第 2 节 |
| **难度不挑选** | 不按难度筛选，序号在前即先写（简单/中等/困难混合推进） |
| **标签不挑选** | 不按算法标签筛选，序号优先；1.2 标签索引仅作已写题解的分类参考，不驱动选题 |
| **题目不重复** | 同一道题在整个 solution 系列中只出现一次；选题前先按 1.3 的方法扫描 `leetcode/solution/` 已有文件 |
| **完整覆盖** | 目标是题号 1–N 的无缺口连续覆盖；周赛题解（`contest/`）不在本序列内，不参与补全 |

### 1.2 已写题解的标签索引（参考用）

标签索引已迁移至 [`INDEX.md`](INDEX.md)（与本文件同目录），按标签分组列出已写题解中的代表性题目，仅供按标签检索题解，**不驱动选题**。选题完全按 1.3 的方法实时扫描缺号进行。

> 💡 **一句话总结**：选题的本质是「按题号顺序逐题补全，追求题号的连续覆盖」；`INDEX.md` 仅供检索已写题解，不影响下一个要写的题号。下一个要写的题号用 1.3 的扫描脚本实时得出。


### 1.3 缺题定位：实时扫描（不维护静态清单）

**不要在本 skill 中手维护缺题清单**——静态清单会迅速过期，曾导致选题方向与实际磁盘状态矛盾。选题时在 `leetcode/` 目录下运行以下脚本实时扫描 `solution/`，取最小的若干个缺失题号（与 `cannbot_hello.sh` 的预分配逻辑一致）：

```bash
python3 -c "
import os, re
root = 'solution'
nums = set()
for d in sorted(os.listdir(root)):
    if not os.path.isdir(os.path.join(root, d)) or d == 'images': continue
    for f in os.listdir(os.path.join(root, d)):
        m = re.match(r'(\d+)_', f)
        if m: nums.add(int(m.group(1)))
mx = max(nums) if nums else 0
n = 5  # 想取几个缺号就改成几
out = []
i = 1
while len(out) < n and i <= mx + n:
    if i not in nums:
        out.append(i)
    i += 1
print('\n'.join(str(x) for x in out))
"
```

输出首行即下一个要写的题号。**若调用方已显式指定题号**（如批量脚本预分配、用户点名），以指定题号为准，无需再扫描，也不要因扫描结果与指定题号不同而困惑。

### 1.4 题目信息获取（实测可用的 recipe）

题号 → 题面分两步（2026-08 实测可用）：**题号先换 slug，再用 slug 走 GraphQL 拿题面**。**不要抓 leetcode.com**，会被 Cloudflare 拦截（403）。

**第一步：题号 → slug**。GraphQL 的 question 查询只认 `titleSlug` 不认题号，用全量题表换：

```bash
curl -s 'https://leetcode.cn/api/problems/all/'
```

返回 JSON 的 `stat_status_pairs` 每条含 `frontend_question_id`（题号）与 `question__title_slug`。注意两点：

- 题号是**字符串**，表中混有 `LCP 82`、`面试题 01.01` 这类非数字 id，必须按字符串相等匹配，不要 `int()` 转换；
- 该接口有几 MB，**批量场景缓存一次全表复用**，不要每题都拉。

```python
slug = next(p['stat']['question__title_slug'] for p in data['stat_status_pairs']
            if p['stat']['frontend_question_id'] == str(N))
```

**第二步：slug → 题面**（GraphQL）：

```bash
curl -s 'https://leetcode.cn/graphql/' \
  -H 'Content-Type: application/json' \
  -H 'Referer: https://leetcode.cn' \
  -d '{"query":"query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title translatedTitle isPaidOnly difficulty topicTags { name } translatedContent jsonExampleTestcases hints codeSnippets { lang code } } }","variables":{"titleSlug":"<slug>"}}'
```

要点（均为踩坑记录）：

- **slug 不要凭题号猜**（如把 2633 猜成 `convert-to-date`）。优先用第一步的全量题表查；查不到（如表未收录的新题）再搜索 "leetcode <题号>" 确认；猜错的 slug 返回 `question: null`。
- GraphQL 可用字段以以上 query 为准。`titleCn`、`langCode`、`questionList` 等字段不存在；参数名是 `titleSlug` 而非 `questionId`。
- 标签字段是 `topicTags { name }`（英文名），没有 `nameTranslated`。
- `translatedContent` 是 HTML（含 `&nbsp;`/`<code>`/`<sup>` 等），写题解前需去标签转纯文本。
- 偶发返回阿里系反爬 HTML 页面（不是 JSON，`json.loads` 会报 `JSONDecodeError`），属正常反爬，稍后重试即可；解析前先判断响应是否为合法 JSON。

**付费题处理（`isPaidOnly: true`）**：此时 `translatedContent` 返回 `null`，属预期行为，**不要反复重试抓取题面**。改为：

1. 用 `jsonExampleTestcases` + `hints` + 相似题信息重建题意；
2. 在题解「题目概述」开头加醒目标注：

  `> ⚠️ 本题为 LeetCode 付费题，题意描述根据官方示例用例与 hints 重建，可能与官方题面有出入。`

## 2. 目录组织

所有每日题解**必须写在** `leetcode/solution/` **下**，按**题号区间**组织（每 100 题一个目录），**不按难度分目录**。题目的「简单/中等/困难」仅作为元信息写在题解头部，不决定目录归属。

```
leetcode/solution/
├── 0001-0100/                     # 题号 1-100
│   ├── 1_两数之和.md              # 题解主体（文件名 = 题号_题目中文名）
│   ├── 42_接雨水.md
│   ├── 70_爬楼梯.md
│   └── ...
├── 0101-0200/                     # 题号 101-200
│   ├── 146_LRU缓存.md
│   ├── 200_岛屿数量.md
│   └── ...
├── 0201-0300/                     # 题号 201-300
│   ├── 206_反转链表.md
│   ├── 239_滑动窗口最大值.md
│   └── ...
├── ...
├── 1001-1100/                     # 题号 1001-1100
│   └── 1011_在D天内送达包裹的能力.md
├── 1101-1200/                     # 题号 1101-1200
│   └── 1143_最长公共子序列.md
├── images/                        # ⭐ 所有题解的 SVG 插图统一存放于此（全库共享）
├── INDEX.md                       # 已写题解标签索引（从 1.2 迁出，仅检索用，不参与选题）
└── SKILL.md                       # 本文件
```

**规则**：

1. **题解根目录**：`leetcode/solution/`，不要写到 `leetcode/` 根下或其它位置。
2. **区间目录**：按题号每 100 题一个目录，命名 `<起点>-<终点>`（4 位零填充）。题号 `N` 所属区间为 `((N-1)//100)*100+1` 到 `((N-1)//100)*100+100`。例：`1~100` → `0001-0100`，`101~200` → `0101-0200`，`1001~1100` → `1001-1100`，`1143` → `1101-1200`。区间目录内**只放 `.md` 题解**，不放图片。
3. **题解文件名**：`<题号>_<题目中文名>.md`（如 `42_接雨水.md`、`53_最大子数组和.md`），与文档一级标题一致。
4. **图片目录（统一）**：所有题解的 SVG 插图**统一存放**在 `leetcode/solution/images/`，**不在各区间目录下再建 `images/`**。图片文件名必须带题号前缀避免重名冲突（如 `p42_trap_water_column.svg`，见 4.3 节）。题解中引用用相对路径 `../images/<filename>.svg`（从区间目录上一级取）。
5. **难度不参与归类**：题目难度仅写在题解头部的 `**难度**：简单/中等/困难`，目录一律按题号区间归档，便于按号检索与补全。

> 💡 **选题 vs 归档**：第 1 节强调「按题号顺序补全」——这是**选题策略**（用 1.3 的脚本实时扫描出最小缺号开始写）；本节「按题号区间归档」是**存储结构**。二者天然一致：选题按序号、归档也按序号区间，写完一题自然落入对应区间目录。

## 3. 题解文档结构

每篇题解 `.md` 遵循固定章节顺序（对齐 leetgpu 题解样式，参考 `0001-0100` 区间下的 `42_接雨水.md`、`53_最大子数组和.md`、`3_无重复字符的最长子串.md`）：

```markdown
# LeetCode <题目中文名> 题解

## 1. 题目概述

- **标题 / 题号**：<题目中文名>（#<题号>，easy / medium / hard）
- **链接**：https://leetcode.cn/problems/<slug>/
- **难度**：简单 / 中等 / 困难
- **标签**：<算法标签，逗号分隔>

**题意**：（题意描述，首段以 `**题意**：` 加粗标签开头）

**示例 1**：
（```text 代码块给出输入/输出/解释，按需 1-3 个示例）

**约束**：
（数据范围，逐条列出）

## 2. 解题思路
### 2.1 暴力思路
### 2.2 核心观察：<最优解法名>        ← 配 SVG 图
### 2.3 算法流程图                     ← 配 SVG 图
### 2.4 示例演算                       ← 配 SVG 图（可选）

## 3. 参考代码
### C++
### Python

## 4. 复杂度分析
（三列表格：维度 / 复杂度 / 说明）

## 5. 扩展：<进阶解法或变体>（可选）

## 6. 面试要点
（4-5 题 Q&A，问题加粗，答案缩进）

## 同类练习题

| # | 题目 | 与本题的关联 |
|---|------|-------------|
| <题号> | [<题名>](https://leetcode.cn/problems/<slug>/)（[题解](<题号>_<题名>.md)） | <一句话关联说明> |
```

**写作规范**：

- **中文为主**，概念加粗，善用 `> 💡` / `> ⚠️` blockquote。
- **一级标题固定为** `# LeetCode <题目中文名> 题解`；元信息四行（标题 / 题号、链接、难度、标签）放在 `## 1. 题目概述` **内部**，`链接` 用裸 URL（不用 `[N. 名](url)` 形式）。
- **章节之间不写 `---` 分隔线**（leetgpu 样式无分隔线，靠空行 + 标题分层）。
- 代码块标注语言：` ```cpp` / ` ```python` / ` ```text`。
- 图片引用用相对路径：`![<中文alt>](../images/<filename>.svg)`（题解在区间目录如 `0001-0100/` 下，图片统一在上一级 `solution/images/`）。
- 每篇题解默认引用 **2 张 SVG**（2.2 核心观察、2.3 算法流程图各一张）；2.4 示例演算配图可选，确有价值再加，**全篇最多 3 张**——手写 SVG 是题解生成的主要耗时项，不要为凑数多画。
- alt 文本用中文。
- **「同类练习题」**（不编号的末节）列出 3-5 道同套路题目，**表格格式** `| # | 题目 | 与本题的关联 |`：`#` 为题号，`题目` 为 `[题名](url)`（站内有题解时附 `（[题解](<题号>_<题名>.md)）`），`与本题的关联` 为一句话说明。帮助读者举一反三。⚠️ **URL 的 slug 必须与题号真实对应，禁止凭记忆拼 URL**（曾出现题号与 slug 张冠李戴的幻觉链接）；不确定 slug 时用 1.4 的 GraphQL recipe 查 `questionFrontendId` 核对；批量并发场景可在整批写完后统一核对一轮，不必每题单独发请求。

### 数学公式

- 行内公式用 `$...$`，块级公式用 `$$...$$`
- **禁止**用反引号 `` `...` `` 包裹数学公式，否则会被渲染为等宽代码，KaTeX 不会识别
- 公式内函数/运算符使用 LaTeX 命令：`\exp`、`\log`、`\sum`、`\max`、`\frac`、`\sqrt`，避免直接写 `exp`、`log`、`Σ`、`√`


## 4. 图片风格：手绘 sketch 风（Excalidraw-like）

**所有插图统一为手绘 sketch 风**，追求"轻松白板涂鸦"的直观感，避免冰冷完美的矢量感。具体要求：

- **禁止 ASCII 图片**：所有示意图、流程图、架构图一律用 SVG，不要在 Markdown 中嵌入 ASCII 字符画（如用 `+---+`、`|   |` 拼成的表格或流程图）

### 4.1 视觉特征

| 维度 | 要求 |
|------|------|
| **线条** | 手绘不均匀、略带抖动，避免完美直线或圆润矢量边 |
| **笔触** | 粗糙、类似马克笔/铅笔描边，线宽可略有变化 |
| **配色** | 极简，一般不超过 3-4 种柔和颜色（蓝 `#e8f0fe`/`#446688`、绿 `#e6f4ea`/`#4a7a3a`、橙 `#fff8e1`/`#d6a040`、红 `#fce4ec`/`#b85450`），背景白色或米白 `#fafafa` |
| **形状** | 简单几何块——矩形、网格、箭头、圆角框，不画复杂 3D 或写实元素 |
| **标签** | 手写感字体：英文用 `Comic Sans MS` / `Bradley Hand`，CJK 用 `Kaiti SC` / 楷体 |
| **整体感觉** | 轻松白板涂鸦，标注随意、轻微错位也无妨，优先可读性和直观性 |

### 4.2 SVG 实现技法（仓库统一用法）

用 SVG 滤镜 `feTurbulence` + `feDisplacementMap` 给所有图形叠加轻微抖动，实现手绘效果。**每张 SVG 顶部固定引入以下** `<defs>`：

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 360"
     font-family="'Comic Sans MS', 'Segoe UI', 'Kaiti SC', 楷体, cursive">
  <defs>
    <filter id="rough">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3"/>
      <feDisplacementMap in="SourceGraphic" scale="2"/>
    </filter>
    <filter id="rough2">
      <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="7"/>
      <feDisplacementMap in="SourceGraphic" scale="1.5"/>
    </filter>
  </defs>

  <rect width="520" height="360" fill="#fafafa"/>

  <!-- 所有矩形/路径/文本都加 filter="url(#rough2)" -->
  <rect x="80" y="48" width="50" height="30" fill="#e8f0fe"
        stroke="#446688" stroke-width="1.5" rx="4" filter="url(#rough2)"/>
  <text x="105" y="68" text-anchor="middle" font-size="12" fill="#333">−2</text>
  ...
</svg>
```

**要点**：

- `font-family` 必须包含 `'Comic Sans MS'` 和 `'Kaiti SC', 楷体`，保证中英文都有手写感。
- 每个图形元素（`rect`/`path`/`text`/`ellipse`/`polygon`）都加 `filter="url(#rough2)"`。
- 圆角矩形用 `rx="4"`（普通格子）或 `rx="8"`~`10`（说明框）。
- 强调元素用更粗的 `stroke-width`（2~2.5）和红色/橙色填充。
- 箭头用 `<marker id="arr">` 定义，`<path>` 引用 `marker-end="url(#arr)"`。

### 4.3 SVG 命名

全小写 + 下划线，语义化。**前缀必须带题号**（格式 `p<题号>_<语义>`），不得只用 `map_`、`filter_` 这类泛化前缀——`images/` 是全库共享目录，泛化前缀极易与其他题目撞名：

- `p42_trap_water_column.svg`、`p42_trap_two_pointers.svg`（接雨水）
- `p53_maxsubarray_kadane.svg`、`p53_maxsubarray_algorithm_flow.svg`（最大子数组和）
- `p3_lswrc_sliding_window.svg`、`p3_lswrc_algorithm_flow.svg`（无重复字符的最长子串）
- 反例：`map_concept.svg`、`filter_algorithm_flow.svg`（前缀无题号，禁止）

### 4.4 常见图类型

| 图类型 | 用途 | 示例 |
|--------|------|------|
| **概念图** | 直观展示核心观察（窗口、状态转移、水位） | `lswrc_sliding_window.svg` |
| **流程图** | 决策菱形 + 矩形框 + 箭头，展示算法步骤 | `lswrc_algorithm_flow.svg` |
| **演算表** | 逐步表格展示示例执行过程 | `lswrc_example_walkthrough.svg` |
| **对比图** | 多行格子对比数据变化（如 dp 数组） | `maxsubarray_kadane_v2.svg` |

## 5. 网站构建集成

题解写完后会被 `leetcode/build.py` 自动读取并生成网页：

- `build.py` 递归扫描 `leetcode/` 下所有 `.md`（排除 `public/`、`static/`、`images/`、`build/`、`.git` 等，并跳过 `SKILL.md` 与 `INDEX.md`）。
- 解析一级标题 `# LeetCode <title> 题解` 作为页面标题；侧边栏与列表页会去掉 `LeetCode ` 前缀与 ` 题解` 后缀显示短标题。难度/标签元信息行保留在正文中渲染，同时提取为页头徽章。
- **图片**：题解 SVG 统一存放在 `leetcode/solution/images/`。`build.py` 会把 `leetcode/images/`（顶层，供周赛等共用）与 `leetcode/solution/images/`（题解专用）一并复制到 `public/images/`。题解中引用的 `../images/xxx.svg` 在题解页（平铺于 `public/problems/`）原样保留，解析到 `public/images/xxx.svg`。
- **分组**：侧边栏「每日一题」与列表页均按**题号区间**分组（标签如 `1-100`、`101-200`…，由区间目录名生成），区间内按文件名（题号）排序。
- **重要**：新增 SVG 直接放入 `leetcode/solution/images/` 即可，构建会自动收集，无需再额外同步到其它目录。

**验证命令**（在 `leetcode/` 目录下运行）：

```bash
python3 build.py 2>&1 | tail -20   # 构建全站到 public/，只看末尾输出（全量输出 3000+ 行、耗时约 1 分钟（2026-08 实测），不截断会刷屏撑爆日志）
```

**批量并发场景（如 `cannbot_hello.sh` 多线程写题）**：

- **构建与 git 提交推送由外层脚本统一处理**，单题线程写出题解与 SVG 即可，**不要执行 `git commit` / `git push`**。
- 构建尽量串行：多个线程并发全量 `build.py` 会同时写同一 `public/` 目录，有竞态风险；若无法避免，至少错开时间或只跑一次。

**自检清单**：

- [ ] 题解位于 `leetcode/solution/<题号区间>/<题号>_<题目名>.md`，区间目录如 `0001-0100`
- [ ] 一级标题 `# LeetCode <题目中文名> 题解` 与文件名中题目名一致，元信息四行在 `## 1. 题目概述` 内部（leetgpu 样式），章节间无 `---` 分隔线
- [ ] 含 2 张 SVG 插图（2.2/2.3 各一张；2.4 可选，全篇最多 3 张），引用格式 `![中文alt](../images/xxx.svg)`，SVG 放在 `leetcode/solution/images/`，文件名带题号前缀（如 `p42_xxx.svg`）
- [ ] SVG 为手绘 sketch 风（含 `feTurbulence` 抖动滤镜 + Comic Sans/Kaiti SC 字体）
- [ ] 「同类练习题」的 URL slug 与题号真实对应（用 1.4 的 recipe 核对；批量并发场景可整批结束后统一核对）
- [ ] 付费题已在「题目概述」开头标注题意重建说明（见 1.4）
- [ ] 单题场景：运行 `python3 build.py` 成功生成对应 `public/problems/<slug>.html`（全量构建约 1 分钟）；批量并发场景跳过本项，由外层脚本统一构建验证
- [ ] `git push origin` 推送题解（单题场景 commit + push 到远程；批量并发场景由外层脚本统一提交，单题线程跳过本项）
