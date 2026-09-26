---
id: "learn:topic:nano-vllm:code:scheduler"
type: learn
title: "Scheduler 源码解读：92 行跑通 Continuous Batching"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, continuous-batching, scheduler, preemption, chunked-prefill, prefix-caching]
updated: 2026-09-26
topic: nano-vllm
related_problems: []
related_questions: []
---

# Scheduler 源码解读：92 行跑通 Continuous Batching

> **源码**：[scheduler.py](scheduler.py)（92 行，逐行引用在正文中）
> **在专题中的位置**：[Day 2](../day2.md) 讲了 `step()` 的三段式骨架，[Day 3](../day3.md) 讲了 BlockManager 这颗"心脏"，今天把两者接在一起——**调度器的每个决策，本质都是在问 BlockManager 一个问题**
> **一句话定位**：Scheduler 是 nano-vllm 的"操作系统调度器"——两条队列 + 一位块管家，决定了每一步 GPU 上跑的是什么

---

## 🎯 目标

通过本文，你将：

1. 逐行读懂 `schedule()` 的 **prefill / decode 双路径**，包括每个 `break` 背后的设计意图
2. 理解三大机制如何在 92 行内共存：**continuous batching**、**chunked prefill**、**recompute 抢占**
3. 弄清 `postprocess()` 的四件事：登记哈希、推进计数、追加 token、判定结束
4. 掌握三个"魔鬼细节"：`can_append` 里 `% block_size == 1` 的秘密、`while...else` 的抢占控制流、`extendleft(reversed(...))` 的保序放回
5. 能手推一个多请求调度的完整数字例子，并说清 nano 的 prefill-first 与 vLLM V1 混批的取舍

> 💡 **前置知识**：[Day 2](../day2.md) 的 `Sequence` 三个数字字段（`num_cached_tokens` / `num_scheduled_tokens` / `block_table`）、[Day 3](../day3.md) 的链式哈希与块引用计数
> ⚠️ **源码版本**：nano-vllm 官方仓库主分支（2025 版，含 chunked prefill 与 prefix caching）

---

## 为什么 Scheduler 值得精读

LLM 推理引擎的性能差异，一半在 kernel，另一半在调度。**同样的 GPU、同样的模型，调度策略不同，吞吐可以差数倍**。Scheduler 回答的核心问题是：

> 每一步 forward，批里放哪些序列？各放多少 token？

这 92 行里浓缩了 vLLM 的四个关键机制：

| 机制 | 一句话 | 对应代码 |
|------|--------|----------|
| Continuous Batching | 每步重组批：完成的走、新来的进，GPU 永不空转 | `schedule()` 每次从头扫描两条队列 |
| Prefill-first | 有 prefill 就先跑 prefill，decode 靠边站 | `if scheduled_seqs: return ..., True` |
| Chunked Prefill | prompt 超预算就切成多步算，避免长 prompt 独占 GPU 造成延迟尖刺 | `num_scheduled_tokens = min(num_tokens, remaining)` |
| Recompute 抢占 | decode 时显存不够，把队尾序列"打回原形"重新 prefill | `preempt()` |

> 💡 **一句话总结**：Scheduler 是一台状态机——输入是两条队列 + free 块数量，输出是"本步的批"，而所有状态转移都围绕 `num_cached_tokens` 这一个计数器展开。

---

## 全景：调度器在引擎中的位置

![Scheduler 全景：引擎每一步都从 schedule() 开始](assets/scheduler_engine_loop.svg)

[LLMEngine](../day2.md) 的 `generate()` 就是一个大循环（`llm_engine.py:73-86`）：

```python
while not self.is_finished():          # scheduler 两队列皆空
    output, num_tokens = self.step()   # 每步三段式
```

而 `step()` 的三段式（`llm_engine.py:49-55`）：

```python
def step(self):
    seqs, is_prefill = self.scheduler.schedule()          # ① 决策：本步跑谁
    num_tokens = sum(...) if is_prefill else -len(seqs)
    token_ids = self.model_runner.call("run", seqs, is_prefill)  # ② 执行：组批 forward
    self.scheduler.postprocess(seqs, token_ids, is_prefill)      # ③ 收尾：更新状态
```

注意三个约定：

- `schedule()` 返回 `(seqs, is_prefill)`——**本步是 prefill 批还是 decode 批，由调度器一锤定音**，且一步只可能是其中一种（nano 不做混批）
- `model_runner` 拿到序列后自己从 `seq.block_table` / `num_scheduled_tokens` 推导 `slot_mapping` 等张量（衔接 [Day 5](../day5.md)）
- `postprocess()` 拿到的 `token_ids` 与 `seqs` **按位置对齐**——每条序列恰好一个采样 token（decode 时用，prefill 中间 chunk 的直接丢弃）

---

## 数据结构：两条队列、一位管家、三个状态

### `__init__`：全部家当

```python
def __init__(self, config: Config):
    self.max_num_seqs = config.max_num_seqs                # 批内最大序列数（默认 512）
    self.max_num_batched_tokens = config.max_num_batched_tokens  # 一步 prefill 的 token 预算（默认 16384）
    self.eos = config.eos
    self.block_size = config.kvcache_block_size            # 256
    self.block_manager = BlockManager(config.num_kvcache_blocks, config.kvcache_block_size)
    self.waiting: deque[Sequence] = deque()                # 待 prefill
    self.running: deque[Sequence] = deque()                # decode 中
```

| 成员 | 角色 | 类比操作系统 |
|------|------|--------------|
| `waiting` | prefill 候选队列，FCFS | 就绪队列（等待 CPU） |
| `running` | decode 中的序列 | 运行队列 |
| `block_manager` | KV 块的分配/回收/哈希登记 | 内存管理器 + 页表 |
| `max_num_batched_tokens` | 一步 prefill 的 token 预算 | 时间片（按 token 计） |
| `max_num_seqs` | 批内序列数上限 | 最大并发进程数 |

两个小方法：

```python
def is_finished(self):
    return not self.waiting and not self.running   # 两队列皆空 → 整个 generate() 收工

def add(self, seq: Sequence):
    self.waiting.append(seq)                        # 新请求从右端进 waiting 队尾
```

### 状态机：Sequence 的一生

![Sequence 的状态机：一次请求的一生](assets/scheduler_sequence_states.svg)

三个状态（`SequenceStatus`）与两条队列**一一对应**：

| 状态 | 住在哪 | `is_prefill` | `block_table` | 何时离开 |
|------|--------|--------------|---------------|----------|
| `WAITING` | `waiting` | `True` | 空（未分配或被抢占清空） | prefill 全部算完 → `RUNNING` |
| `RUNNING` | `running` | `False` | 已建，KV 落在物理块 | EOS / `max_tokens` → `FINISHED` |
| `FINISHED` | 无队列 | — | 已 `deallocate` | 终态，等待上层取走结果 |

两个"不改状态但反复发生"的细节：

- **chunked prefill**：prompt 超预算时序列**留在 WAITING 队首**，但 `block_table` 已建——状态没变，"进度"却前进了
- **preempt 回退**：`RUNNING → WAITING` 的红弧线，唯一入口是 `preempt()`

---

## schedule()：每一步的决策核心

![schedule() 决策流程：prefill 优先，decode 兜底](assets/scheduler_flow.svg)

整个方法 49 行，分成**互斥的两条路径**：waiting 非空走 prefill，否则走 decode。先看骨架：

```python
def schedule(self) -> tuple[list[Sequence], bool]:
    scheduled_seqs = []
    num_batched_tokens = 0

    # prefill：从 waiting 尽量凑批
    while self.waiting and len(scheduled_seqs) < self.max_num_seqs:
        ...
    if scheduled_seqs:
        return scheduled_seqs, True        # ★ prefill 优先：凑出批就绝不跑 decode

    # decode：running 逐条调度
    while self.running and len(scheduled_seqs) < self.max_num_seqs:
        ...
    assert scheduled_seqs
    self.running.extendleft(reversed(scheduled_seqs))
    return scheduled_seqs, False
```

### prefill 路径逐行拆解

```python
while self.waiting and len(scheduled_seqs) < self.max_num_seqs:
    seq = self.waiting[0]                              # (1) 只看队首，不弹出
    remaining = self.max_num_batched_tokens - num_batched_tokens
    if remaining == 0:                                 # (2) 预算耗尽
        break
    if not seq.block_table:                            # (3) 首次调度 vs chunked 续算
        num_cached_blocks = self.block_manager.can_allocate(seq)
        if num_cached_blocks == -1:                    # (4) 空闲块装不下
            break
        num_tokens = seq.num_tokens - num_cached_blocks * self.block_size
    else:
        num_tokens = seq.num_tokens - seq.num_cached_tokens   # (5) 续算：只剩未算的
    if remaining < num_tokens and scheduled_seqs:      # (6) chunk 只许批内第一条
        break
    if not seq.block_table:
        self.block_manager.allocate(seq, num_cached_blocks)   # (7) 一次占满全部块
    seq.num_scheduled_tokens = min(num_tokens, remaining)     # (8) 截断点
    num_batched_tokens += seq.num_scheduled_tokens
    if seq.num_cached_tokens + seq.num_scheduled_tokens == seq.num_tokens:
        seq.status = SequenceStatus.RUNNING            # (9) 毕业：进 running
        self.waiting.popleft()
        self.running.append(seq)
    scheduled_seqs.append(seq)
```

**6 个分支的设计意图**：

**(1) `waiting[0]` 而非 `popleft()`**——先"试穿"再决定。只有 (9) 确认全部算完才真正出队；被 chunk 的序列留在队首，下一轮循环（或下一个 step）继续从它开始。这保证了 **FCFS 公平性**：队首没安排完，谁也别想插队。

**(3)(5) 用 `block_table` 是否为空区分两种情况**：
- 空 → 首次调度（或被抢占后重来）：先问 `can_allocate`——前缀缓存能命中几个满块 + 空闲块够不够装下剩余需求
- 非空 → chunked 续算：块早就分好了，`num_tokens` 就是"还没算的 token 数"

**(4) `can_allocate` 返回 `-1` 直接 `break`，而不是跳过队首试下一条**——这是一个容易被忽视的取舍。跳过队首能让批更满，但会造成**饥饿**：一条长序列永远排在后面。nano 选择"宁可批小，不可乱序"。

**(6) `remaining < num_tokens and scheduled_seqs`**——只允许**批内第一条**序列被 chunk：
- 第一条（`scheduled_seqs` 为空）：放行，由 (8) 截断
- 第二条开始：预算不够就 `break`，整条等下一批

为什么？如果允许多条同时 chunk，一个批里会有多个"半成品"，实现复杂度陡增（vLLM V1 为此设计了更精细的预算分配）。

**(7) 块的分配与计算解耦**：`allocate` 一次分配**整条序列**的所有块（命中块共享引用、其余从 free 池取），完全不看 token 预算。chunk 分的是"计算量"，不是"显存"。

**(8) `min(num_tokens, remaining)` 是 chunked prefill 的全部实现**——一行。若发生截断，(9) 的条件不成立，序列留在 waiting，`num_scheduled_tokens` 记住了本步算多少。

**(9) 毕业条件**：`num_cached_tokens + num_scheduled_tokens == num_tokens`——"已经算过的 + 本步要算的 == 总共要算的"。注意**缓存命中的 token 也计入**，所以命中前缀的序列可以直接毕业。

### decode 路径逐行拆解

```python
while self.running and len(scheduled_seqs) < self.max_num_seqs:
    seq = self.running.popleft()                       # (10) 队首最老优先
    while not self.block_manager.can_append(seq):      # (11) 写 1 个 token 的块够吗？
        if self.running:
            self.preempt(self.running.pop())           # (12) 抢占队尾，块回池后重试
        else:
            self.preempt(seq)                          # (13) 只剩自己：抢自己
            break
    else:                                              # while...else！
        seq.num_scheduled_tokens = 1
        seq.is_prefill = False
        self.block_manager.may_append(seq)             # (14) 跨块边界才真正扩块
        scheduled_seqs.append(seq)
assert scheduled_seqs
self.running.extendleft(reversed(scheduled_seqs))      # (15) 保序放回
```

**(11) `can_append` 的取巧判断**（`block_manager.py:103-104`）：

```python
def can_append(self, seq: Sequence) -> bool:
    return len(self.free_block_ids) >= (len(seq) % self.block_size == 1)
```

为什么是 `== 1` 而不是 `== 0`？关键在**时序**：decode 调度时刻，`seq.token_ids` 的最后一个 token 是上一步刚采样出来、**还没被 forward 计算**的——它是本步 forward 的输入。这个"待计算 token"位于 0-based 索引 `len(seq)-1`，落在块 `(len(seq)-1) // block_size`、块内偏移 `(len(seq)-1) % block_size`。偏移为 0（即 `len(seq) % block_size == 1`）意味着它要开新块。所以：

- `len(seq) % 256 == 1` → 需要 1 个空闲块
- 否则 → 写进现有块尾部，0 个空闲块就够

**(12) 抢占循环**：`can_append` 不通过时，从 running **队尾**（`pop()`）抢占别人释放块，然后回到 (11) 重试。抢队尾而不是队首：队尾序列进来最晚、生成的 token 最少，recompute 损失最小。

**(13) + `while...else`**：Python 的 `while...else` 中，`else` 在**循环条件为假（自然退出）时执行**，`break` 跳出则不执行。所以：
- 正常路径（`can_append` 通过）→ 进 `else`：调度该序列
- 抢占自己后 `break` → **跳过** `else`：该序列本批不调度（它已经回 waiting 了）

**(15) `extendleft(reversed(...))` 的保序**：循环中逐个 `popleft` 出来处理，处理完要**按原顺序**放回。`extendleft([a,b,c])` 会逆序插到左边，所以先 `reversed`。不保序的话，队首/队尾语义（谁先调度、谁先被抢）就乱了。

> ⚠️ **注意**：`assert scheduled_seqs` 是防御性断言。理论上存在死角——running 只剩一条序列且它独占了全部 KV 块时，抢占自己后批为空，断言会失败。实践中单序列不可能占满整个块池（`max_model_len` 限制了单序列块数），所以不可达；但这也说明**这段代码隐含假设"块池容量 >> 单序列需求"**。

---

## preempt()：抢占即"从头再来"

![抢占：free 块不足时，队尾为队首让路](assets/scheduler_preemption.svg)

```python
def preempt(self, seq: Sequence):
    seq.status = SequenceStatus.WAITING     # 变回待 prefill 的序列
    seq.is_prefill = True
    self.block_manager.deallocate(seq)      # 释放全部块（共享块只减引用计数）
    self.waiting.appendleft(seq)            # 塞回 waiting 队首
```

vLLM 的抢占有两种策略：**swap**（把 KV 搬到 CPU 内存）和 **recompute**（丢弃 KV，重新 prefill）。nano 选了 recompute，理由是简单——不需要 CPU 侧的 swap 缓冲区。

四行代码里藏着一个**止损彩蛋**：`deallocate` 把块放回 free 池，但**块的哈希登记并不会被清除**（只有块被新序列复用时 `_allocate_block` 才会清）。于是被抢占的序列重新 prefill 时，`can_allocate` 会查到**自己之前写满的块**——只要还没被别人复用，直接共享引用，`num_cached_tokens` 直接跳到命中位置。**recompute 抢占 + 前缀缓存 = 只重算"没写满的尾巴"**。

三个设计选择串成一条线：

| 选择 | 理由 |
|------|------|
| 抢队尾（`running.pop()`） | 队尾进度最浅，重算损失最小 |
| 塞队首（`waiting.appendleft()`） | 尽快恢复，减少该请求的尾延迟 |
| 从队首开始调度 | 保证最老的请求最后被抢（只剩自己才抢自己） |

---

## postprocess()：收尾四件事

```python
def postprocess(self, seqs: list[Sequence], token_ids: list[int], is_prefill: bool):
    for seq, token_id in zip(seqs, token_ids):
        self.block_manager.hash_blocks(seq)                    # ① 登记满块哈希
        seq.num_cached_tokens += seq.num_scheduled_tokens      # ② 推进进度计数器
        seq.num_scheduled_tokens = 0
        if is_prefill and seq.num_cached_tokens < seq.num_tokens:
            continue                                            # ③ chunked 中间步：到此为止
        seq.append_token(token_id)                              # ④ 追加采样 token
        if (not seq.ignore_eos and token_id == self.eos) or seq.num_completion_tokens == seq.max_tokens:
            seq.status = SequenceStatus.FINISHED
            self.block_manager.deallocate(seq)                 #    释放全部块
            self.running.remove(seq)                           #    出队
```

**① `hash_blocks` 在计数器推进之前调用**——这一点时序敏感：它登记的范围是 `[num_cached_tokens, num_cached_tokens + num_scheduled_tokens)` 内**恰好写满**的块（`block_manager.py:110-120`），用的正是"旧"的 `num_cached_tokens`。decode 每步只写 1 个 token，只有跨块边界那一步才会登记出一个满块。

**② 一行推进，两个计数器**：`num_cached_tokens` 的语义是"**已经写过 KV 的 token 数**"——prefill 命中的缓存、chunked 已算的部分、decode 已算的 token，全部由它统一记账。整个 Scheduler 的状态机就围着这一个数字转。

**③ chunked 中间步的 `continue`**：中间 chunk forward 出的 logits 对应的是 **prompt 内部 token**，不该进输出——直接丢弃，不追加、不判 EOS。只有最后一个 chunk 完成时（此时 `num_cached_tokens == num_tokens`），才用 logits 采样出**第一个生成 token**。

**④ 结束判据有两个**，用 `or` 连接：
- `token_id == eos`（且未设 `ignore_eos`）——自然结束
- `num_completion_tokens == max_tokens`——到达长度上限

结束后的清理顺序：先 `deallocate` 释放块（满块哈希留给后人命中），再 `running.remove(seq)` 出队。**注意 `remove` 是 O(n) 线性扫描**——512 条序列的队列上这只是常数开销，但在 vLLM 的规模上就需要更精细的数据结构了。

---

## 深挖：跟着数字走一遍

### 场景：一条 600 token 的长 prompt

![Chunked Prefill：长 prompt 分步计算，块却一次占满](assets/scheduler_chunked_prefill.svg)

设 `max_num_batched_tokens = 256`、`block_size = 256`、无前缀缓存命中：

| 步骤 | 进入循环时 | `block_table` | `num_tokens`（待算） | `num_scheduled_tokens` | 毕业判定 | 结局 |
|------|-----------|---------------|----------------------|------------------------|----------|------|
| step 1 | 预算 256 | 空 → `can_allocate`=0 | 600 − 0 = 600 | min(600, 256) = **256** | 0+256 ≠ 600 | 留 waiting，块0 已分配满 3 块 |
| step 2 | 预算 256（重置） | 非空 → 走续算分支 | 600 − 256 = 344 | min(344, 256) = **256** | 256+256 ≠ 600 | 仍留 waiting |
| step 3 | 预算 256 | 非空 | 600 − 512 = 88 | min(88, 256) = **88** | 512+88 == 600 ✓ | **RUNNING**，postprocess 采样出第 1 个生成 token |

三个数字的接力：`allocate` 一次给 3 块（显存）→ `num_scheduled_tokens` 分三步把计算铺开 → `num_cached_tokens` 0 → 256 → 512 → 600 记录进度。**KV 块的"占"与"算"是解耦的。**

### 场景：多请求并发 + 抢占

设 4 条请求 A/B/C/D 已在 running 中 decode，各生成了若干 token，此时 free 块耗尽：

1. `schedule()` 走 decode 路径：`popleft(A)` → `can_append(A)`：A 恰好要开新块但 free = 0 → 不通过
2. `running` 还有 [B, C, D] → `preempt(D)`：D 的块全部回池、状态 WAITING、塞回 waiting 队首
3. 重试 `can_append(A)`：free > 0 → 通过 → A 进批，`may_append(A)` 拿到新块
4. B、C 依次同样处理，批 = [A, B, C]，`extendleft(reversed(...))` 保序放回
5. 下一步 `schedule()`：waiting 非空（D 在队首）→ **走 prefill 路径**，D 重新调度：`can_allocate(D)` 查哈希表，命中自己之前写满的块 → 从命中点续算，尾部的损失被前缀缓存兜住

> 💡 **一句话总结**：抢占不是"推倒重来"，而是"以退为进"——队尾让出显存换队首继续跑，前缀缓存再把重算成本压到最低。

---

## 设计取舍：nano vs vLLM V1

| 维度 | nano-vllm | vLLM V1 |
|------|-----------|---------|
| prefill/decode 关系 | **互斥**：一步只有一种批 | **混批**（chunked prefill 与 decode 同批） |
| 调度策略 | prefill-first（TTFT 优先，decode 可能等待） | 默认带 fcfs/优先级可配置 |
| chunked prefill | 只许批内第一条 | 多请求共享 token 预算 |
| 抢占 | recompute-only，抢队尾 | recompute 为主，swap 已弱化 |
| 前缀缓存 | 满块链式哈希，调度时查询 | 同思想，工程化（异步、LRU 逐出等） |
| 队列实现 | `deque` + `running.remove` 线性扫 | 多级结构 + 索引 |

nano 砍掉的是**工程复杂度**，保住的是**机制骨架**——这正是它作为教学载体的价值：读懂这 92 行，再看 vLLM V1 的 scheduler 就只剩"工程加固"这一层新东西了。

---

## 常见误读

**❌ "prefill 时 token 预算不够就会抢占"**——抢占只发生在 **decode** 路径（`can_append` 失败）。prefill 遇到显存不足是 `can_allocate` 返回 -1 → 直接 `break`，等待自然释放，不会抢任何人。

**❌ "chunked prefill 会分步申请块"**——块在第一次调度时就**一次占满**（`allocate` 分配全部块），chunk 切分的是计算量。反例：若分步申请，中途被抢占的老序列会只持有半个前缀，前缀缓存命中的语义就碎了。

**❌ "`num_cached_tokens` 是前缀缓存命中的 token 数"**——它是"**已写过 KV 的 token 数**"这个更一般的概念：prefill 命中的缓存、chunked 已算的、decode 已算的，全在里面。只在 `allocate` 完成的那一刻，它恰好等于"缓存命中的 token 数"。

**❌ "被抢占的序列要全量重算"**——`deallocate` 不清哈希登记，重新 prefill 时 `can_allocate` 能命中自己之前写满的块，只重算未写满的尾部。

---

## 面试要点

**Q1：`schedule()` 为什么用 `waiting[0]` 而不是先 `popleft` 再决定？**

　　因为一条序列可能**一次调度不完**（chunked prefill 或预算不够）。只看队首、调度完成才出队，保证了 FCFS 顺序：队首没安排完，后面的序列不能插队——否则长请求会被短请求流饿死。

**Q2：`can_append` 里为什么是 `len(seq) % block_size == 1` 而不是 `== 0`？**

　　decode 调度时刻，序列的最后一个 token 是刚采样、**尚未计算**的，它才是本步 forward 的输入，要写 KV 的是它。它位于 0-based 索引 `len(seq)-1`，偏移 `(len(seq)-1) % block_size == 0`（即 `len(seq) % block_size == 1`）时开新块。判断的是"待计算 token"的位置，不是"已有序列长度"。

**Q3：`while...else` 在 decode 路径里起什么作用？**

　　`else` 在 while 条件自然为假时执行、`break` 时跳过。这里"通过 `can_append`"是自然退出 → 进 `else` 调度；"抢占自己后 break" → 跳过 `else`，该序列本批不调度。用控制流语法替代了一个 `scheduled` 标志位。

**Q4：抢占为什么抢队尾、塞队首？**

　　抢队尾：队尾序列生成进度最浅，recompute 损失最小；塞队首：`appendleft` 让它下一步最优先恢复，压尾延迟。配合"从队首开始 popleft"，最老请求最后被抢——整体是"保护老请求、牺牲新请求"的公平性设计。

**Q5：chunked prefill 中间步的采样结果去哪了？**

　　丢弃。中间 chunk 的 logits 对应 prompt 内部位置，不产生输出；`postprocess` 里 `if is_prefill and num_cached_tokens < num_tokens: continue` 跳过 append 和 EOS 判定。只有最后一个 chunk 的 logits 用于采样第一个生成 token。

**Q6：nano 的 prefill-first 有什么代价？vLLM V1 为什么改混批？**

　　prefill-first 下，只要 waiting 非空，decode 全部停摆——长 prompt 持续涌入时，已在生成的请求 token 间延迟（ITL）会周期性尖刺。混批把 chunked prefill 与 decode 放进同一次 forward，GPU 利用率与延迟平滑都更好，代价是调度和 kernel（变长批）实现更复杂。

---

## 小结

- **一图流**：`schedule()` = prefill 攒批（预算内、块够、只 chunk 第一条）→ 攒到了就返回；否则 decode 逐条调度（块不够抢队尾）→ 保序放回
- **一个计数器**：`num_cached_tokens` 统一记账"已算到哪"，prefill 命中、chunk 进度、decode 进度三态归一
- **一次解耦**：块的"占用"（`allocate` 一次占满）与计算的"铺开"（`num_scheduled_tokens` 分步）解耦——这是 chunked prefill 得以一行实现的前提
- **一条暗线**：preempt 清块不清哈希 → recompute 抢占被前缀缓存兜底成"部分重算"

> 💡 **下一步**：带着这份流程图去读 [Day 5](../day5.md) 的 `model_runner`——看 `num_scheduled_tokens` 和 `block_table` 如何变成 `slot_mapping` / `cu_seqlens` 张量喂进 flash-attn；再回到 [Day 3](../day3.md) 复盘 `can_allocate` 的链式哈希遍历，检验自己能否独立画出 `hash_blocks` 的登记时序。
