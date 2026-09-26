---
id: "learn:topic:nano-vllm:code:sequence"
type: learn
title: "sequence.py 源码解读：一条请求在引擎里的化身"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, sequence, paged-attention, prefix-caching, continuous-batching]
updated: 2026-09-26
topic: nano-vllm
related_problems: []
related_questions: []
---

# sequence.py 源码解读：一条请求在引擎里的化身

> 精读对象：[sequence.py](sequence.py)（83 行，nano-vllm 里最小的引擎文件）
> 上游：`LLMEngine.add_request()` 构造它 · 下游：`Scheduler` / `BlockManager` / `ModelRunner` 读写它
> 衔接教程：[Day 2 引擎主线](../day2.md)（本篇是其中 2.3 节的完整展开版）

## 🎯 目标

通过本篇，你将：

1. 逐行读完 `Sequence` 的全部字段与方法，说出**每个字段谁写、谁读、何时变**
2. 理解 4 个 token 计数器（`num_tokens` / `num_prompt_tokens` / `num_cached_tokens` / `num_scheduled_tokens`）构成的**调度通用语言**
3. 掌握 `block(i)` / `num_blocks` / `last_block_num_tokens` 这组**分块视图**，并看懂它们如何变成 kernel 的输入（`slot_mapping` / `block_table`）
4. 读懂 `__getstate__` / `__setstate__` 里藏着的 **TP 进程间序列化优化**——为什么 decode 只传 1 个 int
5. 建立nano-vllm `Sequence`（一层）到 vLLM `Request → SequenceGroup → Sequence`（三层）的映射

> 💡 **前置知识**：[Day 2 引擎主线](../day2.md)的 `step()` 三段式（schedule → execute → postprocess）；KV Cache 与 PagedAttention 的基本概念（[Week 5](../../../daily/week5/README.md)）

---

## 为什么单独解读这个文件

`sequence.py` 只有 83 行、没有任何"算法"，但它定义了 nano-vllm 里**被引用最频繁的数据结构**：调度器排队的是它、块管理器分配的是它、模型执行器读的还是它。读懂它，后面读 [scheduler.py](https://github.com/GeeeekExplorer/nano-vllm) 和 `block_manager.py` 时你会发现——**所谓调度，本质上是围绕一组 Sequence 字段的读写循环**。

| 引擎组件 | 对 Sequence 做什么 |
|----------|-------------------|
| `LLMEngine.add_request()` | **创建**：文本 → token ids → `Sequence(prompt)` 进 waiting 队列 |
| `Scheduler.schedule()` | **排批**：读 `num_tokens`/`num_cached_tokens`，写 `num_scheduled_tokens`/`status` |
| `BlockManager` | **配块**：写 `block_table`/`num_cached_tokens`（allocate）、清空它们（deallocate） |
| `ModelRunner` | **消费**：读 `token_ids`/`last_token`/`block_table`/`last_block_num_tokens`，组装张量喂 kernel |
| `Scheduler.postprocess()` | **推进**：`append_token()` 追加新 token，判停，释放块 |

> 💡 **一句话总结**：`Sequence` 是请求在引擎内的化身——外部世界的一条 prompt，进来之后所有系统都只认这个对象。

---

## 全景：83 行的结构

先给整个文件画一张地图，后面逐段展开：

| 行数 | 内容 | 作用 |
|------|------|------|
| 1-5 | imports | `copy`（防御性拷贝）、`Enum/auto`（状态机）、`count`（id 生成器）、`SamplingParams` |
| 8-11 | `SequenceStatus` | 三态枚举：WAITING / RUNNING / FINISHED |
| 14-16 | 类属性 | `block_size=256`（启动时被 Config 覆盖）、`counter`（全局自增 id） |
| 18-31 | `__init__` | 一个请求出生时的全部状态 |
| 33-37 | `__len__` / `__getitem__` | 让 Sequence "长得像" token 列表 |
| 39-65 | property 家族 | 派生视图：完成度、prompt/completion 切片、分块信息 |
| 67-70 | `append_token` | decode 循环的最小增量 |
| 72-83 | `__getstate__` / `__setstate__` | TP 跨进程传输的"瘦身"序列化 |

---

## SequenceStatus：三态状态机

```python
class SequenceStatus(Enum):
    WAITING = auto()      # 等待首次 prefill（或被抢占后回来）
    RUNNING = auto()      # prefill 完成，正在 decode
    FINISHED = auto()     # 生成结束
```

![Sequence 状态机：三态与抢占回路](assets/sequence_state_machine.svg)

三个状态、三条迁移路径，全部由 Scheduler 驱动：

| 迁移 | 触发点 | 代码位置（scheduler.py） |
|------|--------|--------------------------|
| WAITING → RUNNING | `num_cached_tokens + num_scheduled_tokens == num_tokens`，即**整个 prompt 被完整排进批** | `schedule()` prefill 分支 |
| RUNNING → FINISHED | 命中 EOS（且未 `ignore_eos`）或 `num_completion_tokens == max_tokens` | `postprocess()` |
| RUNNING → WAITING | decode 时显存不足被抢占：释放全部块、塞回 waiting **队首**、`is_prefill=True` | `preempt()` |

两个容易忽略的细节：

1. **chunked prefill 的中间态仍是 WAITING**。`schedule()` 只把第一个长 prompt 切一部分进批（`num_scheduled_tokens < num_tokens`），此时状态不迁移、序列留在 waiting 队列——只有"排满"那一刻才转正 RUNNING
2. **对比 vLLM 的 8+ 态**（`SWAPPED` / `PREEMPTED` / `PAUSED`…）：nano 的抢占只走 recompute 一条路，回 WAITING 重算即可，省掉了整个 swap 换入换出支线。三态换掉一套状态机，这是"极简复刻"最典型的取舍

---

## `__init__`：一条请求出生时带着什么

```python
class Sequence:
    block_size = 256                     # 类属性：引擎启动时被 Config 覆盖
    counter = count()                    # 全局单调递增 id 生成器

    def __init__(self, token_ids: list[int], sampling_params = SamplingParams()):
        self.seq_id = next(Sequence.counter)
        self.status = SequenceStatus.WAITING
        self.token_ids = copy(token_ids)            # ★ 防御性拷贝
        self.last_token = token_ids[-1]             # ★ 下一次前向的唯一输入（decode）
        self.num_tokens = len(self.token_ids)       # ★ 权威计数器，append 时手动 +1
        self.num_prompt_tokens = len(token_ids)     # 出生即定格，永不再变
        self.num_cached_tokens = 0                  # ★ 前缀缓存已覆盖的 token 数
        self.num_scheduled_tokens = 0               # ★ 本 step 被排进批的 token 数
        self.is_prefill = True
        self.block_table = []                       # ★ 逻辑块 → 物理块号
        self.temperature = sampling_params.temperature
        self.max_tokens = sampling_params.max_tokens
        self.ignore_eos = sampling_params.ignore_eos
```

逐个说值得停下来的点：

**① 类属性 `block_size`：默认值 + 启动注入**。写死 256 只是兜底；`LLMEngine.__init__` 第一件事就是 `Sequence.block_size = config.kvcache_block_size`（llm_engine.py:21）——用类属性当"引擎级全局配置"注入点，省得每个方法都传参。代价是：在引擎外直接 `import Sequence` 使用时（如 `warmup_model` 造 dummy 序列）拿到的是默认 256。

**② `counter = count()`：用单调 id 恢复输出顺序**。`itertools.count()` 线程安全、永不重复，`seq_id` 按 `add_request` 的插入顺序自增。`generate()` 最后 `sorted(outputs.keys())` 按它排序——**用"时间戳式单调 id"恢复输入顺序**，这个模式值得记下。

**③ `copy(token_ids)`：防御性拷贝**。`append_token()` 会往 `self.token_ids` 里 append；如果直接引用调用方传入的列表，生成过程就会污染引擎外部的 prompt 数据。

**④ 采样参数被"打平"**。不保留 `SamplingParams` 对象，只拷 3 个标量。好处一：热路径上少一层属性链（`seq.temperature` vs `seq.sampling_params.temperature`）；好处二：见后文 `__getstate__`——这 3 个字段在 TP worker 进程上根本不需要。

**⑤ `last_token` 与 `num_tokens` 是冗余的——但冗余得有道理**。`len(token_ids)` 和 `token_ids[-1]` 明明都能算出来，为什么单独存？答案藏在 `__setstate__`：TP worker 上 decode 阶段 unpickle 出来的 Sequence **`token_ids` 是空列表**，`len()` 和 `[-1]` 都不可用——`num_tokens` 和 `last_token` 这两个"冗余"字段才是权威数据源。

---

## token 计数体系：调度系统的通用语言

![Sequence 的 token 计数体系](assets/sequence_token_counters.svg)

四个计数器 + 两个切片视图，用一个贯穿全文的例子：**prompt 600 个 token，前缀缓存命中 512（2 个满块），已生成 130 个 token**：

| 字段 | 例值 | 语义 | 谁写 |
|------|------|------|------|
| `num_tokens` | 730 | 当前总 token 数（prompt + 已生成） | `__init__` / `append_token` |
| `num_prompt_tokens` | 600 | prompt 长度，**出生即定格** | `__init__` |
| `num_cached_tokens` | 512 | "KV 已在缓存里"的 token 数：前缀命中 + chunked 已算过 | `BlockManager.allocate` / `postprocess` 回填 |
| `num_scheduled_tokens` | 88 | 本 step 被排进批的 token 数（**瞬时值**：schedule 写、postprocess 清零） | `Scheduler.schedule` |

派生视图（property）：

```python
@property
def num_completion_tokens(self):      # 730 - 600 = 130
    return self.num_tokens - self.num_prompt_tokens

@property
def prompt_token_ids(self):           # token_ids[:600]
    return self.token_ids[:self.num_prompt_tokens]

@property
def completion_token_ids(self):       # token_ids[600:]，generate() 的最终输出
    return self.token_ids[self.num_prompt_tokens:]
```

这组数字的**配合关系**是调度器的核心逻辑（见 [Day 4](../day4.md)）：

- prefill 首次调度要算多少新 token：$num\_scheduled\_tokens = num\_tokens - num\_cached\_tokens = 600 - 512 = 88$
- `postprocess()` 里回填：`num_cached_tokens += num_scheduled_tokens`（88 算完落缓存，512 → 600）
- decode 每步：`num_scheduled_tokens = 1`，输入只有 `last_token`
- 判停：`num_completion_tokens == max_tokens`

> 💡 **注意**：`num_scheduled_tokens` 是跨 step 不可依赖的瞬时字段——`schedule()` 写入、`postprocess()` 用完即清零。任何"在 step 之外读它"的代码拿到的都是 0。

---

## 分块视图：token_ids → block_table → 物理块

![分块视图：token_ids、block_table 与 KV Cache 物理块的映射](assets/sequence_block_view.svg)

PagedAttention 的世界里，序列不是一根连续内存，而是**切成 `block_size`（256）大小的块，散落在物理块池里**。`Sequence` 用三个成员/方法提供这套视图：

```python
@property
def num_blocks(self):                                  # ⌈730/256⌉ = 3
    return (self.num_tokens + self.block_size - 1) // self.block_size

@property
def last_block_num_tokens(self):                       # 730 - 2×256 = 218
    return self.num_tokens - (self.num_blocks - 1) * self.block_size

def block(self, i):                                    # 逻辑块 i 的 token 切片
    assert 0 <= i < self.num_blocks
    return self.token_ids[i*self.block_size: (i+1)*self.block_size]
```

- `num_blocks`：**向上取整**的整数写法 `(n + b - 1) // b`，不用 `math.ceil`——推理引擎里最常见的整数技巧
- `last_block_num_tokens`：最后一个块的实际填充量，**尾块永远可能不满**
- `block(i)`：左闭右开切片，配合 `assert` 防越界——它主要服务 `BlockManager`（链式哈希按块取 token 算 hash，见 [Day 3](../day3.md)）
- `block_table`：`[7, 3, 12]` 这样的物理块号列表，逻辑块 i 的 KV 存在物理块 `block_table[i]` 里

**这三个视图的最终消费者是 ModelRunner**（衔接 [Day 5](../day5.md)）：

```python
# model_runner.prepare_decode() 的关键一行：
slot_mapping.append(seq.block_table[-1] * self.block_size
                    + seq.last_block_num_tokens - 1)
# 本 step 新 token 的 KV 要写到：最后一块 × 256 + 尾块已填数 − 1
```

prefill 侧则用 `seq[start:end]`（走 `__getitem__` 切片）取出本 step 要算的 token 区间，再沿 `block_table` 展开成 `slot_mapping`。

> ⚠️ **尾块与哈希的约定**：`BlockManager.hash_blocks()` 只登记**满块**的哈希——尾块还会被 `append_token` 追加，内容未定，登记了也会失效。所以例中逻辑块 0/1 进哈希表，块 2 不进。

---

## `__len__` / `__getitem__`：把 Sequence 伪装成 token 列表

```python
def __len__(self):
    return self.num_tokens

def __getitem__(self, key):
    return self.token_ids[key]
```

两个魔术方法让 `Sequence` 通过 Python 协议"长得像"一个 token 列表，调用方代码因此非常干净：

| 调用方 | 写法 | 走的方法 |
|--------|------|----------|
| `BlockManager.can_append` / `may_append` | `len(seq) % block_size == 1`（判断 decode 是否跨块） | `__len__` |
| `ModelRunner.prepare_decode` | `positions.append(len(seq) - 1)` | `__len__` |
| `ModelRunner.prepare_prefill` | `input_ids.extend(seq[start:end])` | `__getitem__`（切片） |

注意 `__getitem__` 原样转发 key，所以**切片、负索引全都免费获得**——这是"组合既有协议"而不是"重新发明 API"的小范例。

> 💡 **跨块判断的算术**：`len(seq) % block_size == 1` 意味着追加 1 个 token 后恰好跨入新块（如 512 → 513），此时 `may_append` 才分配新物理块——不是每次 decode 都分配，而是**每 256 步才分配一次**。

---

## 生命周期：字段如何随 step 演化

![Sequence 生命周期：字段随 step 演化](assets/sequence_lifecycle.svg)

把前面的字段串成一条时间线（例：prompt 600，前缀命中 512，`max_tokens=130`）：

```text
① add_request     Sequence(prompt)：WAITING，num_tokens=600，cached=0，table=[]
② schedule        can_allocate 命中 2 满块 → allocate：table=[7,3,12]，cached=512，sched=88
③ run+postprocess hash_blocks 登记满块哈希；cached 512→600；append_token → num_tokens=601
                  status=WAITING→RUNNING（首 token 已生成）
④ decode 循环     每步 sched=1、is_prefill=False，输入只有 last_token；
                  len(seq)%256==1 时 may_append 扩块；append_token +1
⑤ 判停            EOS 或 num_completion_tokens==130 → FINISHED，deallocate 归还块
```

`append_token` 是整个生成循环的**最小增量**——只动三个字段：

```python
def append_token(self, token_id: int):
    self.token_ids.append(token_id)
    self.last_token = token_id        # 下一步前向的输入
    self.num_tokens += 1              # 权威计数器手动 +1
```

不在这里做判停、不在这里扩块——**单一职责**：判停在 `postprocess()`，扩块在 `BlockManager.may_append()`。

而被抢占（④ → ① 的红色回路）时，`preempt()` 会把 Sequence "打回原形"：`deallocate` 清空 `block_table` 并将 `num_cached_tokens` 归零、状态回 WAITING、塞回 waiting **队首**（保证它尽快被重新调度）。重算成本靠前缀缓存兜底——刚释放的满块哈希还在，重 prefill 时大概率再次命中。

---

## `__getstate__` / `__setstate__`：TP 模式下的瘦身序列化

![TP 进程间的瘦身序列化](assets/sequence_pickle_ipc.svg)

这是 83 行里最"藏巧"的一段。背景：TP 模式下每个 rank 是独立进程，`model_runner.call("run", seqs, is_prefill)` 要把整批 Sequence **pickle 后写进 SharedMemory** 发给 worker（model_runner.py 的 `write_shm`/`read_shm`）——**每个 step 都要传一次**。

```python
def __getstate__(self):
    last_state = self.last_token if not self.is_prefill else self.token_ids
    return (self.num_tokens, self.num_prompt_tokens, self.num_cached_tokens,
            self.num_scheduled_tokens, self.block_table, last_state)

def __setstate__(self, state):
    (self.num_tokens, self.num_prompt_tokens, self.num_cached_tokens,
     self.num_scheduled_tokens, self.block_table, last_state) = state
    if isinstance(last_state, list):        # prefill：还原完整列表
        self.token_ids = last_state
        self.last_token = self.token_ids[-1]
    else:                                   # decode：只还原 last_token
        self.token_ids = []
        self.last_token = last_state
```

三个巧思：

1. **按阶段裁剪载荷**。prefill（含 chunked）需要完整 `token_ids`——要为每个 token 算 KV；decode 的前向输入只有上一步刚采样的 `last_token`，传 1 个 int 就够。600 token 的 prompt，decode 每 step 省 ~600 倍 IPC 载荷
2. **`is_prefill` 本身不用序列化**。`__setstate__` 用 `isinstance(last_state, list)` 从载荷的**类型**反推阶段——信息已经在载荷里了，何必再传一份标志位
3. **敢丢 `status` / `seq_id` / `temperature` / `max_tokens`**。worker rank 的职责只有跑前向（`prepare_prefill`/`prepare_decode`/`run_model`），采样和判停都发生在 rank 0——worker 上的 Sequence 本来就不需要这些字段

这也解释了 `__init__` 里那两个"冗余"字段：**在 worker 的 decode 路径上，`num_tokens` 和 `last_token` 是仅有的权威数据源**（`token_ids` 是空列表）。

> ⚠️ **隐式契约的代价**：unpickle 出来的 Sequence 没有 `status`/`temperature` 属性，在 worker 进程里访问它们会直接 `AttributeError`。序列化瘦身省了带宽，但把"哪些字段可跨进程"的约束从类型系统降级成了口头约定——规模化代码（vLLM）通常会用显式的传输 DTO 来固化这层契约。

---

## 顺带一提：Sequence 还是"输入载体"

`ModelRunner.warmup_model()` 里有个冷知识：预热时它直接构造假序列喂前向——

```python
seqs = [Sequence([0] * seq_len) for _ in range(num_seqs)]
for seq in seqs:
    seq.num_scheduled_tokens = seq_len
self.run(seqs, True)
```

`prepare_prefill` 里对应地有 `if not seq.block_table: continue`（warmup 序列没有块，跳过 slot_mapping 构造）。也就是说 `Sequence` 除了"请求的化身"，还兼任**前向函数的输入格式**——一份 token 序列 + 一份调度元数据，恰好是 attention kernel 需要的全部。

---

## 与 vLLM 的对照

| 维度 | nano-vllm | vLLM（V1） |
|------|-----------|------------|
| 抽象层数 | **一层** `Sequence` 兼任请求与序列 | 三层：`Request`（客户端请求）→ `SequenceGroup`（n 路采样/beam）→ `Sequence`（单路） |
| 状态数 | 3（WAITING/RUNNING/FINISHED） | 8+（含 SWAPPED、PREEMPTED 等） |
| 抢占 | 只 recompute：回 WAITING 重算 | recompute / swap 两种策略 |
| `block_table` | 直接挂在 Sequence 上：`list[int]` | 独立的 `KVBlockManager`/`BlockTable` 抽象，挂在 group 上 |
| 跨进程传输 | `__getstate__` 手工裁剪 tuple | 显式 IPC 消息（`WorkerRequest` 等） |
| 采样能力 | 单路、禁 greedy（temperature > 1e-10） | n>1、beam、logprobs、各类 penalty |

nano 敢用一层，根因是**只支持单路生成**（`SamplingParams` 连 `n` 都没有）——没有 SequenceGroup 存在的理由。而 vLLM 的三层抽象、8 态状态机都是被"多路采样 + swap + 流式"这些需求逼出来的复杂度。

> 💡 **一句话总结**：`Sequence` 的每个设计（计数器冗余、类属性注入、pickle 裁剪）都在为"单卡离线、单路生成"这个最小场景服务；场景放宽任何一条，这里就要长出一层抽象。

---

## 常见陷阱

**陷阱 1：在引擎外直接用 `Sequence`，`block_size` 是默认值**
```python
# 错误认知：block_size 一定是 256
# 实际：LLMEngine 启动时被覆盖为 config.kvcache_block_size（Config 里 % 256 == 0 才合法）
```
单测里直接 `Sequence([...])` 时拿到的是类默认值，与引擎内行为可能不一致。

**陷阱 2：跨 step 读 `num_scheduled_tokens`**
```python
# 错误：step 结束后还想用 seq.num_scheduled_tokens 复盘
# 实际：postprocess 已把它清零，永远读到 0
```
它只在 schedule → 前向 → postprocess 这个窗口内有意义。

**陷阱 3：以为 `num_cached_tokens` 只跟前缀缓存有关**
它还会被 chunked prefill 推进（每算完一段就 `+= num_scheduled_tokens`）。语义统一为"**KV 已落缓存的部分**"，别按"前缀命中数"理解。

**陷阱 4：unpickle 后访问不存在的属性**
```python
# 错误：worker rank 上
if seq.status == SequenceStatus.RUNNING: ...   # AttributeError！
# 正确：worker 上只用 token/计数/block_table 这组"传输字段"
```

**陷阱 5：修改传入的 prompt 列表期望影响序列**
`__init__` 做了 `copy(token_ids)`——外部列表与序列从此是两份数据，改外部不影响引擎内。

---

## 面试要点

**Q：`Sequence` 为什么同时存 `num_tokens` 和 `token_ids`？`len(token_ids)` 不是现成的吗？**
> 因为在 TP worker 进程上两者会**解耦**：`__getstate__` 在 decode 阶段只传 `last_token` 不传列表，unpickle 后 `token_ids=[]` 而 `num_tokens` 照常——此时 `len(token_ids)` 是 0，`num_tokens` 才是权威。`last_token` 同理。这是"为序列化瘦身服务的冗余"。

**Q：WAITING → RUNNING 的确切迁移条件是什么？chunked prefill 过程中序列是什么状态？**
> 条件是 `num_cached_tokens + num_scheduled_tokens == num_tokens`，即整个 prompt（扣除前缀命中）被完整排进批。chunked prefill 中间步骤只排了一部分，序列**留在 WAITING、留在 waiting 队列**，但 `block_table` 已分配、`num_cached_tokens` 随每次 postprocess 递增——状态没变，"进度"在变。

**Q：`num_cached_tokens` 和 `num_scheduled_tokens` 分别是什么语义？为什么后者要清零？**
> 前者是**累计量**："KV 已在缓存里的 token 数"（前缀命中 + chunked 已算），只增不减（除非 deallocate/preempt 归零）；后者是**瞬时量**："本 step 排进批的 token 数"，`schedule()` 写入、前向消费、`postprocess()` 用完清零。一累计一瞬时，配合公式 `num_tokens - num_cached_tokens` 算出"还剩多少要算"。

**Q：`__getstate__` 为什么按 `is_prefill` 分两种载荷？丢了哪些字段，为什么敢丢？**
> prefill 需要完整 token_ids（每个 token 都要算 KV），decode 只需要 last_token（唯一的前向输入）。丢掉 `status`/`seq_id`/`temperature`/`max_tokens`/`is_prefill` 是因为 worker rank 只跑前向：采样、判停都在 rank 0；`is_prefill` 则由 `isinstance(last_state, list)` 从载荷类型反推，无需传输。

**Q：`block_table` 为什么放在 `Sequence` 上而不是 `BlockManager` 里？**
> block_table 是"这条序列的逻辑视图"，BlockManager 管的是"物理块池的全局账本"（free/used/ref_count/hash）。视图挂序列、账本挂管理器，`ModelRunner` 只需读序列就能组装 kernel 输入，不必反向查管理器——这是 PagedAttention 论文的原始设计。

**Q：decode 阶段什么时候分配新物理块？怎么判断？**
> `BlockManager.may_append`：`len(seq) % block_size == 1` 时——即本 step 追加 1 个 token 后恰好开启新块（如 512→513）。平均每 256 步才扩一次块，`can_append` 同式判断 free 池是否够，不够则触发 `preempt`。

**Q：`seq_id` 有什么用？为什么不用列表索引？**
> `itertools.count()` 全局单调递增，按 `add_request` 顺序分配。`generate()` 结束时按 `sorted(outputs.keys())` 恢复输入顺序；continuous batching 下各请求完成时刻参差，id 是唯一稳定的"出生序号"。用列表索引则要求序列对象全程驻留原位，与动态队列矛盾。

**Q：nano 的 `Sequence` 比 vLLM 少了什么？这些缺失意味着什么？**
> 少 SequenceGroup（无 n>1/beam）、少 SWAPPED 态（无 swap 抢占）、少 streaming 状态（无增量输出）、少采样 penalty 参数。意味着 nano 只覆盖"离线批量、单路生成"场景——恰好是吞吐 benchmark 的场景，所以它能追平 vLLM 的 bench，却不等于能替代 vLLM 上线。

---

## 小结

83 行的 `sequence.py` 是 nano-vllm 的"数据骨架"：

- **三态状态机**（WAITING/RUNNING/FINISHED）+ recompute 抢占回路，全部迁移由 Scheduler 驱动
- **四个计数器**是调度系统的通用语言：累计的 `num_cached_tokens`、瞬时的 `num_scheduled_tokens`、定格的 `num_prompt_tokens`、权威的 `num_tokens`
- **分块视图**（`num_blocks`/`last_block_num_tokens`/`block(i)`/`block_table`）把连续 token 序列映射到 paged KV Cache 的物理块，是 `slot_mapping`/`block_table` 张量的原料
- **`__getstate__` 按阶段裁剪 IPC 载荷**，decode 每 step 只传 1 个 int——性能意识渗透到每个字节

> 💡 **下一篇**：拿着这份字段表去读 [Day 3 BlockManager](../day3.md)（`block_table` 与链式哈希如何被写入）和 [Day 4 Scheduler](../day4.md)（这些计数器如何被调度循环消费）——你会发现自己已经认识了一半的代码。
