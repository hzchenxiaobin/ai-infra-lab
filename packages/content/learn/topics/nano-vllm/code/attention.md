---
id: "learn:topic:nano-vllm:code:attention"
type: learn
title: "attention.py 源码解读：75 行的 KV Cache 写读编排"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, attention, paged-attention, triton, flash-attn]
updated: 2026-09-26
topic: nano-vllm
related_problems: []
related_questions: []
---

# attention.py 源码解读：75 行的 KV Cache 写读编排

> **一句话定位**：`nanovllm/layers/attention.py` 是 nano-vllm 里唯一"手碰显存布局"的文件——一个 30 行的 Triton kernel 负责**把 K/V 散写进分页缓存**，一个 75 行的 `Attention` 模块负责**编排 flash-attn 的两种读取姿势**。引擎层（Day 3 的 BlockManager）算好的"地址簿"（slot_mapping / block_table），在这里被兑换成真正的显存读写。

## 🎯 目标

通过本文，你将：

1. 读懂 `Attention.forward` 的"先写后读"结构：为什么 store 必须发生在 attention kernel 之前
2. 逐行吃透 `store_kvcache_kernel`：grid 映射、`-1` 守卫、`D` 常量的选择，以及 `k` 其实是个**跨步视图**（stride(0) ≠ D）
3. 理解 prefill 的**两条 KV 读取路径**各自的触发条件与理由（含 chunked prefill 场景）
4. 理解 decode 路径的 `flash_attn_with_kvcache`：`cache_seqlens` 为什么含本步刚写的 token、`causal=True` 在 q_len=1 时退化成什么
5. 建立 Context 字段 ↔ 消费方的完整映射，并能对照 vLLM V1 说出"元数据传递"两种方案的取舍

> 💡 **前置知识**：[Day 3](../day3.md)（slot_mapping / block_table 的计算端）、[Day 5](../day5.md) 5.5 节（本文是其单文件深挖版）
> ⚠️ **源码版本**：[GeeeekExplorer/nano-vllm](https://github.com/GeeeekExplorer/nano-vllm) @ `bb823b3`（含 chunked prefill 重构），行号以该版本为准

---

## 这个文件站在哪

`Attention` 模块本身**不持有任何调度状态**，它消费三样东西：

| 供给方 | 内容 | 传递方式 |
|--------|------|----------|
| `models/qwen3.py` 的 `Qwen3Attention.forward` | 调用 `self.attn(q, k, v)`——q/k/v 已做完 QKV 投影、QK-Norm、RoPE | 函数参数 |
| `engine/model_runner.py` 的 `allocate_kv_cache()` | 启动时把 `k_cache` / `v_cache`（大张量的每层视图）注入实例属性 | 属性赋值 |
| `prepare_prefill` / `prepare_decode` | 本步的 `slot_mapping`、`block_tables`、`cu_seqlens_*` 等元数据 | **全局 Context 单例** |

第三条是理解本文件的钥匙：`forward(q, k, v)` 的签名干净得像论文伪代码，**因为所有"调度产物"都从 `get_context()` 天降**。代价是多实例/多线程不安全——vLLM V1 用显式传递的 `ForwardBatch` 换掉了这个全局单例（详见文末对照）。

初始时 `self.k_cache = self.v_cache = torch.tensor([])`——空张量，`numel()==0`。这个"空"持续到 `allocate_kv_cache()` 把真实缓存注入为止，中间隔着一次 warmup 前向（见下文"守卫"）。

---

## 全文骨架：三段式，75 行

```python
# nanovllm/layers/attention.py —— 全文（bb823b3）
import torch
from torch import nn
import triton
import triton.language as tl

from flash_attn import flash_attn_varlen_func, flash_attn_with_kvcache
from nanovllm.utils.context import get_context


@triton.jit
def store_kvcache_kernel(                      # ── 第一段：写入端（Triton）
    key_ptr, key_stride,
    value_ptr, value_stride,
    k_cache_ptr, v_cache_ptr,
    slot_mapping_ptr,
    D: tl.constexpr,
):
    idx = tl.program_id(0)
    slot = tl.load(slot_mapping_ptr + idx)
    if slot == -1: return
    key_offsets = idx * key_stride + tl.arange(0, D)
    value_offsets = idx * value_stride + tl.arange(0, D)
    key = tl.load(key_ptr + key_offsets)
    value = tl.load(value_ptr + value_offsets)
    cache_offsets = slot * D + tl.arange(0, D)
    tl.store(k_cache_ptr + cache_offsets, key)
    tl.store(v_cache_ptr + cache_offsets, value)


def store_kvcache(key, value, k_cache, v_cache, slot_mapping):
    N, num_heads, head_dim = key.shape
    D = num_heads * head_dim
    assert key.stride(-1) == 1 and value.stride(-1) == 1
    assert key.stride(1) == head_dim and value.stride(1) == head_dim
    assert k_cache.stride(1) == D and v_cache.stride(1) == D
    assert slot_mapping.numel() == N
    store_kvcache_kernel[(N,)](key, key.stride(0), value, value.stride(0),
                               k_cache, v_cache, slot_mapping, D)


class Attention(nn.Module):

    def __init__(self, num_heads, head_dim, scale, num_kv_heads):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = head_dim
        self.scale = scale
        self.num_kv_heads = num_kv_heads
        self.k_cache = self.v_cache = torch.tensor([])

    def forward(self, q, k, v):                # ── 第三段：读端编排
        context = get_context()
        k_cache, v_cache = self.k_cache, self.v_cache
        if k_cache.numel() and v_cache.numel():
            store_kvcache(k, v, k_cache, v_cache, context.slot_mapping)
        if context.is_prefill:
            if context.block_tables is not None:    # prefix cache
                k, v = k_cache, v_cache
            o = flash_attn_varlen_func(q, k, v,
                                       max_seqlen_q=context.max_seqlen_q, cu_seqlens_q=context.cu_seqlens_q,
                                       max_seqlen_k=context.max_seqlen_k, cu_seqlens_k=context.cu_seqlens_k,
                                       softmax_scale=self.scale, causal=True, block_table=context.block_tables)
        else:    # decode
            o = flash_attn_with_kvcache(q.unsqueeze(1), k_cache, v_cache,
                                        cache_seqlens=context.context_lens, block_table=context.block_tables,
                                        softmax_scale=self.scale, causal=True)
        return o
```

三段职责：**kernel（怎么写）→ 包装（写的契约）→ 编排（何时写、怎么读）**。nano-vllm 不自研 attention kernel——读写两端分别借力 Triton（写）和 flash-attn（读），自研的只有"编排"这层薄胶水。

---

## 整体数据流：先写后读

![Attention.forward 整体数据流：q/k/v 输入，store_kvcache 散写进分页 KV Cache，prefill 与 decode 两个分支按页读取，元数据由全局 Context 提供](assets/attention_dataflow.svg)

`forward` 的逻辑用五行伪代码就能说尽：

```text
① 查全局 Context 拿本步元数据
② 若 cache 已分配：store_kvcache 把本步 k/v 散写进 cache（写）
③ prefill？→ flash_attn_varlen_func（读，两条子路径）
④ decode ？→ flash_attn_with_kvcache（读，按页）
⑤ 返回 o
```

两个容易忽略的点：

**写永远发生在读之前，且不分 prefill/decode**。本步正在计算的 token，其 K/V 会先落进 cache，然后 attention kernel 再从 cache（或本地张量）把它读回来参与注意力。所以 decode 的 `context_lens` 是"含本步 token"的全长——**自回归的"当前 token 也要参加注意力"这条语义，靠的就是这个顺序**。

**`numel()` 守卫是给 warmup 留的**。`ModelRunner.__init__` 的时序是"先 warmup、后分配 KV 池"（要用 warmup 量出的激活峰值来推算池大小）。warmup 前向发生时 `k_cache` 还是空张量，`numel()==0` 让写入直接跳过——warmup 是一次"无缓存写入"的纯计算。`prepare_prefill` 里还有第二重保险（`if not seq.block_table: continue`，warmup 序列没有块表，slot_mapping 留空）。

---

## 写入端：store_kvcache（Triton 散写）

![store_kvcache_kernel：每个 program 处理一个 token，按 slot_mapping 查到目标槽位，K/V 各一行散写进分页 cache；slot 为 -1 的 padding 行直接 return](assets/store_kvcache_scatter.svg)

### 启动包装：四个 assert 是一份"形状契约"

```python
def store_kvcache(key, value, k_cache, v_cache, slot_mapping):
    N, num_heads, head_dim = key.shape      # num_heads 这里其实是 num_kv_heads
    D = num_heads * head_dim                # Qwen3-0.6B 单卡：8 × 128 = 1024
    assert key.stride(-1) == 1 and value.stride(-1) == 1
    assert key.stride(1) == head_dim and value.stride(1) == head_dim
    assert k_cache.stride(1) == D and v_cache.stride(1) == D
    assert slot_mapping.numel() == N
    store_kvcache_kernel[(N,)](key, key.stride(0), value, value.stride(0),
                               k_cache, v_cache, slot_mapping, D)
```

| assert | 在保证什么 |
|--------|-----------|
| `key.stride(-1) == 1` | 最内维连续——kernel 里 `tl.arange(0, D)` 才能一口气读"一行" |
| `key.stride(1) == head_dim` | 头维紧凑排列：`[H_kv, D]` 在内存里是**连续的 1024 个数**，一行 K 无需分段 |
| `k_cache.stride(1) == D` | cache 侧每个 slot 同样连续（`[256, H_kv, D]` 中 stride(1)=D），写端和读端共用这一布局 |
| `slot_mapping.numel() == N` | 一个 token 恰好对应一个槽位 |

**注意它偏偏不 assert `key.stride(0)`**——这不是疏忽。`k` 是从融合 QKV 投影里 `split` 出来的**跨步视图**（strided view）：

```python
# models/qwen3.py
qkv = self.qkv_proj(hidden_states)                       # [N, 4096]（2048 q + 1024 k + 1024 v）
q, k, v = qkv.split([q_size, kv_size, kv_size], dim=-1) # k 的 stride = (4096, 128, 1)
```

行距 4096、行宽 1024——`k` 的每一行嵌在 qkv 大矩阵里，隔行取数。所以 `key_stride` 必须作为**运行期参数**传给 kernel（`idx * key_stride`），而 `D` 作为 `tl.constexpr` 编译期烧死。一行 `split` 省掉了两次 GEMM 之间的显存整理，代价被 30 行 Triton 吃下。

### kernel 逐行

```python
idx = tl.program_id(0)                        # grid=(N,)：第 idx 个 program ↔ 第 idx 个 token
slot = tl.load(slot_mapping_ptr + idx)        # 查地址簿：这个 token 写到哪
if slot == -1: return                         # 守卫：padding 行直接退出
key_offsets = idx * key_stride + tl.arange(0, D)    # 源地址：跨步视图的第 idx 行
value_offsets = idx * value_stride + tl.arange(0, D)
key = tl.load(key_ptr + key_offsets)          # 读出一行 K
value = tl.load(value_ptr + value_offsets)    # 读出一行 V
cache_offsets = slot * D + tl.arange(0, D)    # 目的地址：slot 行起始 + 0..D-1
tl.store(k_cache_ptr + cache_offsets, key)    # 散写 K
tl.store(v_cache_ptr + cache_offsets, value)  # 散写 V（同一个 launch 顺手写完）
```

`slot` 与物理块的关系（Day 3 的公式在这里兑现）：

$$\text{slot} = \text{block\_id} \times 256 + \text{块内偏移}$$

`slot_mapping` 的两个生产端（都在 `model_runner.py`）：

| 阶段 | 生产逻辑 | 形态 |
|------|----------|------|
| prefill | 对每个序列，沿 `block_table` 逐块展开 `range(block_id*256 + 块内起, …)` | 每序列一段**连续 slot**，跨块跳变 |
| decode | `seq.block_table[-1] * 256 + seq.last_block_num_tokens - 1` | 每序列**恰好 1 个** slot |

### 为什么不用 `index_copy_`

三个理由，按重要性排序：

1. **`-1` 的掩码语义**：CUDA graph 重放时 batch 被填充到档位大小（`graph_vars["slot_mapping"].fill_(-1)`），`index_copy_` 遇到 -1 索引直接崩溃；Triton 里一个 early return 就消化了
2. **一次 launch 写两个 cache**：K/V 拷贝合成单个 kernel，少一次发射开销
3. **D 固定的行拷贝模式极简单**：30 行写对，顺带证明"引擎作者随手写 kernel"的门槛并不高

---

## 读取端 I：prefill 的两条路径

![prefill 双路径：无前缀命中时读本地连续 k/v；命中前缀或 chunked prefill 续段时改读 cache 本体并携带 block_table](assets/prefill_dual_path.svg)

```python
if context.is_prefill:
    if context.block_tables is not None:    # prefix cache
        k, v = k_cache, v_cache
    o = flash_attn_varlen_func(q, k, v, ..., block_table=context.block_tables)
```

`block_tables` 什么时候不为 `None`？看 `prepare_prefill` 的最后一行判断：

```python
if cu_seqlens_k[-1] > cu_seqlens_q[-1]:    # 要读的 K 比 本步算的 Q 多 → 有"历史"在 cache 里
    block_tables = self.prepare_block_tables(seqs)
```

即 `start = seq.num_cached_tokens > 0`。有两种情况会走到这：

1. **前缀缓存命中**：链式哈希找到了共享前缀，本步只算尾段
2. **chunked prefill 的续段**：长 prompt 被切成多块调度，第 2 块起的前文 KV 只存在于 cache

| | 路径 A：无命中（`block_tables = None`） | 路径 B：有历史（`block_tables ≠ None`） |
|---|---|---|
| attention 读哪 | **本地刚算出的 k/v**（`[total, H_kv, D]` 连续张量） | **cache 本体**（`k, v = k_cache, v_cache` + block_table 按页读） |
| 为什么 | 全部历史就是本步刚算的——连续读比页表间接寻址快 | 命中/前文部分的历史 KV **只存在于 cache**，本步只算了尾段 |
| `cu_seqlens_k` | 等于 `cu_seqlens_q`（无前文） | **全长**（含命中前缀）——kernel 靠它知道每序列读多远 |
| 新 KV | store 写入 cache，供将来 decode | 同样先写入，再按页读回 |

> ⚠️ **反直觉点**：路径 B 里，本步新算的尾段 KV 也是"先写进 cache、再从 cache 读回来"——一次冗余写读，换来的是"读永远走 paged 接口"的单一心智模型。这是典型的**用少量冗余换接口统一**。

两个 flash-attn API 名字里的信息：`varlen` = variable-length batch，靠 `cu_seqlens_q/k`（长度前缀和）把一维扁平张量切成每序列的段，`max_seqlen_q/k` 是 launch 参数；`block_table` 是**可选**能力——不传就是路径 A，传了就是路径 B，同一个 kernel 两种姿势。

---

## 读取端 II：decode 按页读

![decode 路径：q 每序列 1 个，block_tables 把逻辑块序翻译成物理块池中的散落位置，cache_seqlens 决定每个序列读多深](assets/decode_paged_read.svg)

```python
else:    # decode
    o = flash_attn_with_kvcache(q.unsqueeze(1), k_cache, v_cache,
                                cache_seqlens=context.context_lens, block_table=context.block_tables,
                                softmax_scale=self.scale, causal=True)
```

| 参数 | 值 | 含义 |
|------|-----|------|
| `q.unsqueeze(1)` | `[B, 1, H, D]` | 每序列只有 1 个新 token，补出 seqlen 维 |
| `k_cache, v_cache` | `[num_blocks, 256, H_kv, D]` | **直接把 cache 当 K/V 传入**——kernel 内部按页表 gather |
| `cache_seqlens` | `context.context_lens` | 每序列读多深：`len(seq)`，**含本步刚写入的 token** |
| `block_table` | `[B, max_blocks]`（-1 右填充） | 逻辑块序 → 物理块号的翻译表 |
| `causal=True` | 恒真 | q_len=1 时"因果掩码"退化为"看全部历史（含自己）"——语义标注而非裁剪 |

三个细节：

- **写读同一套页表**：本步新 token 的 K/V 由 `store_kvcache` 先写进末块空槽（slot 公式见上表 decode 行），kernel 随即按同一张 block_table 把它读回来。"当前 token 参加注意力"与"历史全在 cache"两件事，在 decode 里被统一成一次按页读
- **GQA 在 kernel 内部消化**：Qwen3-0.6B 是 16 个 q 头 / 8 个 kv 头（2:1 分组），q 与 cache 的头数不一致由 flash-attn 广播处理，编排层零感知
- **`-1` 右填充**：`prepare_block_tables` 把不等长的块表用 -1 补齐成矩形张量，kernel 对 -1 视作"到此为止"

---

## Context 字段 ↔ 消费方总表

| Context 字段 | prefill | decode | 生产者 |
|--------------|---------|--------|--------|
| `is_prefill` | ✓ 分支选择 | ✓ 分支选择 | `run()` 按调度阶段设置 |
| `slot_mapping` | ✓（连续段） | ✓（每序列 1 个） | `prepare_prefill/decode` |
| `cu_seqlens_q/k`、`max_seqlen_q/k` | ✓ varlen 切分 | — | `prepare_prefill` |
| `block_tables` | 仅命中/续段时构造 | ✓ 总是构造 | `prepare_block_tables` |
| `context_lens` | — | ✓ 读深 | `prepare_decode` |

注意分工：**写侧只需要 `slot_mapping`，读侧只需要页表和长度**——一份 Context 同时喂两头，这正是"写读编排"的含义。

---

## 与 vLLM V1 的对照

| 维度 | nano-vllm | vLLM V1 |
|------|-----------|---------|
| 元数据传递 | 全局 `Context` 单例 | 显式构造的 `ForwardBatch` 逐层传参 |
| 写 KV | 自研 Triton `store_kvcache` | attention backend 的 `forward()` 统一入口内部处理 |
| 读 KV | `flash_attn_varlen_func` / `flash_attn_with_kvcache` | FlashAttention backend 同款两个 API |
| cache 布局 | `[num_blocks, 256, H_kv, D]`（对齐 flash-attn 页约束） | 同构，block_size 可配 |

nano 的全局单例换来 `forward(q, k, v)` 的极简签名；vLLM 的显式传参啰嗦但**并发安全、可测试**（多引擎实例、多线程 async engine 不会互相踩踏）。单进程离线推理选前者是合理偷懒，做在线服务必须选后者。

---

## 常见陷阱

| 陷阱 | 现象 | 正确理解 |
|------|------|----------|
| 以为 prefill 永远读 cache | 纳闷路径 A 为什么传本地张量 | 无命中时读本地连续张量更快；命中/续段才按页读 |
| 忘了 `-1` 守卫 | 自己改用 `index_copy_`，CUDA graph 重放崩溃 | padding 行的中性化链条：`fill_(-1)` → kernel early return |
| 以为 `k` 是连续张量 | 自己写 kernel 时把行距当 `D` | `k` 是 qkv split 出的跨步视图，stride(0)=4096 ≠ D=1024 |
| 以为 `causal=True` 在 decode 里有裁剪作用 | 误以为省了一半计算 | q_len=1 时因果掩码退化为"看全部"，只是语义标注 |
| 手写执行循环不 `reset_context` | 上一步的 block_tables 泄漏进下一步 | `run()` 末尾的 `reset_context()` 是纪律，自己组装时要保留 |
| 忽略 warmup 守卫 | 纳闷 warmup 为什么不写 cache | 池还没分配（`numel()==0`），且 warmup 序列本来就没有块表 |

---

## 面试要点

**Q：`store_kvcache` 为什么必须发生在 attention kernel 之前？**
> 自回归语义要求"当前 token 也参加注意力"。decode 时本步 token 的 K/V 先写进末块空槽，`flash_attn_with_kvcache` 再按 `cache_seqlens`（含本步 token）读回全史——历史与当下统一成一次按页读。若先读后写，当前 token 就会在自己的注意力里缺席。

**Q：`k` 传进 kernel 时是什么内存形态？为什么 stride(0) 是运行期参数而 D 是编译期常量？**
> `k` 是融合 QKV 投影 `split` 出的跨步视图：`[N, 8, 128]`、stride=(4096, 128, 1)——行距 4096、行宽 1024。行距取决于融合宽度（还会随 TP 切分变化），必须运行期传；而行宽 D=num_kv_heads×head_dim 恒定，作为 `tl.constexpr` 烧进 kernel，`tl.arange(0, D)` 才能在编译期展开（且要求 D 是 2 的幂，1024 恰好满足）。

**Q：prefill 的两条 KV 读取路径各自的触发条件与理由？**
> 触发条件统一是 `cu_seqlens_k[-1] > cu_seqlens_q[-1]`（即 `num_cached_tokens > 0`）：前缀缓存命中，或 chunked prefill 的续段。无历史时读本地连续张量（免页表间接寻址，最快），有历史时命中部分只存在于 cache，必须 `k,v = k_cache` 并把 block_table 传给 varlen kernel 按页读。代价是尾段 KV"写进去再读回来"的冗余——用少量冗余换读路径统一。

**Q：decode 的 batch 是 13 但 CUDA graph 档位是 16，attention 侧会发生什么？**
> 静态 buffer 前 13 行是真数据、后 3 行 padding：`slot_mapping=-1` 被 Triton 守卫跳过（不写脏 cache），`context_lens=0`、block_table 全 -1 让 flash-attn 对 padding 行读不到任何块。padding 中性化是三处协作：graph 侧 `fill_(-1)`/`zero_()`、store 侧 early return、attn 侧空页表。

**Q：`flash_attn_varlen_func` 和 `flash_attn_with_kvcache` 的分工？**
> 同一个 paged cache 的两种读取姿势。varlen 服务 prefill：q 是变长批（`cu_seqlens` 切分的一维扁平张量），block_table 可选；with_kvcache 服务 decode：q 每序列 1 个（`[B,1,H,D]`），按 `cache_seqlens` 逐序列读深、block_table 必给。命名即接口文档——先看 q 的形态再选 kernel。

**Q：把全局 Context 换成显式传参，要动哪些地方？**
> `Attention.forward` 签名加 metadata 参数（或包成 dataclass 传入），`Qwen3ForCausalLM` / `DecoderLayer` 逐层透传，`model_runner.run` 构造并传递，`capture_cudagraph` 捕获时改为把静态 buffer 的引用传进图。改动本身机械，但这正是 vLLM `ForwardBatch` 存在的原因——显式依赖换来并发安全与可测试性。

---

## 小结

| 收获 | 一句话 |
|------|--------|
| 文件定位 | 75 行 = Triton 写 + flash-attn 读 + 一层编排胶水；引擎的竞争力在系统层而非重造算子 |
| 写端 | 一个 program 一个 token；`slot = block_id × 256 + 偏移`；`-1` 守卫支撑 CUDA graph padding |
| 跨步视图 | `k` 行距 4096 ≠ 行宽 1024——融合投影省显存整理，kernel 吃下复杂度 |
| prefill 双路径 | 无历史读本地连续张量；命中/续段读 cache 本体；冗余写读换接口统一 |
| decode | q 每序列 1 个；写读同一张页表；`context_lens` 含本步 token |
| 元数据 | 写侧只要 slot_mapping，读侧只要页表和长度；全局 Context vs ForwardBatch 是简洁与安全的取舍 |

**自测清单**（能答出才算过关）：

- [ ] 默写 `forward` 的"写 → 分支读 → 返回"结构，说出 `numel()` 守卫服务的时序
- [ ] 解释四个 assert 各自在保证什么，为什么偏偏不查 `stride(0)`
- [ ] 说出 prefill 双路径的统一触发条件（`cu_seqlens_k > cu_seqlens_q`）与两条触发场景
- [ ] 算一道 slot 题：序列长 700、block_table=[3,1,7]，本步新 token 的 slot 是多少？（答：`7×256 + 188 − 1 = 1979`）
- [ ] 解释 `context_lens` 为什么含本步刚写的 token，`causal=True` 在 decode 中退化成什么

---

## 推荐资源

- ⭐ [nano-vllm 仓库](https://github.com/GeeeekExplorer/nano-vllm)——本文解读的 `nanovllm/layers/attention.py`
- ⭐ [flash-attn 仓库](https://github.com/Dao-AILab/flash-attention)——`flash_attn_varlen_func` / `flash_attn_with_kvcache` 的接口文档与 paged KV 约定
- 📌 [Efficient Memory Management for LLM Serving with PagedAttention](https://arxiv.org/abs/2309.06180)——分页 KV cache 的原始论文
- 📌 [Day 3：BlockManager 与 slot_mapping](../day3.md) · [Day 5：模型执行与算子层](../day5.md)——本文的上下游语境
