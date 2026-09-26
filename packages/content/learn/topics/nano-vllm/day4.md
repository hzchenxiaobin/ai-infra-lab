---
id: "learn:topic:nano-vllm:d4"
type: learn
title: "Day 4：Scheduler——Continuous Batching 与抢占"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, continuous-batching, scheduler, preemption, chunked-prefill]
updated: 2026-09-25
day: 4
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 4：Scheduler——Continuous Batching 与抢占

## 🎯 目标

通过今天的学习，你将：

1. 逐行精读 `engine/scheduler.py`（~100 行）——整个引擎的**决策中枢**：Day 2 的 `step()` 第一段、Day 3 的 BlockManager 三组方法，今天全部被它调用串联
2. 吃透 prefill 路径：token 预算内从 waiting 组批、前缀缓存感知的工作量计算、`can_allocate == -1` 时的退避
3. 吃透 chunked prefill：**为什么整个特性只需要一个 `if` 分支**、为什么只允许切第一个序列、被切序列的采样 token 为什么被丢弃、它与 Sarathi-Serve/vLLM 混批的本质区别
4. 吃透 decode 路径与抢占：`can_append` 失败时的 victim 选择（running 队尾）、`while/else` 控制流、`preempt()` 的 recompute 闭环（以及它为什么可能**几乎免费**——Day 3 的伏笔回收）
5. 吃透 `postprocess()` 的操作顺序：hash → 回填 → skip → append → 判停 → 释放，为什么一步都不能乱
6. 产出：`schedule()` 双路径流程图 + "vLLM Scheduler 有而 nano 没有"差异清单

> 💡 **前置知识**：[Day 3](day3.md) 的三组方法（今天的每一行都在调它们）+ [Day 2](day2.md) 的 trace 实验（今天复用并增强）
> ⚠️ **环境要求**：任务 B 需要 GPU（要故意把 KV 池压小逼出抢占）；任务 C 纯纸面推演

---

## 为什么调度器是"决策中枢"

推理引擎的性能故事讲到底是一个**决策问题**：每一步算什么、不算什么、牺牲谁、保谁。Scheduler 就是这些决策的全部载体：

| 部件 | 昨天的角色 | 今天被谁调用 |
|------|-----------|--------------|
| `can_allocate` / `allocate` | 进批时的缓存命中与块申请 | prefill 路径 |
| `can_append` / `may_append` | decode 按需扩块 | decode 路径（失败的后果 = 抢占） |
| `hash_blocks` / `deallocate` | 登记与释放 | postprocess / 抢占 / 判停 |

对照 [Week 6 Day 2 手写 Batcher](../../daily/week6/day2/README.md)：你当时写的是"没有显存压力的教学版调度器"。今天读的是**真实版**——每个循环里都藏着一个资源约束的决策。

> 💡 **一句话总结**：BlockManager 是账本，Scheduler 是花钱的人——今天读完，"每一步 GPU 在算什么、为什么算这些"就再无秘密。

---

## 核心概念

### 4.1 总览：双队列与"非混批"的步进策略

```python
class Scheduler:
    def __init__(self, config):
        self.max_num_seqs = config.max_num_seqs
        self.max_num_batched_tokens = config.max_num_batched_tokens
        self.eos = config.eos
        self.block_manager = BlockManager(config.num_kvcache_blocks, config.kvcache_block_size)
        self.waiting: deque[Sequence] = deque()    # 未完成 prefill 的序列
        self.running: deque[Sequence] = deque()    # 正在 decode 的序列
```

只有两个队列（vLLM V0 有三个：waiting/running/**swapped**）。`schedule()` 的顶层结构决定了一个重要事实：

```python
def schedule(self):
    scheduled_seqs = []
    # ... prefill 循环 ...
    if scheduled_seqs:
        return scheduled_seqs, True      # 有 prefill 可跑 → 本步全 prefill
    # ... decode 循环 ...
    return scheduled_seqs, False         # 否则本步全 decode
```

**一个 step 要么纯 prefill、要么纯 decode，永不混批**。这是 nano 最"复古"的设计（等价 vLLM 早期版本），代价是：只要 waiting 非空，decode 一律让路——持续到达的请求流会让在线用户的 ITL 抖动。vLLM V1 与 Sarathi-Serve 的混批（同一步 prefill 块 + decode 混编）正是为了修这个问题（4.3 节展开）。

但注意：**continuous batching 依然成立**——每个 step 结束，完成的序列立即退出、腾出的算力立刻给活着的序列，只是"每步内部"不混两类工作。

### 4.2 prefill 路径逐行

```python
# prefill
while self.waiting and len(scheduled_seqs) < self.max_num_seqs:
    seq = self.waiting[0]                          # ① peek 队首，不弹出
    remaining = self.max_num_batched_tokens - num_batched_tokens
    if remaining == 0:                             # ② 预算用尽（放在 can_allocate 前面省开销）
        break
    if not seq.block_table:                        # ③ 首次调度：还没有块表
        num_cached_blocks = self.block_manager.can_allocate(seq)
        if num_cached_blocks == -1:                # ④ 空闲块不够（资源否）→ 整个 prefill 停摆
            break
        num_tokens = seq.num_tokens - num_cached_blocks * self.block_size   # ⑤ 缓存命中抵扣工作量
    else:                                          # ⑥ chunked prefill 的后续片：块表已存在
        num_tokens = seq.num_tokens - seq.num_cached_tokens
    if remaining < num_tokens and scheduled_seqs:  # ⑦ ★ chunked prefill 的全部实现
        break
    if not seq.block_table:
        self.block_manager.allocate(seq, num_cached_blocks)
    seq.num_scheduled_tokens = min(num_tokens, remaining)
    num_batched_tokens += seq.num_scheduled_tokens
    if seq.num_cached_tokens + seq.num_scheduled_tokens == seq.num_tokens:   # ⑧ prompt 全部排完
        seq.status = SequenceStatus.RUNNING
        self.waiting.popleft()
        self.running.append(seq)
    scheduled_seqs.append(seq)
```

八个标注逐一解读：

- **① peek 不 pop**：序列要等 prompt **全部排完**（⑧）才离开 waiting——被切块的序列留在队首，下个 step 从 ⑥ 继续
- **② 预算检查前置**：`remaining == 0` 放在 `can_allocate` 之前，预算没了就不做（相对昂贵的）哈希查表——小优化，读码时容易漏
- **④ `-1` 的语义**（Day 3 铺垫过）：不是"没缓存"，是"算上缓存空闲块也不够"。此时 break 而不是 continue——**队首序列进不来，后面的更进不来**（FIFO 公平性：不许插队），只能等 running 里的序列完成释放块
- **⑤ 前缀缓存抵扣**：需要计算的 token 数 = 总数 − 命中块数 × 块大小。缓存命中直接转化为**工作量减免**（张量构造层见 Day 3 的 `prepare_prefill`：`start = num_cached_tokens`）
- **⑧ 转态条件**：`num_cached_tokens + num_scheduled_tokens == num_tokens`——注意是**累计值**，chunked 的序列要等最后一片排完才转 RUNNING

### 4.3 chunked prefill：一个分支的实现与它的边界

先回答昨天 [Day 2](day2.md) 任务 C 留下的问题——`max_num_batched_tokens=8` 时 20-token prompt 被切成 8+8+4——现在看实现：

**为什么只允许切第一个序列？** 看 ⑦ 的条件：`remaining < num_tokens and scheduled_seqs`——`scheduled_seqs` 非空（本步已收了别的序列）就 break，不再切。效果：

- 第一个序列可以**吃满全部预算**（`num_scheduled_tokens = min(num_tokens, remaining)`），不够就切
- 从第二个起，要么**整段装得下**，要么等下一步

这是实现极简主义的胜利：**任意时刻最多只有一个"半完成"的 prefill 序列**。如果允许切任意序列，就要同时维护多个部分调度的状态、处理多序列的断点续传边界——vLLM 为此写了整套调度配置。nano 用一个分支换掉了这一切。

**被切序列这一步发生了什么？**

```text
seq.num_scheduled_tokens = 8（一片）
seq.num_cached_tokens 仍是 0，num_tokens = 20
→ ⑧ 不成立 → 留在 waiting，状态仍 WAITING
→ model_runner 照常为它的 8 个 token 算前向、采样器也采了一个 token
→ postprocess 里这个 token 被【丢弃】：
     if is_prefill and seq.num_cached_tokens < seq.num_tokens:
         continue        # 跳过 append_token
```

**为什么丢弃是对的？** 第 8 个位置的 logits 预测的是"第 9 个 token"——而 prompt 里第 9 个 token 本来就有，采样出来的没有意义。 sampler 为它白采了一次样——一个 batch 次 multinomial 的浪费，可忽略，但值得知道。

**与 Sarathi-Serve / vLLM 混批的本质区别**（面试高频，务必分清）：

| 维度 | nano 的 chunked prefill | Sarathi / vLLM V1 混批 |
|------|------------------------|------------------------|
| 目的 | **资源边界**：单步 token 数不超预算（防 OOM、限单步时长） | **延迟平滑**：decode 与 prefill 块混编，保护在线 ITL |
| 同一步内容 | 纯 prefill（或纯 decode） | decode + 一块 prefill |
| 被切序列的 decode 邻居 | 不存在——decode 还在等 | 就在同一步里 |
| 实现代价 | 一个 if 分支 | 调度器配置 + attention kernel 支持混合批 |

nano 切了 prefill 但 **decode 依然要等 waiting 清空**——所以它没有获得 Sarathi 的 ITL 收益，只获得了资源边界收益。

### 4.4 decode 路径逐行：抢占的现场

```python
# decode
while self.running and len(scheduled_seqs) < self.max_num_seqs:
    seq = self.running.popleft()                   # ① 从队首取
    while not self.block_manager.can_append(seq):  # ② 本序列下一步需要新块但没有空闲块
        if self.running:
            self.preempt(self.running.pop())       # ③ 抢占牺牲者：running 队尾（最年轻）
        else:
            self.preempt(seq)                      # ④ 没人可抢了，抢自己
            break
    else:                                          # ⑤ Python 的 while/else：没 break（即 can_append 通过）
        seq.num_scheduled_tokens = 1
        seq.is_prefill = False
        self.block_manager.may_append(seq)         # ⑥ 现在就扩块（slot_mapping 要用）
        scheduled_seqs.append(seq)
assert scheduled_seqs                               # ⑦ fail-fast
self.running.extendleft(reversed(scheduled_seqs))  # ⑧ 原序塞回队首
```

- **③ victim 是队尾** = **最近进入 running 的序列**：它已投入的计算最少（sunk cost 最小），抢占损失最小；同时保住老序列，维持 FIFO 语义。vLLM 同样从 running 尾部抢占
- **④ 抢自己**：所有 running 序列都试过了还不行——把当前这个也打回 waiting（它释放的块可能刚好够别人），本步跳过它。配合 ⑦ 的 assert：如果连一个序列都调度不出来，说明系统无进展（如单序列所需块 > 全池），与其死循环不如崩给你看——**fail-fast 好过无限挂起**
- **⑤ while/else**：Python 冷门语法——`else` 在循环**未被 break** 时执行。这里表达"块够了，正常调度"；被抢占的 seq 走了 break，自然跳过
- **⑥ may_append 在调度时就执行**（而不是 postprocess）：`prepare_decode` 马上要用 `block_table[-1]` 算 slot（Day 3 公式），块必须现在就位
- **⑧ 顺序恢复**：popleft 拿走的序列，用 `extendleft(reversed(...))` 塞回队首且**相对顺序不变**——`running` 的次序跨步稳定，公平性靠这个保证

> ⚠️ **一个值得琢磨的读码发现**：prefill 循环的 `len(scheduled_seqs) < max_num_seqs` 只限制**本步**的批大小，并没有检查 `running` 里已有的数量——理论上 active 序列总数可以超过 `max_num_seqs`，超出部分的序列会滞留在 running 尾部等前面完成（队头阻塞）。实践中很少触发：块池饱和（`can_allocate == -1`）几乎总是先到。对比 vLLM：`max_num_seqs` 是 **running 集合的上限**（新请求最多补到这个数）。语义差异记进 4.7 的对比表。

### 4.5 `preempt()`：recompute 的完整闭环

```python
def preempt(self, seq: Sequence):
    seq.status = SequenceStatus.WAITING     # 状态回退
    seq.is_prefill = True                   # 身份回退：它又要 prefill 了
    self.block_manager.deallocate(seq)      # 释放全部块（引用计数减法，Day 3）
    self.waiting.appendleft(seq)            # 塞回 waiting 队首
```

四行完成抢占。三个精细的选择：

1. **`appendleft`（队首）**：被抢占者优先恢复——它已经被牺牲过一次，尽快回补
2. **没有 swap 分支**：vLLM 的抢占有 recompute 和 swap 两种模式；nano 只有 recompute——释放块、重新 prefill。省掉了 CPU 侧缓存池、H2D/D2H 拷贝、换入换出状态机
3. **recompute 可能几乎免费**——Day 3 伏笔回收：`deallocate` **不清哈希**，被抢占序列的满块变成"空闲可缓存"状态。下个 step 它从 waiting 队首被重新调度，`can_allocate` 会**命中自己的旧块**——只有不满的尾块需要真正重算

```text
被抢占序列 500 token（块大小 256）：
├── 块 0（满 256）→ 释放但哈希健在 → 重调度时命中复用【零计算】
└── 尾块（244 token）→ 未满未登记 → 真正重算的只有这部分
```

当然，如果旧块在它回来之前被别的序列复用（内容被覆盖、哈希被 reset），就只能全量重算。**recompute 的真实代价 = f(缓存存活性)**——这是"抢占策略"与"前缀缓存"两个子系统耦合的典型案例。

### 4.6 `postprocess()`：一步的收官与顺序敏感性

```python
def postprocess(self, seqs, token_ids, is_prefill):
    for seq, token_id in zip(seqs, token_ids):
        self.block_manager.hash_blocks(seq)               # ① 先登记（start 用旧 num_cached_tokens）
        seq.num_cached_tokens += seq.num_scheduled_tokens # ② 后回填
        seq.num_scheduled_tokens = 0
        if is_prefill and seq.num_cached_tokens < seq.num_tokens:
            continue                                      # ③ chunked 中间片：丢弃采样 token
        seq.append_token(token_id)                        # ④ 追加（num_tokens+1）
        if (not seq.ignore_eos and token_id == self.eos) \
           or seq.num_completion_tokens == seq.max_tokens:
            seq.status = SequenceStatus.FINISHED          # ⑤ 判停
            self.block_manager.deallocate(seq)            # ⑥ 立即释放块
            self.running.remove(seq)                      # ⑦ 出队
```

顺序不能乱的三处：

- **①②**：`hash_blocks` 以 `num_cached_tokens` 为起点（Day 3），必须**先登记后回填**——反过来 start 就错了
- **④⑤**：`num_completion_tokens` 依赖 append 后的长度，先追加后判断
- **⑤⑥**：判停后**立即** deallocate——"完成即释放"，这个 step 内腾出的块下个 step 就能用（配合 4.2 的 `-1` break，系统总能向前走）

另外注意 `running.remove(seq)` 是 O(n) 的线性扫——nano 规模下无所谓，但"用 deque 模拟随机删除"是性能敏感系统里会重写的点（vLLM 用集合/索引维护）。

### 4.7 nano vs vLLM Scheduler 差异清单

| 能力 | nano-vllm | vLLM | 差异的代价/动机 |
|------|-----------|------|-----------------|
| 队列 | waiting / running | waiting / running /（V1 简化后并入） | V0 的 swapped 队列服务 swap 抢占 |
| 抢占 | 仅 recompute | recompute / swap 可配 | swap 省算力、费 CPU 内存与 PCIe |
| 混批 | 无（步内纯一类） | prefill 块 + decode 混编 | 混批保护在线 ITL（Sarathi 思想） |
| 调度优先级 | FIFO 一根筋 | 可配（优先级、SLO 感知） | 多租户场景必需 |
| `max_num_seqs` | 本步批大小上限 | running 集合上限 | nano 靠块池饱和兜底 |
| 无进展保护 | `assert` 崩溃 | 拒绝请求/优雅降级 | fail-fast vs 生产韧性 |

---

## 动手实践

### 任务 A：逐行精读 scheduler.py（50 分钟）

对照本文 4.2-4.6，重点核对五个"如果…会怎样"：

| 思考题 | 答案线索 |
|--------|----------|
| 把 ⑦ 的 `and scheduled_seqs` 删掉会怎样？ | 每个装不下的序列都被切一块，同一步出现多个半成品 |
| `preempt` 改 `append`（队尾）会怎样？ | 被抢占者排在所有新请求后面，恢复遥遥无期 |
| ①② 顺序颠倒会怎样？ | hash_blocks 的 start 越界/漏登记 |
| decode 循环不做 ⑧ 会怎样？ | running 顺序每步旋转，队尾永久饥饿 |
| victim 改成 `popleft`（队首）会怎样？ | 抢占最老、沉没成本最大的序列，最亏 |

### 任务 B：逼出抢占并观察（60 分钟，需 GPU）

复用 Day 2 的 trace，加一个 preempt 打点，把 KV 池故意压小：

```python
# trace_preempt.py —— 观察 chunked prefill 与抢占
# 运行: python3 trace_preempt.py
import random
from nanovllm import LLM, SamplingParams

MODEL = "/root/huggingface/Qwen3-0.6B"   # 改成本地路径

# ① gpu_memory_utilization 压小 → KV 池小 → decode 扩块时会撞墙
llm = LLM(MODEL, enforce_eager=True,
          gpu_memory_utilization=0.35, max_model_len=4096)

orig_preempt = llm.scheduler.preempt
def traced_preempt(seq):
    print(f"    ⚡ preempt: seq {seq.seq_id} → 回 waiting 队首，重新 prefill")
    orig_preempt(seq)
llm.scheduler.preempt = traced_preempt

orig_step = llm.step
def traced_step():
    outputs, num_tokens = orig_step()
    tag = f"PREFILL {num_tokens:>4d} tok" if num_tokens > 0 else f"DECODE  {-num_tokens:>3d} seq"
    print(f"step | {tag} | waiting={len(llm.scheduler.waiting)}"
          f" running={len(llm.scheduler.running)} finished={len(outputs)}")
    return outputs, num_tokens
llm.step = traced_step

random.seed(0)
prompts = [[random.randint(1000, 9000) for _ in range(800)] for _ in range(16)]
sps = [SamplingParams(temperature=0.6, max_tokens=600, ignore_eos=True) for _ in range(16)]
llm.generate(prompts, sps, use_tqdm=False)
```

**观察点**（如果没看到 preempt，把 `gpu_memory_utilization` 再调小 / 序列再调长）：

1. **prefill 分批进场**：第一步不会收下全部 16 条——`can_allocate == -1` 时 break，只有块池装得下的几条进了 running
2. **⚡ preempt 出现的时机**：decode 步中（`can_append` 失败），且牺牲者是**较晚进场**的序列
3. **被抢占序列的"复活"**：它回到 waiting 队首 → 下一步出现一次 PREFILL——**看这次 prefill 的 token 数**：明显小于 800 说明前缀缓存命中（旧块还活着）；接近 800 说明旧块被别人复用了（全量重算）——4.5 的两种命运亲眼看一遍
4. **最终正确性**：16 条全部 finished——抢占只影响性能，不影响结果（recompute 的正确性）

### 任务 C：纸面推演 schedule()（25 分钟）

设 `block_size=256`、`max_num_batched_tokens=1000`、`max_num_seqs=4`、池子足够大。初始 waiting = [S0(700 tok), S1(600 tok), S2(300 tok)]，running 空，均无缓存命中。手推前三个 step：每步返回 `(seqs, is_prefill)`、waiting/running 的内容。再改一版：S0 是 1500 token 的长 prompt，重推（答案在文末）。

### 任务 D：画图与差异清单（15 分钟）

1. 画 `schedule()` 双路径流程图：prefill 循环（含 ⑦ 分支与 ⑧ 转态）+ decode 循环（含抢占 while 与 while/else）+ 两个 return
2. 把 4.7 的差异表抄进笔记，Day 7 迁移 vLLM 时逐行核对

### 学习时间安排（共 2.5 小时）

| 时长 | 内容 |
|---|---|
| 40 分钟 | 理论：本文 4.1-4.7 |
| 50 分钟 | 任务 A：精读 + 五个思考题 |
| 60 分钟 | 任务 B：抢占实验 |
| 25 分钟 | 任务 C：纸面推演 |
| 15 分钟 | 任务 D：流程图 + 差异清单 |

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| 不认识 while/else | 以为 ⑤ 的 else 属于 if | Python 语法：循环**未被 break 打断**时执行 else——这里表达"块够了" |
| 以为 chunked prefill = 混批 | 面试答"nano 用 chunked prefill 保护 ITL" | nano 只做了资源边界，decode 仍等 waiting 清空；混批是 Sarathi/vLLM V1 |
| 以为被切序列的 token 被使用了 | 纠结中间片采样的 token 去哪了 | postprocess ③ 丢弃——中间片最后一位的预测没有意义 |
| 以为 preempt 后必然全量重算 | 评估 recompute 代价时一刀切 | 满块哈希存活时命中自己的缓存，只有尾块真算 |
| 把 max_num_seqs 当并发上限 | 与 vLLM 语义混淆 | nano 里它是**每步批大小**上限，active 数靠块池饱和兜底 |
| 忽略 `assert scheduled_seqs` | 以为是无进展时静默等待 | 是 fail-fast：单序列需求超全池这类配置错误，崩比挂好 |

---

## 面试要点

**Q：Continuous Batching 与 Static Batching 的本质区别是什么？调度粒度在哪一级？**
> 调度粒度从"请求级"降到"迭代（step）级"。Static batching 整批进、整批出，最慢序列决定一切，短序列完成后槽位空转；continuous batching 每个 decode step 后重组 batch——完成的立即退出（nano 的 postprocess：判停即 deallocate 即出队），腾出的算力立刻分给活序列。前提是 KV Cache 管理足够便宜（分页化），换入换出不用搬数据——所以 PagedAttention 是 continuous batching 的使能技术，两者是配套发明。

**Q：抢占时为什么牺牲 running 队尾（最年轻）而不是队首？**
> 沉没成本最小化 + 公平性。队尾是最近才完成 prefill 的序列，已投入的计算最少，重算损失最小；队首的老序列快要完成了，抢占它等于把快到手的收益作废。同时保老弃新维持了 FIFO 语义。vLLM 同样从 running 尾部取 victim——这不是巧合，是同一个代价函数的最优解。

**Q：recompute 和 swap 两种抢占怎么选？nano 的 recompute 为什么可能很便宜？**
> swap 把 KV 搬到 CPU 内存、之后搬回——省算力、费 PCIe 带宽和 CPU 内存，还要维护换入换出状态；recompute 直接弃块重算——零额外内存，费算力。选择看序列长度与共享前缀：长序列/密集服务时 swap 划算。nano 的 recompute 有隐藏折扣：`deallocate` 不清哈希（前缀缓存第三态），被抢占序列重新调度时 `can_allocate` 会命中**自己的旧满块**——只有未满尾块真正重算。所以真实代价取决于旧块在窗口期内是否被别人复用——抢占策略与前缀缓存是耦合子系统。

**Q：nano 的 chunked prefill 和 Sarathi-Serve / vLLV 混批是一回事吗？**
> 不是。nano 的实现是一个分支：只有本步第一个序列允许超额切块（`remaining < num_tokens and scheduled_seqs: break`），每步仍是纯 prefill 或纯 decode——它只获得**资源边界**收益（单步 token 不超预算、防 OOM）。Sarathi 混批把 prefill 块与 decode 编入同一步，decode 不必等 prefill 积压清空——那才是 ITL 平滑收益。一句话：nano 切了 prefill 的"量"，没做 prefill 与 decode 的"混"。

**Q：postprocess 里为什么必须先 `hash_blocks` 再回填 `num_cached_tokens`？**
> hash_blocks 以 `num_cached_tokens // block_size` 为登记起点（第一个未登记的块号）——它读的是"旧值"。先回填再登记，起点就指向未来，轻则跳块漏登记（缓存缺失），重则越界。同理 append 必须先于 max_tokens 判断（completion 计数依赖 append 后长度）、FINISHED 判定必须先于 deallocate（释放块之前要确认真的结束了）。**后处理是一串有依赖的记账，顺序即正确性**。

**Q：decode 循环里 `can_append` 失败可能死循环吗？系统如何保证有进展？**
> 不会。内层 while 每次失败就抢占一个 running 序列（释放其全部块），free 池单调增加；极端情况下抢无可抢就抢当前 seq 自己并 break（跳过它）。多轮后要么块够了、要么所有序列都被打回 waiting——后者意味着新请求全被 `can_allocate == -1` 挡住、系统自然停摆，`assert scheduled_seqs` fail-fast 崩溃暴露配置错误（如单序列需求超过全池）。**资源释放路径的存在性 = 调度系统的活性证明**。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| 步进策略 | 双队列 + 非混批：一个 step 纯 prefill 或纯 decode；continuous batching 依然成立 |
| prefill 路径 | peek 不 pop、预算前置检查、`-1` 整体 break（FIFO 不插队）、缓存命中抵扣工作量 |
| chunked prefill | 一个分支只切第一个序列；中间片采样 token 被丢弃；只换资源边界不换 ITL 平滑 |
| decode 路径 | can_append 失败 → 抢队尾（沉没成本最小）→ while/else 恢复正常路径；extendleft 保序 |
| preempt | 四行闭环：回退状态 + 释放块 + 回队首；recompute 的真实代价 = f(缓存存活性) |
| postprocess | hash→回填→skip→append→判停→释放，顺序即正确性；完成即释放 |
| vs vLLM | swapped 队列、swap 抢占、混批、优先级、max_num_seqs 语义——六项差异清单 |

**自测清单**（能答出才算过关）：

- [ ] 默写 schedule() 两条路径的循环骨架与每个 break 的条件
- [ ] 解释 ⑦ 分支如何保证"任意时刻最多一个半成品 prefill"
- [ ] 推导被抢占序列重新 prefill 时 token 数的两种可能
- [ ] 说出 postprocess 三处顺序敏感点
- [ ] 说出 while/else 在 decode 循环里的语义
- [ ] 抢占实验的 trace 已保存（含 preempt 事件与复活 prefill 的 token 数）

**📦 今日产出**：`schedule()` 双路径流程图 + 抢占实验 trace + nano/vLLM 调度器差异清单。

---

> 📌 **明日预告**：Day 5 进入执行层与算子层——`model_runner.py` 的 prepare 系列（三组张量的最终形态）、`models/qwen3.py` 的完整前向、`layers/attention.py` 的两个 kernel 分工（Triton 写 KV / flash-attn 读 KV）、`utils/context.py` 的全局上下文、以及 CUDA graph 的捕获与重放。Day 3 的 slot_mapping、Day 1 的 enforce_eager，明天全部闭环。

---

**附：任务 C 答案**

**场景 1**（S0=700, S1=600, S2=300，预算 1000）：
- step 1：S0 需 700 ≤ 1000 → 排入（预算余 300）；S1 需 600 > 300 且已有序列 → break。返回 `([S0], True)`，S0 转 RUNNING，waiting=[S1,S2]
- step 2：S1 需 600 → 排入（余 400）；S2 需 300 ≤ 400 → 排入（余 100）。返回 `([S1,S2], True)`，waiting 空
- step 3：waiting 空 → decode。返回 `([S0,S1,S2], False)`

**场景 2**（S0=1500，其余同）：
- step 1：S0 需 1500 > 1000，但 scheduled_seqs 为空 → **切块**：`num_scheduled_tokens=1000`；`0+1000 ≠ 1500` → S0 留在 waiting。返回 `([S0], True)`
- step 2：S0 走 else 分支（块表已存在）：需 1500−1000=500 → 排入（余 500）；S1 需 600 > 500 且已有序列 → break。返回 `([S0], True)`，S0 转 RUNNING（`1000+500=1500`），waiting=[S1,S2]
- step 3：S1 需 600 → 排入（余 400）；S2 需 300 ≤ 400 → 排入。返回 `([S1,S2], True)`
- step 4：decode `([S0,S1,S2], False)`
