---
id: "learn:topic:nano-vllm:d3"
type: learn
title: "Day 3：BlockManager——分页 KV Cache 与前缀缓存"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, paged-attention, prefix-caching, kv-cache]
updated: 2026-09-25
day: 3
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 3：BlockManager——分页 KV Cache 与前缀缓存

## 🎯 目标

通过今天的学习，你将：

1. 逐行精读 `engine/block_manager.py`（~150 行）——nano-vllm 最精华的文件，也是 [vLLM 论文](../../paper/vllm/README.md) §3-§4 的最小真实实现
2. 吃透三组方法：`can_allocate`/`allocate`/`deallocate`（进批时的缓存命中与块申请）、`can_append`/`may_append`（decode 时按需扩块）、`hash_blocks`（step 后增量登记满块哈希）
3. 深挖三个细节：① 链式哈希为什么用前一块哈希做盐 ② `ref_count` 什么时候 > 1 ③ `_allocate_block` 里为什么要**带条件地**删旧哈希映射
4. 弄清 KV Cache 池的物理形态：`allocate_kv_cache` 如何用 warmup 峰值推算块数，`[2, layers, blocks, block_size, kv_heads, head_dim]` 这个大张量如何被各层共享
5. 亲手算出 `slot_mapping`：它在哪里生成（`model_runner` 的 prepare 系列）、公式是什么、怎么被 Triton kernel 消费（衔接 Day 5）
6. 产出两张图：**逻辑块 → block table → 物理块映射图** + **链式哈希更新时序图**

> 💡 **前置知识**：[Day 2](day2.md) 的三个数字字段（`num_cached_tokens`/`num_scheduled_tokens`/`block_table`）——今天它们全部登场；[Week 5 Day 4](../../daily/week5/day4/README.md) 的手写 PagedAttention 热身
> ⚠️ **环境要求**：任务 B/C 是**纯 Python 实验，无需 GPU**——BlockManager 不碰显存，这正是今天能"玩转"它的原因

---

## 为什么 BlockManager 是"最精华的 150 行"

vLLM 的两大创新里，Continuous Batching 的想法在 Orca 之前就有雏形，而 **PagedAttention 是定义性的**——它把 OS 虚拟内存的页表思想搬进 KV Cache 管理。nano-vllm 把这套机制压缩到 150 行：

| 机制 | vLLM 论文中的概念 | nano-vllm 中的实现 | 行数级 |
|------|-------------------|--------------------|--------|
| 分页 KV Cache | logical block → block table → physical block | `Block` + `free_block_ids` + `seq.block_table` | ~40 |
| 共享与引用计数 | copy-on-write 前置条件的 ref_count | `Block.ref_count` | ~10 |
| 前缀缓存 | vLLM APC（block 哈希） | **链式哈希** + `hash_to_block_id` 字典 | ~50 |
| 按需扩块 | 每序列每步最多新分配一个块 | `can_append`/`may_append` 两行 | ~5 |

> 💡 **一句话总结**：Day 2 的 `step()` 三段式是"骨架"，今天的 BlockManager 是"心脏"——调度器的每个决策（能不能进批、要不要抢占）本质上都在问 BlockManager 一个问题。

---

## 核心概念

### 3.1 分页解决什么：从 60-80% 浪费到 ~4%

回顾问题（[vLLM 论文](../../paper/vllm/README.md) §3 的核心动机）：传统框架按 `max_model_len` 为每个请求**预分配连续** KV Cache：

| 浪费类型 | 来源 | 量级 |
|----------|------|------|
| 内部碎片 | 预留 2048，实际生成 200 | 与长度分布相关，常达 50%+ |
| 外部碎片 | 连续分配需要整块显存，大小不一难复用 | 20-60% |
| **合计** | 论文实测（图 5-6） | **60-80%** |

分页方案：KV Cache 切成定长块，序列持有**逻辑块号**，`block_table` 映射到**物理块号**，按需分配、逻辑连续物理离散——浪费只剩每个序列最后一个不满块（论文数据 <4%）。

一个立刻要面对的取舍——**块大小**：

| 块大小 | 元数据开销 | 内部碎片 | 谁用 |
|--------|-----------|----------|------|
| 16 token | 高（长序列 block table 很长） | 低（<16 token/序列） | vLLM 论文/默认 |
| 256 token | 低 | 高（最长 255 token/序列） | **nano-vllm**（对齐 flash-attn 的 page 约束，Config 里 `assert kvcache_block_size % 256 == 0`） |

> ⚠️ **注意**：block_size 是 256 的倍数是 flash-attn paged 接口的硬约束，不是自由参数——**算子接口的约束会向上穿透到显存管理层的参数选择**，这是推理引擎分层的典型耦合。

### 3.2 物理世界：KV Cache 池长什么样

BlockManager 管理的"物理块"，实体是 `model_runner.py` 里 `allocate_kv_cache()` 分配的**一个大张量**：

```python
# engine/model_runner.py —— allocate_kv_cache() 核心逻辑
free, total = torch.cuda.mem_get_info()
used = total - free                                          # 已占用（含刚加载的权重）
peak = torch.cuda.memory_stats()["allocated_bytes.all.peak"]
current = torch.cuda.memory_stats()["allocated_bytes.all.current"]

block_bytes = 2 * hf_config.num_hidden_layers * self.block_size \
              * (num_kv_heads // world_size) * head_dim * hf_config.dtype.itemsize
config.num_kvcache_blocks = int(total * config.gpu_memory_utilization
                                - used - peak + current) // block_bytes

self.kv_cache = torch.empty(2, num_hidden_layers, num_kvcache_blocks,
                            self.block_size, num_kv_heads_per_rank, head_dim)
for module in self.model.modules():        # 把每层的视图挂到 Attention 模块上
    if hasattr(module, "k_cache"): ...
    module.k_cache = self.kv_cache[0, layer_id]
```

三个要点：

1. **池大小公式**：`util×总显存 − 权重 − (peak − current)`。其中 `peak − current` 是 warmup 前向的**临时激活峰值**——这就是 `__init__` 里 `warmup_model()` 必须发生在 `allocate_kv_cache()` **之前**的原因：先用最大 batch 跑一次前向，才能量出激活要用多少
2. **每 token KV 字节数**（面试高频公式）：
   $$\text{bytes/token} = 2_{K,V} \times L_{\text{layers}} \times H_{kv} \times d_{\text{head}} \times \text{dtype 字节数}$$
   以 Qwen3-0.6B（28 层、8 KV 头、head_dim 128、BF16）为例：$2 \times 28 \times 8 \times 128 \times 2 = 112$ KB/token，一个 256-token 块 = **28 MiB**（以你手头模型的 `hf_config` 实际值为准）
3. **所有层共享一次分配**：`[2, layers, blocks, block_size, kv_heads, head_dim]` 一个张量装下全部层的 K 和 V，再切视图挂到每个 Attention 模块——避免 56 次独立分配的碎片

### 3.3 Block 的三本账：used / free / hash

```python
class Block:
    def __init__(self, block_id):
        self.block_id = block_id
        self.ref_count = 0      # 被几个序列引用
        self.hash = -1          # 满块内容的链式哈希（-1 = 未登记）
        self.token_ids = []     # 满块时的内容快照（碰撞防御用）

class BlockManager:
    def __init__(self, num_blocks, block_size):
        self.blocks = [Block(i) for i in range(num_blocks)]
        self.hash_to_block_id: dict[int, int] = dict()   # 哈希 → 块号
        self.free_block_ids: deque[int] = deque(range(num_blocks))   # 空闲表
        self.used_block_ids: set[int] = set()                        # 使用集
```

关键洞察：**一个物理块有三种生存状态**，`free` 和 `hash` 两个账本是**交叠**的：

| 状态 | 在 used？ | 在 free？ | 有 hash？ | 含义 |
|------|-----------|-----------|-----------|------|
| 使用中 | ✓ | ✗ | 可能 | 被活序列持有（ref_count ≥ 1） |
| 纯空闲 | ✗ | ✓ | ✗ | 从未被缓存 / 复用时被 reset |
| **空闲但可缓存** | ✗ | ✓ | **✓** | 序列结束了，但内容的哈希还登记着——**这就是前缀缓存池** |

第三态是 prefix caching 的全部魔法：`deallocate` **不删哈希**，块回到 free 表但"记忆"还在；新请求哈希命中它可以直接复用。真正的"遗忘"发生在 `_allocate_block` 复用它装新内容时。

**淘汰策略藏在 deque 的方向里**：`_deallocate_block` 往 free 表**右端**追加，`_allocate_block` 从**左端**弹出——最久释放的块最先被复用，最近释放（缓存价值最新鲜）的尽量保留。这是一个**近似 LRU**（按释放时间而非访问时间），没有 vLLM evictor / SGLang radix tree 那套显式 LRU，但方向是对的。

### 3.4 三组方法逐行精读

#### 3.4.1 进批：`can_allocate` / `allocate` / `deallocate`

`can_allocate` 返回**两个信息编码在一个 int 里**：命中了几块缓存；`-1` 表示"算上缓存，空闲块也不够"：

```python
def can_allocate(self, seq) -> int:
    h = -1
    num_cached_blocks = 0
    num_new_blocks = seq.num_blocks          # 先按"全部要新块"记账
    for i in range(seq.num_blocks - 1):      # 注意 -1：最后一个（不满）块不参与匹配
        token_ids = seq.block(i)
        h = self.compute_hash(token_ids, h)  # 链式哈希，见 3.5
        block_id = self.hash_to_block_id.get(h, -1)
        if block_id == -1 or self.blocks[block_id].token_ids != token_ids:
            break                            # 断链即停：后面的块不可能再命中
        num_cached_blocks += 1
        if block_id in self.used_block_ids:
            num_new_blocks -= 1              # ★ 共享活块不消耗空闲池
    if len(self.free_block_ids) < num_new_blocks:
        return -1                            # 显存不够（scheduler 据此 break）
    return num_cached_blocks
```

**★ 记账细节**（容易看漏的一行）：`num_new_blocks` 的初值是"序列需要的全部块数"，然后对每个命中的块做区分：

- 命中的块**在使用中**（别的活序列持有）→ 共享它不花空闲池 → `num_new_blocks -= 1`
- 命中的块**空闲但可缓存** → 它本身就在 free 表里，被激活时从 free 表移除 → 仍然占一个空闲名额，**不减**
- 未命中的块 → 从 free 表新分配 → 占一个

所以最后的 `len(free) < num_new_blocks` 检查是精确的——三种情况一笔账算清。

`allocate` 是 can_allocate 的执行版：命中块**逐块** `ref_count += 1`（或从 free 表激活——**注意此时不 reset、不清哈希**，缓存内容原封不动），未命中块走 `_allocate_block` 领新块。最后 `seq.num_cached_tokens = num_cached_blocks × block_size`——Day 2 那个数字字段的第一次赋值就在这里。

`deallocate` 是引用计数的减法，`ref_count` 减到 0 才真正归还 free 表——**且归还时不清哈希**（第三态诞生的地方）。

#### 3.4.2 扩块：`can_append` / `may_append`

decode 时每序列每步只多 1 个 token，扩块需求最多 1 块：

```python
def can_append(self, seq) -> bool:
    return len(self.free_block_ids) >= (len(seq) % self.block_size == 1)

def may_append(self, seq):
    if len(seq) % self.block_size == 1:
        seq.block_table.append(self._allocate_block())
```

`(len(seq) % block_size == 1)` 是个 bool，当 int 用（0/1）。**为什么 `len % bs == 1` 恰好是需要新块的时刻？** 推导一遍（这是今天最值得手推的等式）：

- decode 步的输入是刚生成的 `last_token`（位置 `len(seq)-1`），它的 KV 本步要写入 cache
- 它在尾块的偏移是 `last_block_num_tokens - 1`（见 3.6 的 slot 公式）
- `len % bs == 1` ⟺ `len - 1` 是 bs 的整数倍 ⟺ 之前的 token **恰好填满**若干整块 ⟺ 新 token 是**新块的第 0 个**
- 其余时刻尾块还有空位，不用扩块

scheduler 的 decode 路径（Day 4）每步先问 `can_append`，答不上来就抢占别的序列腾块——这两个两行的方法是抢占逻辑的地基。

#### 3.4.3 登记：`hash_blocks`（step 结束时增量登记满块）

```python
def hash_blocks(self, seq):
    start = seq.num_cached_tokens // self.block_size          # 第一个未登记的块号
    end = (seq.num_cached_tokens + seq.num_scheduled_tokens) // self.block_size   # 本步刚写满的块号（开区间）
    if start == end: return                                   # 没有新的满块，直接返回
    h = self.blocks[seq.block_table[start - 1]].hash if start > 0 else -1   # ★ 从链头续算
    for i in range(start, end):
        block = self.blocks[seq.block_table[i]]
        token_ids = seq.block(i)
        h = self.compute_hash(token_ids, h)
        block.update(h, token_ids)                            # 块上存哈希 + 内容快照
        self.hash_to_block_id[h] = block.block_id             # 字典登记（同内容后到者覆盖）
```

三个细节：

1. **只登记满块**：`end` 用整除计算，本步没写满的尾块自动排除——尾块还会追加 token，登记了立刻失效
2. **增量续算**：`h` 从 `start-1` 块的哈希续起，不用从头重算——链式哈希的"前缀可续"性质（3.5）
3. **内容快照**：`block.update` 把 `token_ids` 存进 Block 对象——多花一点内存，换来 `can_allocate` 的碰撞防御（比对内容）O(1) 可用

调用时机在 `scheduler.postprocess`（Day 2 埋的线）：`hash_blocks(seq)` → `num_cached_tokens += num_scheduled_tokens`——**先登记后回填**，顺序不能反（回填会改变 start 的计算）。

### 3.5 链式哈希：前缀缓存的灵魂

```python
@classmethod
def compute_hash(cls, token_ids, prefix=-1):
    h = xxhash.xxh64()
    if prefix != -1:
        h.update(prefix.to_bytes(8, "little"))    # 前一块的哈希做"盐"
    h.update(np.array(token_ids).tobytes())
    return h.intdigest()
```

**为什么用前一块的哈希做盐？** 因为第 $n$ 块的哈希变成了：

$$h_n = H(h_{n-1} \| \text{tokens}_n) = H(H(H(\cdots H(\text{tokens}_0) \cdots)\|\text{tokens}_{n-1}) \| \text{tokens}_n)$$

$h_n$ **是前 0..n 块全部内容的函数**。于是三个性质自动成立：

1. **前缀语义**：新请求逐块查 `hash_to_block_id`，命中到第 k 块 ⟺ 它与缓存拥有完全相同的前 (k+1) 块内容——**最长前缀匹配不用写任何匹配代码，查字典查到断链为止**
2. **断链即停**：第 i 块不命中，i 之后必然全不命中（链式依赖），`can_allocate` 里 `break` 是安全的
3. **增量可续**：`hash_blocks` 从上一块的哈希接着算，不用重算整个前缀

对比另外两个引擎的前缀缓存，机制差异一目了然：

| 引擎 | 匹配粒度 | 数据结构 | 淘汰 |
|------|----------|----------|------|
| nano-vllm | block 级（256 tok） | 链式哈希字典 | free 表 FIFO（近似 LRU） |
| vLLM APC | block 级（16 tok） | 块哈希 + evictor | 显式 LRU |
| SGLang RadixAttention | **token 级** | 基数树 + LRU | 显式 LRU（详见 [SGLang 专题](../sglang/README.md)） |

**碰撞防御**：xxhash 非密码学哈希，理论可碰撞。防御就一行——`can_allocate` 里命中后比对 `block.token_ids != token_ids`（3.4.1 的 break 条件）。**哈希负责快，内容比对负责对**。

**`_allocate_block` 为什么要带条件地删旧映射**——把这两个方法连起来看：

```python
def _allocate_block(self) -> int:
    block_id = self.free_block_ids.popleft()
    block = self.blocks[block_id]
    if block.hash != -1 and self.hash_to_block_id.get(block.hash) == block_id:
        del self.hash_to_block_id[block.hash]     # 条件删除！
    block.reset()                                  # 清 hash 与 token_ids
    ...
```

复用一块"空闲但可缓存"的块装新内容，它旧的哈希登记就**过期**了（哈希还在字典里，但块的内容即将不匹配）——不删的话，后续 `can_allocate` 会命中它，然后被内容比对拦下（浪费一次假命中）。那为什么还要加 `get(block.hash) == block_id` 的条件？设想这个场景：

```text
t1: 序列 A 内容 T → 块 3，登记 hash(T) → 3
t2: 序列 B 内容也是 T → 块 7（A 占着 3，B 不能共享？不——B 会共享块 3……
    换个场景：A 结束释放块 3，B 到来命中块 3，此时 B 结束释放块 3 → 块 3 空闲可缓存
t3: 序列 C 内容 T 到来 → 命中块 3，ref=1；但 C 还没跑完时块 3 又被……
```

真正触发条件分支的场景：**同一内容曾被登记到两个不同块**（比如两个序列内容相同、时间上错开，哈希被后到者覆盖：`hash_to_block_id[h] = 新块号`）。此时复用旧块装新内容，字典里 `h` 指向的是**另一个仍然有效的块**——无条件 `del` 会把有效映射误删。条件判断保证只删"确实指向自己"的映射。

> 💡 **一句话总结**：链式哈希让"最长前缀匹配"退化成"逐块查字典"，内容快照让"哈希碰撞"退化成"一次多余的比对"——两个O(1) 换掉了整棵树。

### 3.6 slot_mapping 的生产与消费

Day 1 留的问题今天闭环。**生产端**在 `model_runner.py` 的 prepare 系列：

**decode**（每序列一行，公式直白）：

```python
# engine/model_runner.py —— prepare_decode() 节选
slot_mapping.append(seq.block_table[-1] * self.block_size
                    + seq.last_block_num_tokens - 1)
```

即 `物理块号 × block_size + 尾块内偏移`——把"逻辑第 len-1 个 token"翻译成"池子里的扁平槽位"。

**prefill**（按块区间展开，chunked prefill 天然支持）：

```python
# engine/model_runner.py —— prepare_prefill() 节选
start = seq.num_cached_tokens          # 前缀缓存命中的部分不算
end = start + seq.num_scheduled_tokens
start_block = start // self.block_size
end_block = (end + self.block_size - 1) // self.block_size
for i in range(start_block, end_block):
    slot_start = seq.block_table[i] * self.block_size       # 块首槽位
    if i == start_block: slot_start += start % self.block_size   # 首块跳过已缓存部分
    ...
```

注意 `start` 从 `num_cached_tokens` 起跳——**前缀缓存命中的 token 既不算输入也不占 slot**，这就是"命中即免计算"在张量构造层的落点。

**消费端**是 Day 5 的主角，今天先看 10 行预告（`layers/attention.py`）：

```python
@triton.jit
def store_kvcache_kernel(key_ptr, ..., slot_mapping_ptr, ...):
    idx = tl.program_id(0)              # 一个 program 处理一个 token
    slot = tl.load(slot_mapping_ptr + idx)
    if slot == -1: return               # padding 行直接跳过
    tl.store(k_cache_ptr + slot * D + tl.arange(0, D), key)   # 散写到槽位
    tl.store(v_cache_ptr + slot * D + tl.arange(0, D), value)
```

读 KV 的另一侧（flash-attn）消费的则是 `block_table` 整表——**写入按 token 散（slot_mapping），读取按序列聚（block_table）**，这是 paged KV 的一体两面。

---

## 动手实践

### 任务 A：逐行精读 block_manager.py（60 分钟）

推荐三遍读法：

| 遍次 | 关注 | 自问 |
|------|------|------|
| 第一遍 | 数据结构 | Block 三本账各是什么？第三态（空闲可缓存）怎么形成？ |
| 第二遍 | 三组方法 | can_allocate 的记账为什么精确？may_append 的取模条件怎么推出来的？hash_blocks 的 start/end 为什么是那两个整除？ |
| 第三遍 | 边界 | 尾块为什么不哈希？deallocate 为什么不删哈希？_allocate_block 为什么要条件删除？ |

对照本文 3.3-3.5 节，把答不出的问题标记出来，用任务 B 的实验验证。

### 任务 B：纯 Python 玩转 BlockManager（45 分钟，无需 GPU）

`BlockManager` 不碰显存，可以直接实例化做实验。把块缩小到 2 token，全程手推可验证：

```python
# block_playground.py —— 无 GPU 的 BlockManager 实验
# 运行: python3 block_playground.py（只需 nanovllm 可 import，不需要模型/GPU）

from nanovllm.engine.sequence import Sequence
from nanovllm.engine.block_manager import BlockManager

Sequence.block_size = 2                       # 覆盖类属性：2 token 一块，方便手推
bm = BlockManager(num_blocks=8, block_size=2)

# ===== 第 1 幕：首次分配 + 哈希登记 =====
A = Sequence([10, 11, 12, 13, 14])            # 5 token → 3 个逻辑块（尾块 1 token）
print("A 的逻辑块数:", A.num_blocks)            # 3
print("can_allocate:", bm.can_allocate(A))    # 0 —— 空池无命中（不是 -1）
bm.allocate(A, 0)
print("A block_table:", A.block_table)        # [0, 1, 2]

# 模拟 scheduler.postprocess 的三步
A.num_scheduled_tokens = 5
bm.hash_blocks(A)                             # 登记：块0=[10,11] 块1=[12,13]（块2 不满，不登记）
A.num_cached_tokens += A.num_scheduled_tokens
A.num_scheduled_tokens = 0

# ===== 第 2 幕：前缀命中 + ref_count 共享 =====
B = Sequence([10, 11, 12, 13, 99, 98])        # 与 A 共享前 4 个 token
n = bm.can_allocate(B)
print("B 命中块数:", n)                         # 2 —— 前两块命中
bm.allocate(B, n)
print("B block_table:", B.block_table)        # [0, 1, 3] —— 前两块共享，第 3 块新分配
print("块0 ref_count:", bm.blocks[0].ref_count) # 2 —— ★ 共享发生
print("B num_cached_tokens:", B.num_cached_tokens)  # 4 —— 4 个 token 免计算

# ===== 第 3 幕：引用计数下的释放 =====
bm.deallocate(A)                              # A 结束
print("释放 A 后 块0 ref_count:", bm.blocks[0].ref_count)  # 1 —— B 还在用，没真正归还
print("空闲表:", list(bm.free_block_ids))       # [4, 5, 6, 7, 2] —— 只有块 2 真正归还
print("块0 还有哈希吗:", bm.blocks[0].hash != -1)  # True —— 第三态：在用+可缓存

bm.deallocate(B)                              # B 也结束
print("全部释放后空闲表:", list(bm.free_block_ids))  # [4, 5, 6, 7, 2, 0, 1, 3]
print("块0 还有哈希吗:", bm.blocks[0].hash != -1)  # True —— ★ 空闲但哈希仍在 = 缓存池

# ===== 第 4 幕：从"空闲可缓存"状态命中 =====
C = Sequence([10, 11, 12, 13, 55])            # A、B 都走了，缓存还在
n = bm.can_allocate(C)
print("C 命中块数:", n)                         # 2 —— 从 free 表里"复活"了块 0、1
bm.allocate(C, n)
print("C block_table:", C.block_table)        # [0, 1, 4] —— 0/1 复活，尾块领了新块 4
print("块0 内容没被清吧:", bm.blocks[0].token_ids)   # [10, 11] —— 内容原封未动

# ===== 第 5 幕：decode 扩块时序 =====
C.append_token(66)                            # len=6，6%2=0
print("需要新块吗:", len(bm.free_block_ids) >= (len(C) % 2 == 1))  # False（can_append 同式）
C.append_token(77)                            # len=7，7%2=1 → 下一个 token 要开新块
bm.may_append(C)                              # block_table 追加新块 5
print("C block_table:", C.block_table)        # [0, 1, 4, 5]
slot = C.block_table[-1] * 2 + C.last_block_num_tokens - 1
print("token 77 的 slot:", slot)               # 5*2 + 1 - 1 = 10 —— 对上 prepare_decode 公式
```

跑之前先自己推一遍每幕的预期输出，再运行对照——**不一致的地方就是你的理解盲区**。

再做一个 5 分钟小实验——**亲手制造哈希碰撞**，验证防御机制：

```python
# collision_test.py —— 强制碰撞，观察 can_allocate 的内容比对防御
from nanovllm.engine.sequence import Sequence
from nanovllm.engine.block_manager import BlockManager

Sequence.block_size = 2
bm = BlockManager(8, 2)
BlockManager.compute_hash = classmethod(lambda cls, token_ids, prefix=-1: 42)  # 退化哈希：全部碰撞

X = Sequence([1, 2])
bm.allocate(X, 0)
X.num_scheduled_tokens = 2
bm.hash_blocks(X)                             # 登记 hash=42 → 块 0，内容 [1,2]

Y = Sequence([3, 4, 5, 6])
print(bm.can_allocate(Y))                     # 0 —— 哈希命中了块 0，但 [3,4] != [1,2]，break
```

### 任务 C：slot_mapping 手算（15 分钟）

block_size = 256，某序列 prompt 600 token，`block_table = [7, 3, 9]`，无前缀命中。手算三问（答案在文末）：

1. **整段 prefill**（`num_scheduled_tokens = 600`）：600 个 token 分别写到哪些 slot 区间？
2. **chunked prefill 第一片**（`num_scheduled_tokens = 300`）：本片写到哪些 slot？
3. 若该序列已生成到 `len(seq) = 601`（decode 步）：本步 token 的 slot 是多少？需要扩块吗？

### 任务 D：画两张图（30 分钟）

不看本文，画：

1. **映射图**：某序列 5 个逻辑块 → block_table → 物理块池（池里画出：2 块被别的序列占用、1 块空闲可缓存、1 块纯空闲），标出每块 ref_count
2. **链式哈希时序图**：序列 A 首次 prefill → hash_blocks 登记 h0、h1 → 序列 B（共享前缀）can_allocate 逐块查表 → B 结束释放 → 序列 C 命中"空闲可缓存"的块——五个时刻，每步标出 `hash_to_block_id` 字典和 free 表的变化

画完夹进笔记，Day 7 迁移 vLLM 时直接对照 `kv_cache_manager`。

### 学习时间安排（共 2.5 小时）

| 时长 | 内容 |
|---|---|
| 30 分钟 | 理论：本文 3.1-3.3 节 |
| 60 分钟 | 任务 A：三遍读法精读源码 |
| 45 分钟 | 任务 B：playground + 碰撞实验 |
| 15 分钟 | 任务 C：slot 手算 |
| 30 分钟 | 任务 D：两张图 |

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| 以为 `can_allocate` 返回 0 是失败 | `0` = 无缓存可命中但可以分配；`-1` 才是显存不够 | 读接口先分清"业务否"与"资源否"两种失败语义 |
| 直接改 `kvcache_block_size` 做小块实验 | `assert kvcache_block_size % 256 == 0` 崩溃 | 块大小是 flash-attn 硬约束；小块实验用任务 B 的纯 Python 方式 |
| 以为 deallocate 会清缓存 | 担心"序列结束缓存就没了" | 恰恰相反——释放**保留**哈希，缓存池因此存在 |
| 以为哈希碰撞会算错结果 | 担心 prefix caching 正确性 | 内容比对兜底，碰撞只浪费一次假命中，不会错 |
| 手推 may_append 时用错基准 | 拿"生成后的长度"取模 | 用 `len(seq)`（**含刚 append 的 token**）对 bs 取模，==1 才扩块 |
| 忽视 free 表的 FIFO 语义 | 以为淘汰是随机的 | popleft 从最老的空闲块开始复用——近似 LRU，方向性设计 |

---

## 面试要点

**Q：链式哈希为什么用前一块的哈希做盐？相比"整段前缀直接哈希"好在哪？**
> 盐让第 n 块的哈希成为前 0..n 块全部内容的函数，于是：① 最长前缀匹配退化为逐块查字典，命中到断链为止，无需匹配算法；② 第 i 块失配则其后必然失配，break 安全；③ 增量可续——新 token 写满一块时从上一块哈希接着算，不用重算前缀。"整段哈希"每来一个新块都要 O(前缀长度) 重算，且只能整段命中、无法部分复用。

**Q：`ref_count` 什么场景下会大于 1？为什么 deallocate 不能直接归还块？**
> 前缀缓存命中共享：新序列与活序列共享同一物理块时 `ref_count += 1`。释放必须走引用计数减法，减到 0 才归还——否则 B 还在用的块被 A 的结束释放掉，KV 数据被新块覆盖，B 的注意力直接算错。vLLM 中并行采样（一个 prompt 采 n 路）和 beam search 会大量制造这种共享，CoW（写时复制）也建立在 ref_count 之上。

**Q：为什么只对"满块"做哈希登记？**
> 尾块还会追加 token，内容未定；登记后内容一变，哈希立刻过期，反而制造假命中（内容比对拦得住但浪费查表）。满块永不再写（append 只写尾块或新块），哈希一旦登记终身有效，直到块被 `_allocate_block` 复用 reset。代价是前缀缓存的最小粒度 = 一个块（256 token）——边界不对齐时最多浪费 255 token 的可复用前缀，这正是 SGLang 做 token 级 radix tree 的动机之一。

**Q：`_allocate_block` 里删除旧哈希映射为什么要加条件判断？**
> 防误删仍然有效的映射。场景：同一内容曾被登记到两个块（时间上错开的两批相同请求，后登记者覆盖字典），字典里 `hash → 另一个块`。此时复用本块装新内容，若无条件 `del hash_to_block_id[block.hash]`，会把指向另一块的**有效**映射删掉，那个块的缓存从此查不到。条件 `get(hash) == block_id` 保证只删"确实指向自己"的映射。

**Q：decode 每步最多分配几个新块？`len(seq) % block_size == 1` 这个判据怎么来的？**
> 最多 1 个。decode 输入的 token 位于位置 `len(seq)-1`，其槽位偏移为 `last_block_num_tokens - 1`；当且仅当前面的 token 恰好填满整数块（即 `len % bs == 1`）时，这个 token 是新块的第 0 个，才需要扩块。等价判据：`last_block_num_tokens == 1`。prefill 则可能一次扩很多块（`allocate` 里循环领块），因为一次写入大量 token。

**Q：KV Cache 池的块数是怎么算出来的？为什么 warmup 必须在分配之前？**
> `块数 = (gpu_memory_utilization × 总显存 − 权重占用 − 激活临时峰值) ÷ block_bytes`，其中 `block_bytes = 2 × 层数 × block_size × KV头数/TP度 × head_dim × dtype字节`。激活临时峰值用 `peak − current` 估计——而 peak 要靠 warmup 跑一次最大规模前向才能量出来，所以 `warmup_model()` 必须先于 `allocate_kv_cache()`。这是"先测量后分配"的显存预算模式，vLLM 的 profile_run 同理。

**Q：nano-vllm 的前缀缓存没有 LRU，缓存不会被冲刷干净吗？**
> 有隐式淘汰：free 表是 deque，释放时 append 到右端、复用时 popleft 从左端——最久释放的块最先被复用，最近释放（缓存最新鲜）的尽量保留，是按"释放时间"的近似 LRU。与 vLLM evictor（显式 LRU 队列）、SGLang（radix tree 叶子起 LRU 淘汰）相比粒度粗、无访问时间信息，但零额外数据结构——150 行预算内的合理取舍。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| 物理形态 | 池 = `[2, layers, blocks, block_size, kv_heads, head_dim]` 一个大张量；块数 = 预算公式；warmup 先行 |
| 三本账 | used 集 / free deque / hash 字典两两交叠；"空闲可缓存"第三态 = 前缀缓存池；FIFO ≈ 近似 LRU |
| 三组方法 | can_allocate 记账精确到"共享不耗池"；may_append 的取模判据可手推；hash_blocks 增量登记满块 |
| 链式哈希 | 前块哈希做盐 → 前缀语义 + 断链即停 + 增量可续；内容快照兜底碰撞；条件删除防误删 |
| slot_mapping | 生产在 prepare_prefill/decode（`块号×bs+偏移`），消费在 Triton store_kvcache；写入散、读取聚 |
| 实验体感 | ref_count 共享、第三态命中、扩块时序、碰撞防御全部亲手复现 |

**自测清单**（能答出才算过关）：

- [ ] 默写 Block 三本账，说出"空闲可缓存"状态怎么形成、怎么消失
- [ ] 手推 `len(seq) % block_size == 1` 与 slot 偏移公式的一致性
- [ ] 解释链式哈希的三个性质各自省掉了什么
- [ ] 说出 `_allocate_block` 条件删除映射防御的具体场景
- [ ] 用 Qwen3-0.6B 的 config 算出每 token KV 字节数和一个块的 MiB
- [ ] 任务 B 五幕的预期输出全部推对

**📦 今日产出**：映射图 + 链式哈希时序图 + playground 实验记录（含碰撞防御）。

---

> 📌 **明日预告**：Day 4 读 `engine/scheduler.py`（~100 行）——今天学的 BlockManager 三组方法将全部被调度器调用：prefill 路径的 token 预算组批与 chunked prefill（那个只切第一个序列的分支）、decode 路径的 `can_append` 检查与 recompute 抢占（`preempt` 如何把序列打回 waiting 队首）、以及 `postprocess` 如何串起 hash_blocks 与判停。

---

**附：任务 C 答案**

1. 块 7 全部：`7×256+0 ~ 7×256+255`（256 个）；块 3 全部：`3×256+0 ~ +255`（256 个）；块 9 部分：`9×256+0 ~ 9×256+87`（600−512=88 个）。共 600
2. 第一片只覆盖前 300 token：块 7 全部 256 个 + 块 3 的 `3×256+0 ~ +43`（300−256=44 个）。第二片从 `num_cached_tokens=300` 续起
3. `len=601`：尾块偏移 = `601 − 2×256 = 89`，slot = `9×256 + 89 − 1 = 2303`；`601 % 256 = 89 ≠ 1`，不需扩块
