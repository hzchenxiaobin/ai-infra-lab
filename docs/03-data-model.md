# 03 数据模型与元数据规范

数据层是融合的枢纽：**闭环功能（进度、掌握度、推荐、统一搜索）全部依赖统一的内容元数据和统一题目 ID**。

## 统一内容元数据（frontmatter）

当前三个内容仓库的 md 均无统一 frontmatter（leetgpu 靠目录约定 + `**标签**` 行提取）。融合后所有内容文件必须携带 frontmatter，由 content-kit 在构建期校验（缺字段即构建失败，沿用 ai-infra-notes "检查失败即中止"的做法）。

```yaml
---
# ── 通用字段（所有内容必填）──
id: "learn:w03d02"            # 统一 ID，全局唯一，见下节
type: learn | problem | paper | profiling
title: "Memory Coalescing 与 Bank Conflict"
tags: [cuda, memory, bank-conflict]
knowledge_points: [memory-coalescing, bank-conflict]   # 知识点标签，闭环的数据基础
updated: 2026-09-01

# ── type: learn ──
week: 3                        # 1-10
day: 2                         # 1-7
topic: cuda                    # 专题 slug（与 week/day 二选一或并存）
related_problems: ["gpu:m:007", "lc:0001"]   # 配套练习（替代现有的"文档里的映射表"）
related_questions: ["q:cuda:123"]            # 关联面试题

# ── type: problem ──
source: leetcode | leetgpu | contest
number: 1                      # 原始题号
difficulty: easy | medium | hard
languages: [cpp, python, cuda]
judge: internal | leetgpu-com | none         # 评测方式
related_learn: ["learn:w03d02"]              # 反向引用（可由 learn 侧单向维护、构建期校验对称性）

# ── type: paper ──
venue: "NeurIPS 2017"
status: done | skeleton        # paper 有 18 篇空骨架，需显式标注
---
```

**知识点标签（knowledge_points）** 是闭环的最小粒度：内容、题目、面试题都挂同一套标签，掌握度模型才有公共坐标系。初版标签集从三处合并：leetgpu 知识领域地图（A–H 八大类）、ai-infra-notes 的 18 专题 + 10 周主题、leetcode 的标签体系（数组/DP/图论等），由 content-kit 维护一份受控词表。

## 统一题目 ID 方案

解决两个问题：leetgpu 自编号与官方编号错位（#109/#110/#113/#114 冲突）；跨仓库引用无稳定锚点。

```
格式：{分区}:{难度/来源}:{序号}       示例
─────────────────────────────────────────────
lc:{题号}                             lc:0001          算法题（LeetCode 官方题号，天然唯一）
lc:contest:{场次}q{n}                 lc:contest:518q3 周赛题
gpu:{e|m|h}:{目录序号}                gpu:m:007        GPU 题（以 solutions/<难度>/ 目录名为准）
q:{category}:{hash}                   q:cuda:a3f9…     面试题（沿用 interview 的 sourceKey）
learn:w{周}d{天} / learn:topic:{slug} learn:w03d02     学习内容
paper:{slug}                          paper:flash-attention-2
```

- GPU 题一律以**目录序号**为 ID 真相（`solutions/medium/007-xxx/`），正文里再标注 leetgpu.com 官方题号（解决错位问题：错位的是"标注"，不再是"标识"）。
- 旧 ID（如 leetgpu 正文里的 `#109`）在迁移时一次性映射，content-kit 维护 alias 表，旧链接 301。

## 数据库设计

在 interview 现有 schema（题库 questions、面试场次/消息/报告、用户）基础上扩展。对外多用户产品定位下，users 从"本地单用户自动 provision"改为正式账号体系：

```
users                 # 正式账号（替代 interview 的单用户 provision）；邮箱注册为主（2026-09 决策）
  id  email  password_hash  email_verified  name  avatar  tier (free/pro)  created_at
oauth_identities      # OAuth 登录（GitHub/Google，可选增强预留），user_id 外键
  provider  provider_account_id  user_id
email_verifications   # 注册验证码（邮箱验证 + 发送限流依据）
  email  code_hash  expires_at  attempts  created_at
usage_quotas          # 配额与用量（评测提交、LLM 面试）；quota 为 NULL 表示不限额
                      # （上线初期默认不限，2026-09 决策，后续改配置开启分层）
  user_id  kind (judge|interview)  period  used  quota
```

**内容正文不入库**（见 02 架构），以下只列其余新增/变更：

```
contents               # 内容元数据（构建期从 frontmatter 同步，contentHash 幂等）
  id (统一ID, PK)      type  title  tags(json)  knowledge_points(json)
  url (docs 站路径)    content_hash  status  updated_at

problems               # 题目元数据（contents 的 type=problem 子集，单列以便评测字段）
  id (PK, FK→contents) source  number  difficulty  languages(json)
  judge_type           testcases(json, 内置评测的用例)  external_url (跳转评测地址)

user_progress          # 学习/刷题进度（每用户 × 每内容/题目 一行）
  user_id  content_id  status (unseen/seen/mastered/ac)
  score    last_at     UNIQUE(user_id, content_id)

submissions            # 评测提交（judge-worker 的任务队列也是它）
  id  user_id  problem_id  language  code
  status (pending/running/ac/wa/ce/tle/mle)  verdict_detail(json)
  runtime_ms  memory_kb  created_at

questions              # 面试题库（已存在，729 题；补 knowledge_points 列）
                       # user_id NULL = 全站共享内置题（bank:/seed:），否则为用户私有手工题
interview_sessions     # 面试场次（已存在；补 scope 快照关联 knowledge_points）
interview_reports      # 评估报告（已存在；新增 weak_points → knowledge_points 映射列）

knowledge_points       # 知识点受控词表
  id (slug, PK)  name  category (gpu/algo/system/cpp/...)  description
```

### 掌握度模型（v1，刻意从简）

每个 (user, knowledge_point) 的掌握度由三路信号加权：

```
mastery = 0.2 × 学习信号   （相关 learn 内容 seen/mastered 比例）
        + 0.5 × 刷题信号   （相关题目 AC 比例，按难度加权 hard=3/medium=2/easy=1）
        + 0.3 × 面试信号   （相关面试题最近得分归一化）
```

驱动两个产品功能：Dashboard 能力雷达图；面试报告薄弱点 → 推荐学习章节/练习题。
v1 用 SQL 聚合实现即可，不引入独立推荐服务。

## 内容 → 数据库同步管线

```
packages/content/**/*.md
        │  content-kit: 解析 frontmatter + 校验 + 结构 lint
        ▼
  ┌─────────────┐   contents/problems 表（id + contentHash 幂等 upsert，
  │  db 同步     │   沿用 interview sourceKey/contentHash 模式，失效标 stale）
  └──────┬──────┘
         ├─→ 搜索索引导出（Pagefind/miniSearch 静态索引 + 元数据 JSON）
         └─→ 题库生成（LLM 从 learn 内容抽面试题 → questions 表，
                       沿用 interview bank:generate，幂等键含 knowledge_points）
```

- **同步时机**：docs 构建期（CI）执行，同步产物随构建输出；server 启动时或经 CLI 导入。
- **幂等与去重**：以统一 ID 为主键，contentHash 判变更；跨仓库同源内容（leetgpu ↔ ai-infra-notes 重叠部分）在快照拷入时只保留一份（见 04-migration 去重矩阵）。
- **质量门**：frontmatter 校验、链接有效性、口径一致性（如"10 周"字样）全部构建期失败即中止，替代目前散落各仓库的 lint 脚本。
