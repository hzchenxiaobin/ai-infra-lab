# content-kit — 内容管线与内容开发工作流

> `packages/content-kit` + `packages/content`：内容的"编译器"与"源码库"。
> 吸收四个仓库已有的内容工程能力（ai-infra-notes 的 lint 脚本、leetcode/leetgpu 的
> SKILL.md 规范、interview 的 LLM 抽题管线），统一为构建期管线。元数据规范见
> [03 数据模型](../03-data-model.md#统一内容元数据frontmatter)，同步管线总图见
> [03 §内容→数据库同步管线](../03-data-model.md#内容--数据库同步管线)。

## 1. 目录结构

```
packages/
├── content/                # 内容库（全部 Markdown + frontmatter，Git 是唯一事实来源）
│   ├── learn/              # ← ai-infra-notes：daily/ topics/ paper/ profiling/
│   ├── problems-gpu/       # ← leetgpu solutions（含同名 .cu）
│   ├── problems-algo/      # ← leetcode solution/ contest/ topics/ hot-interview 等
│   └── assets/             # 全部 SVG 插图，按内容 ID 命名空间分目录
└── content-kit/
    ├── src/
    │   ├── frontmatter.ts  # frontmatter zod schema + 解析
    │   ├── ids.ts          # 统一 ID 解析/校验/alias 表
    │   ├── lint/           # 各类检查器（见 §4）
    │   ├── assets.ts       # 图片引用收集、SVGO 调用、URL 重写
    │   ├── sync-db.ts      # 内容 → contents/problems 幂等 upsert
    │   ├── search-index.ts # 静态搜索索引导出
    │   ├── stats.ts        # 构建期统计注入（题数/周数等）
    │   └── bank/           # LLM 抽题管线（拷自 interview scripts/）
    ├── skills/             # SKILL.md 写作规范（拷自三仓库，见 §8）
    └── package.json        # lint / sync / index / stats 等 npm scripts
```

lint 检查器用 Python 还是 TS：ai-infra-notes 的 `check_course.py` / `lint_md_code.py`
是 Python，**逻辑抽进 content-kit 时用 TS 重写**（与管线同语言，CI 免装 Python 依赖；
原脚本退役不拷）。06 环境准备里的 Python ≥ 3.10 仅为迁移期一次性脚本与 cannbot 准备。

## 2. frontmatter 规范与校验

schema 全文见 [03](../03-data-model.md#统一内容元数据frontmatter)。content-kit 侧要点：

- zod schema 按 `type` 分判别联合（learn/problem/paper/profiling 各有附加必填字段），
  **缺一个必填字段 lint 即失败**——沿用 ai-infra-notes"检查失败即中止"的做法，
  禁止 warnings-only 模式。
- `id` 全局唯一性在 lint 时全量查重；`knowledge_points` 必须在受控词表
  （`knowledge_points` 表 / 词表文件）内，防止标签自由发散。
- `related_problems` / `related_learn` 的对称性构建期校验：A 引用了 B，B 缺反向引用时
  报错或自动补齐（单向维护、构建期补对称，03 已注明可由 learn 侧单向维护）。
- `paper` 的 `status: skeleton` 显式标注空骨架（18 篇待补），列表页据此展示完成度。

## 3. 统一 ID 方案

规则全文见 [03](../03-data-model.md#统一题目-id-方案)。实现要点：

| ID 形态 | 示例 | 真相来源 |
|---|---|---|
| `lc:{题号}` | `lc:0001` | LeetCode 官方题号，天然唯一 |
| `lc:contest:{场次}q{n}` | `lc:contest:518q3` | 周赛目录 + Q 号 |
| `gpu:{e\|m\|h}:{目录序号}` | `gpu:m:007` | **目录序号是唯一真相**；leetgpu.com 官方题号只是展示字段（解决 #109/#110/#113/#114 错位） |
| `q:{category}:{hash}` | `q:cuda:a3f9…` | 面试题，沿用 interview sourceKey |
| `learn:w{周}d{天}` / `learn:topic:{slug}` | `learn:w03d02` | daily 目录 / topics 目录 |
| `paper:{slug}` | `paper:flash-attention-2` | 论文目录 |

- `ids.ts` 提供 `parseId / formatId / validateId`，所有管线代码经它解析，不手拼字符串。
- 旧 ID（leetgpu 正文里的 `#109` 等）迁移时一次性映射，content-kit 维护 alias 表；
  新仓库无历史 URL 包袱，旧编号只在内容展示层出现（04 编号修正）。

## 4. lint（质量门，失败即构建失败）

`pnpm --filter content-kit lint`，吸收来源与检查项：

| 检查 | 来源 | 说明 |
|---|---|---|
| frontmatter 结构 | ai-infra-notes check_course.py 思路 + 新增 zod | 必填字段、枚举值、日期格式 |
| 重复标题 | check_course.py | 同分区标题查重 |
| 悬空链接 | check_course.py | 站内链接/统一 ID 引用必须能解析到存在的内容 |
| 图片引用完整性 | 新增（替代 leetcode 的缺失图片容忍插件） | 引用的 assets 文件必须存在；未引用的孤儿图片告警 |
| 陈旧口径 | check_course.py | "共 N 题""8 周/56 天"等手写统计与构建期实际统计比对 |
| 模板结构 | leetgpu/leetcode/ai-infra-notes SKILL.md | GPU 题解 6 段式、每日教程 8 段骨架、论文 17 节骨架的标题序列检查 |
| ID 规范 | 新增 | 目录名 ↔ frontmatter id 一致性；GPU 题目录序号连续性 |

CI 必跑；**禁止绕过**（06 内容工作流 §4）。lint 即内容侧的测试（06 §7）。

## 5. 图片规范

- 存放：`packages/content/assets/<内容ID命名空间>/`（如 `assets/lc/0001/xxx.svg`），
  命名空间与内容 ID 前缀对齐，迁移期跨仓库去重（04 去重矩阵：三仓库共 ~1.3 万张）。
- **新增 SVG 先过 SVGO**（Excalidraw 的 feTurbulence SVG 通常可压 30–60%）；
  content-kit 提供 `assets:optimize` 脚本，CI 校验"已压缩"状态。
- 正文引用用**内容 ID 相对路径**（如 `./assets/...` 或 ID 引用），最终 URL 由
  content-kit 构建期重写——这是图片存储方案一（Git 直存 + 打进 docs 镜像）→
  方案四（宿主机卷挂载）切换的保险，切换不改任何内容文件（04 主要风险）。
- 禁止站点根绝对路径（`/leetgpu/images/...`）与 base path 硬编码（04 口径修正 §3）。

## 6. 内容 → DB 同步

`pnpm --filter content-kit sync`：

- `contents` / `problems` 表以**统一 ID 为主键 + contentHash 判变更**幂等 upsert，
  沿用 interview 的 sourceKey/contentHash 模式（实现范本见
  [server](server.md#7-关键实现题库幂等入库sourcekey--contenthash)）。
- 源里消失的内容标 `status='stale'`，**不物理删除**（保护 user_progress 与历史引用）。
- 同步时机：docs 构建期（CI）执行，产物（元数据 JSON）随构建输出；server 启动时
  或经 `cli content:sync` 导入。
- **内容正文不入库**：只同步元数据与索引（02 关键取舍）。

## 7. 搜索索引导出

- 构建期生成静态索引（Pagefind 或 miniSearch，02 §1 选型）+ 元数据 JSON，
  产物托管在 server，web `/search` 页查询——规避"分批构建必须关 VitePress 本地搜索"
  的限制（见 [content-site](content-site.md#3-大规模构建纪律必须保留)）。
- 索引入库内容：标题 + 正文纯文本（剔除代码块，leetcode 已有 `_render` 裁剪经验）+
  统一 ID + URL + tags/knowledge_points（支持筛选）。
- 中文分词沿用 bigram 方案（leetcode config.mts 的 tokenize 函数拷入）。

## 8. SKILL.md 写作规范（AI 产内容）

拷入三仓库的 SKILL.md 到 `packages/content-kit/skills/`，作为 AI 产内容的契约：

| 规范 | 来源 | 要点 |
|---|---|---|
| 每日教程 8 段骨架 | ai-infra-notes `aiinfra/daily/SKILL.md` | 含"面试要点"段；末尾配套练习用 frontmatter `related_problems` |
| 专题写作 | ai-infra-notes `aiinfra/topics/SKILL.md` | 知识点综述，题目清单改统一 ID 链接 |
| 论文 17 节 Reviewer 骨架 | ai-infra-notes `aiinfra/paper/SKILL.md` | `status: skeleton/done` 管理完成度 |
| GPU 题解 6 段式 | leetgpu `SKILL.md` | 题面→思路→代码→复杂度→ncu 分析→面试要点；同名 `.cu` 可编译 |
| 算法题解 | leetcode `solution/SKILL.md`、`contest/SKILL.md` | 题号命名、示例用例格式（judge 解析依赖） |

**SKILL.md 与 lint 同源**：模板结构检查器按 SKILL.md 的骨架定义实现，改了骨架
要同步改检查器。SKILL.md 文件本身进 `srcExclude`，不参与 docs 构建。

## 9. LLM 抽题管线与 cannbot 产题

- **LLM 抽题**：interview 的 `bank:generate`（逐文件调 LLM 抽结构化题目 → 静态 JSON，
  断点续跑）拷入 `bank/`，推广到全部 learn 内容；幂等键含 knowledge_points（03）。
  产出 JSON 经 `cli bank:import` 入库，导入环节不再调 LLM。
- **cannbot 批量产题**：leetcode 的 `cannbot_hello.sh` 模式（预分配互不相同的题号 →
  并发跑 cannbot + SKILL.md）拷入 content-kit 下运行；ai-infra-notes 的
  `cannbot_ascii_to_svg.sh` / `cannbot_correct.sh` / `cannbot_optimize_svg.sh`
  等辅助脚本一并拷入。拷贝时确认外部依赖（cannbot 工具、LLM 凭据、定时任务）在新
  环境可用（04 主要风险剩余注意点）。
- **周赛更新只在本仓库进行**（原仓库已停更，2026-09 决策）：每周新周赛题解走
  cannbot + `contest/SKILL.md` 流程，lint 全绿后合入。

## 10. 内容开发工作流（写内容 = 写代码）

1. 在 `packages/content/` 对应分区建 md，frontmatter 必填项一次写全（见 §2）。
2. 图片放 assets 对应命名空间，过 SVGO（见 §5）。
3. `pnpm --filter content-kit lint` 全绿。
4. 统计数字禁止手写，用 `stats` 注入（历史教训见 04 口径修正）。
5. 提 PR（`content:` 前缀 conventional commit）；CI 跑 lint + 分区构建 +
   sync 产物校验；合并后由部署流程发布（见 [deployment](deployment.md)）。
