---
id: "learn:topic:nano-vllm:code:qwen3"
type: learn
title: "源码解读：qwen3.py——216 行组装一台 Qwen3 解码器"
tags: [nano-vllm, qwen3, vllm]
knowledge_points: [nano-vllm, qwen3, gqa, rope, rmsnorm, tensor-parallelism]
updated: 2026-09-26
topic: nano-vllm
related_problems: []
related_questions: []
---

# 源码解读：qwen3.py——216 行组装一台 Qwen3 解码器

> 精读对象：[qwen3.py](qwen3.py)（216 行，`models/` 目录下唯一的模型实现，与 [nano-vllm](https://github.com/GeeeekExplorer/nano-vllm) `nanovllm/models/qwen3.py` 完全一致）
> 上游：`ModelRunner` 构造、加载并调用它 · 下游：`layers/` 积木（[linear](linear.md) / attention / layernorm / rotary / embed_head）
> 衔接教程：[Day 5：模型执行与算子层](../day5.md)（本篇是其中 5.3 节的完整展开版）· [Day 6：Tensor Parallelism](../day6.md)

---

## 🎯 这份文档带你弄懂

1. **五个类的分工**与"组装层 / 积木层"的边界：为什么这个文件里找不到一个 attention kernel
2. **Attention 七步前向**逐步走读：融合 QKV → split/view → QK-Norm → RoPE → KV Cache 黑盒 → o_proj
3. **残差线协议**：RMSNorm 为什么返回元组、首层为什么要特判、与教科书写法差在哪
4. **GQA 的形状账本**：`head_dim=128` 的"反直觉"、TP 头切分的整除约束
5. 模型文件承担的两件**杂务**：`packed_modules_mapping` 权重翻译与 `tie_word_embeddings` 共享绑定
6. 面试高频题：**为什么 `forward` 不返回 logits**（CUDA graph 边界 / 末位选择 / 关注点分离）

> 💡 **前置知识**：[Day 2](../day2.md) 的 step 三段式、[Day 3](../day3.md) 的 slot_mapping / block_table
> ⚠️ **约定**：全文数字以 **Qwen3-0.6B** 为例（hidden 1024 / 28 层 / 16 Q 头 / 8 KV 头 / head_dim 128 / 中间维 3072 / 词表 151936），TP=1 除非另说明

---

## 1. 文件定位：图纸，不是积木

nano-vllm 的 `layers/` 是"带 TP 意识的算子积木箱"（[linear.md](linear.md) 精读过），而 `models/qwen3.py` 是**拿积木搭房子的图纸**——它回答的问题只有一个："一个标准 Qwen3 decoder 怎么用这些积木拼出来"。所以你在这个文件里找不到任何 kernel、任何 cache 管理、任何采样逻辑，全部 216 行只有**结构声明 + 前向组装**：

| 类 | 行号 | 职责 | 用到的积木 |
|---|---|---|---|
| `Qwen3Attention` | 14–88 | 七步注意力前向 | `QKVParallelLinear` / `RowParallelLinear` / `RMSNorm` / `RotaryEmbedding` / `Attention` |
| `Qwen3MLP` | 91–117 | SwiGLU 三行 | `MergedColumnParallelLinear` / `RowParallelLinear` / `SiluAndMul` |
| `Qwen3DecoderLayer` | 120–159 | 残差线 + 两个子层 | `RMSNorm` + 上面两个 |
| `Qwen3Model` | 162–183 | embed + 28 层 + 最终 norm | `VocabParallelEmbedding` |
| `Qwen3ForCausalLM` | 186–216 | 外壳：tie / 权重翻译 / logits | `ParallelLMHead` |

五个类的组装关系与调用方：

![qwen3.py 整体结构：五个类搭起一台解码器](assets/qwen3_overall_structure.svg)

三个贯穿全文的观察，先立在这里：

1. **模型不知道"批"的存在**。`forward(input_ids, positions)` 收到的是 varlen 扁平化的 token 流 `[T]`，批的边界（`cu_seqlens`）、KV 写哪里（`slot_mapping`）、读哪里（`block_tables`）全部藏在全局 `Context` 里（`utils/context.py`），由 attention 积木自己去取——模型接口干净得像论文伪代码
2. **模型不知道 KV Cache 的存在**。`Attention` 出生时 `k_cache = v_cache = torch.tensor([])`（空张量），引擎在 `allocate_kv_cache` 里再按层注入视图。warmup 时 cache 为空，`numel()` 守卫让写入直接跳过——一次"无缓存"的纯计算
3. **模型不采样**。`forward` 止步于 hidden states（或 logits），`Sampler` 挂在 `ModelRunner` 上。模型 = 纯前向函数，才能被 CUDA graph / torch.compile 整段接管

---

## 2. 自顶向下：三个壳，一层层剥

### 2.1 Qwen3ForCausalLM：外壳与三件杂务

最外层的类只有 31 行，却干着三件容易被忽略的事。

**杂务一：forward 不返回 logits**（qwen3.py:205）：

```python
def forward(self, input_ids, positions) -> torch.Tensor:
    return self.model(input_ids, positions)      # 只返回 hidden_states！

def compute_logits(self, hidden_states) -> torch.Tensor:
    return self.lm_head(hidden_states)           # logits 单独要
```

调用方 `ModelRunner.run_model`（engine/model_runner.py:198）的写法是 `self.model.compute_logits(self.model(input_ids, positions))`——两段式。为什么拆开？

| 理由 | 解释 |
|---|---|
| **CUDA graph 边界** | decode 图捕获到 `outputs = hidden_states` 为止；TP 模式下 `ParallelLMHead` 里有 `dist.gather`，NCCL 集合通信不宜捕获进图（流/同步语义冲突）。图边界划在 lm_head 之前，是个工程判断 |
| **prefill 末位选择** | `ParallelLMHead.forward` 里 `if context.is_prefill: x = x[cu_seqlens_q[1:] - 1]`——只对每序列末位 hidden 做词表投影。2000-token 批、8 条序列时约省 **250 倍** lm_head 计算量（Day 5 算过账） |
| **关注点分离** | 采样（temperature / Gumbel-max）是引擎的事，模型文件里没有 Sampler |

**杂务二：权重翻译表**（qwen3.py:187）：

```python
packed_modules_mapping = {
    "q_proj":    ("qkv_proj", "q"),
    "k_proj":    ("qkv_proj", "k"),
    "v_proj":    ("qkv_proj", "v"),
    "gate_proj": ("gate_up_proj", 0),
    "up_proj":   ("gate_up_proj", 1),
}
```

HF checkpoint 里的权重是**分立**的（`q_proj` / `k_proj` / `v_proj` / `gate_proj` / `up_proj`），nano 的运行时参数是**融合**的（`qkv_proj` / `gate_up_proj`）——这张表是两者的翻译字典，消费者是 `utils/loader.py`（§7 详述）。它放在模型类上而不是 loader 里，意味着**每个新模型自带自己的翻译规则**，loader 保持通用。

**杂务三：词表绑定**（qwen3.py:202）：

```python
if config.tie_word_embeddings:
    self.lm_head.weight.data = self.model.embed_tokens.weight.data
```

0.6B 的 `tie_word_embeddings=True`：lm_head 不存独立权重，直接**共享 embed 的存储**。注意时序——tie 发生在 `__init__`，权重加载在其后：加载 `embed_tokens.weight` 时写入的是同一块内存，lm_head 自动同步，零额外代码。

### 2.2 Qwen3Model：主干只有三行

```python
def forward(self, input_ids, positions):
    hidden_states = self.embed_tokens(input_ids)          # [T] → [T, 1024]
    residual = None                                       # 残差线的起点
    for layer in self.layers:                             # 28 × DecoderLayer
        hidden_states, residual = layer(positions, hidden_states, residual)
    hidden_states, _ = self.norm(hidden_states, residual) # 最终 norm 吃掉 residual
    return hidden_states
```

注意两个细节：`residual` 的生命周期**横跨全部 28 层**，由每层接力传递（下一节）；最终 `norm` 是最后一个"汇入点"，把残差线收束成真正的输出流，返回的 `_` 是被丢弃的中间量。

### 2.3 Qwen3DecoderLayer：残差线怎么穿

这是本文件最值得精读的 14 行（qwen3.py:146）：

```python
def forward(self, positions, hidden_states, residual):
    if residual is None:                                   # 首层特判
        hidden_states, residual = self.input_layernorm(hidden_states), hidden_states
    else:
        hidden_states, residual = self.input_layernorm(hidden_states, residual)
    hidden_states = self.self_attn(positions, hidden_states)
    hidden_states, residual = self.post_attention_layernorm(hidden_states, residual)
    hidden_states = self.mlp(hidden_states)
    return hidden_states, residual                         # 元组协议
```

![Qwen3DecoderLayer：一条残差线穿过两个子层](assets/qwen3_decoder_layer.svg)

**元组协议**：`RMSNorm.forward(x, residual=None)` 有两种模式——不带 residual 时是普通归一化；带 residual 时做融合的 `add_rms_forward`：

```python
# layers/layernorm.py（节选）
@torch.compile
def add_rms_forward(self, x, residual):
    x = x.float().add_(residual.float())    # fp32 域求和
    residual = x.to(orig_dtype)             # 和成为新的残差
    var = x.pow(2).mean(dim=-1, keepdim=True)
    x = x.mul_(torch.rsqrt(var + self.eps)) # 同一个和做归一化
    return x, residual
```

关键在**"求和"与"归一化"作用在同一个 `sum` 上**，且 sum 本身作为新残差继续传递。对比教科书写法 `x = x + attn(norm(x))`：

| 写法 | 每层的加法 kernel | 额外显存往返 | 数值 |
|---|---|---|---|
| 教科书 | 2 个独立 add | 每次全量读 + 写 `[T,1024]` | bf16 加 bf16 |
| nano（fused） | 0 个（融进 norm，`@torch.compile` 生成） | 无 | **fp32 求和后写回** bf16 |

28 层 × 2 = **56 个加法 kernel 被省掉**，求和还在 fp32 域做（残差流是深网络数值稳定性的生命线）。vLLM 的 `RMSNorm` 是同款协议——forward 带可选 residual 参数并返回元组。

**首层特判**为什么必须有：`residual` 的起点是 embedding 输出，但第一层的 `input_layernorm` 要归一化的恰恰是它——所以首层走 `norm(h), residual=h` 的无融合分支，从第二层起才进入融合路径。`residual is None` 就是"我是第一层"的信号。

---

## 3. Qwen3Attention：七步流水

### 3.1 `__init__`：头是怎么分出去的

构造函数前 12 行全在算"每卡有多少头"（qwen3.py:29）：

```python
tp_size = dist.get_world_size()
self.total_num_heads = num_heads                    # 16
assert self.total_num_heads % tp_size == 0          # Q 头必须整除 TP
self.num_heads = self.total_num_heads // tp_size    # 本卡 Q 头
self.total_num_kv_heads = num_kv_heads              # 8
assert self.total_num_kv_heads % tp_size == 0       # KV 头也必须整除（更紧的约束）
self.num_kv_heads = self.total_num_kv_heads // tp_size
self.head_dim = head_dim or hidden_size // self.total_num_heads   # 128（显式配置）
self.q_size = self.num_heads * self.head_dim        # 16×128 = 2048
self.kv_size = self.num_kv_heads * self.head_dim    # 8×128 = 1024
self.scaling = self.head_dim ** -0.5                # 1/√128，传给 flash-attn
```

三个容易看漏的点：

1. **`head_dim=128` 是显式配置，不是算出来的**。0.6B 的 hidden 1024 / 16 头 = 64，但 Qwen3-0.6B 官方 `head_dim=128`——`or` 后面的 fallback 只对没写 head_dim 的模型安全。这直接决定了 `q_size=2048 ≠ hidden=1024`，以及后面 `o_proj` 的输入维是 2048
2. **`dist.get_world_size()` 要求进程组已初始化**——`ModelRunner.__init__` 里 `init_process_group` 排在 `Qwen3ForCausalLM(hf_config)` 之前，顺序不是随意的
3. **GQA 的 TP 约束在构造期就炸出来**：8 个 KV 头 → TP ≤ 8（KV 头比 Q 头少的模型，TP 上限常常卡在 KV 头数上）

`__init__` 的后半段把积木接上：`qkv_proj`（融合投影，列切）、`o_proj`（行切，注意 `input_size = total_num_heads * head_dim = 2048`，用的是**全局**头数，切分由 `RowParallelLinear` 自己做）、RoPE、Attention 核心、以及条件创建的 QK-Norm。

### 3.2 forward：七步走完一遍

```python
def forward(self, positions, hidden_states):
    qkv = self.qkv_proj(hidden_states)                                # ① [T,4096]
    q, k, v = qkv.split([self.q_size, self.kv_size, self.kv_size], dim=-1)  # ②
    q = q.view(-1, self.num_heads, self.head_dim)                     #    [T,16,128]
    k = k.view(-1, self.num_kv_heads, self.head_dim)                  #    [T,8,128]
    v = v.view(-1, self.num_kv_heads, self.head_dim)
    if not self.qkv_bias:
        q = self.q_norm(q); k = self.k_norm(k)                        # ③ QK-Norm
    q, k = self.rotary_emb(positions, q, k)                           # ④ RoPE
    o = self.attn(q, k, v)                                            # ⑤ 核心黑盒
    output = self.o_proj(o.flatten(1, -1))                            # ⑥⑦ [T,1024]
    return output
```

![Qwen3Attention 前向流水（Qwen3-0.6B 的数字）](assets/qwen3_attention_pipeline.svg)

逐步注解（TP=1、T 为本步总 token 数）：

| 步 | 操作 | 形状 | 注 |
|---|---|---|---|
| ① | `qkv_proj` 融合 GEMM | `[T,1024] → [T,4096]` | 4096 = q 2048 + k 1024 + v 1024；一次大 GEMM 替三次小 GEMM |
| ② | `split` + `view` | 三段 → `[T,16,128]` / `[T,8,128]` ×2 | 纯视图，零拷贝；`-1` 让批维自适应 varlen 扁平流 |
| ③ | QK-Norm | 形状不变 | q、k 逐头做 RMSNorm(head_dim)，**v 不做**；仅当无 qkv_bias 时存在 |
| ④ | RoPE | 形状不变 | 用 `positions`（**绝对位置**）索引 cos_sin_cache；只转 q、k |
| ⑤ | Attention 核心 | `q,k,v → o [T,16,128]` | 唯一接触 KV Cache 的地方（§3.5） |
| ⑥ | `flatten(1, -1)` | `[T,16,128] → [T,2048]` | 头维拼接；`(1,-1)` 保住批维 |
| ⑦ | `o_proj` GEMM | `[T,2048] → [T,1024]` | 行切；TP>1 时这里 all-reduce |

### 3.3 深入：QK-Norm——Qwen3 的标志设计

```python
if not self.qkv_bias:
    self.q_norm = RMSNorm(self.head_dim, eps=rms_norm_eps)
    self.k_norm = RMSNorm(self.head_dim, eps=rms_norm_eps)
```

- **逐头归一化**：norm 的作用域是每个头的 `head_dim=128` 维切片，不是整个 2048 维——稳的是每个注意力头的"能量"，防止个别头的 logit 爆炸
- **位置在 RoPE 之前**：归一化作用在旋转前的"语义坐标"上（与 HF 实现同序）；v 不参与——v 只做值投影，不进相似度计算
- **创建条件 `if not self.qkv_bias`**：Qwen3-0.6B 的 `attention_bias=false`，所以走 QK-Norm 分支；带 attention bias 的变体走另一条路（两件事被绑在了同一个开关上，读码时要意识到这是 Qwen3 家族的配置约定，不是普适规则）

### 3.4 深入：RoPE 的三个细节

`get_rope` 的定义在 `layers/rotary_embedding.py:51`：

```python
@lru_cache(1)
def get_rope(head_size, rotary_dim, max_position, base):
    return RotaryEmbedding(head_size, rotary_dim, max_position, base)
```

1. **28 层共享一个实例**。`lru_cache(1)` 让同参数的调用拿到同一个对象——全部 28 层的 `rotary_emb` 是**同一个 Python 对象**，`cos_sin_cache`（`[40960, 1, 128]` 的 cos+sin 表）只存一份。若每层 new 一个，显存悄悄多出 27 份
2. **positions 必须是绝对位置**。`prepare_prefill` 里 positions 是 `range(start, end)`，`start = num_cached_tokens`——前缀缓存命中 / chunked prefill 时 `start ≠ 0`，RoPE 靠绝对位置索引 cos_sin_cache 才能转出正确的相位。模型签名里的 `positions` 就是为这一步存在的
3. **只支持标准 RoPE**。`RotaryEmbedding` 里 `assert rotary_dim == head_size`（全维旋转），qwen3.py:54 对 `rope_scaling` 只取其中的 `rope_theta` 字段——yarn 等插值缩放没有被实现，带长上下文重标定的变体不在支持范围内

### 3.5 Attention 核心黑盒（30 秒版）

`self.attn(q, k, v)` 这一行背后是 `layers/attention.py`（Day 5 的主角，60 行）：

```python
def forward(self, q, k, v):
    context = get_context()
    if k_cache.numel() and v_cache.numel():
        store_kvcache(k, v, k_cache, v_cache, context.slot_mapping)   # Triton 散写
    if context.is_prefill:
        o = flash_attn_varlen_func(q, k, v, ..., block_table=context.block_tables)
    else:   # decode
        o = flash_attn_with_kvcache(q.unsqueeze(1), k_cache, v_cache, ...)
    return o
```

- **写入端**：Triton `store_kvcache_kernel` 按 `slot_mapping`（`block_id × block_size + 块内偏移`）把本步新算的 K/V 散写进 paged cache 池
- **读取端**：prefill 走 `flash_attn_varlen_func`（`cu_seqlens` 切分 varlen 批；前缀缓存全命中时 `k, v = k_cache, v_cache` 直接读缓存本体），decode 走 `flash_attn_with_kvcache`（按 `block_table` paged 读）
- **GQA 的 2:1 广播在 kernel 内部处理**：16 个 Q 头每两个共享 1 个 KV 头，`kv_size` 只有 `q_size` 的一半——这直接把 KV Cache 显存砍半

对照 [Day 3](../day3.md) 记住的口诀：**写入散（slot_mapping）、读取聚（block_table）**——两组张量在模型代码里都不露面，全部经由 `Context` 到达 kernel。

---

## 4. Qwen3MLP：SwiGLU 三行

```python
def forward(self, x):
    gate_up = self.gate_up_proj(x)     # [T,1024] → [T,6144]（gate|up 两段融合）
    x = self.act_fn(gate_up)           # SiluAndMul：silu(gate) × up → [T,3072]
    x = self.down_proj(x)              # [T,3072] → [T,1024]
    return x
```

- **`MergedColumnParallelLinear(hidden, [intermediate_size] * 2)`**：gate 和 up 两个投影融合成一个参数（输出维 `2×3072=6144`），`SiluAndMul` 先 `chunk(2, -1)` 再做 `silu(gate) * up`——一次 GEMM + 一个融合激活，替代两次 GEMM + 一次乘法
- **`assert hidden_act == "silu"`**： SwiGLU 是 Qwen3 的硬编码假设，遇到别的激活函数直接拒绝——极简项目的"不支持就说出来"
- 构造上与 Attention 完全同构：**列切进（gate_up）、行切出（down）**，TP 的 all-reduce 只发生在 `down_proj`

---

## 5. 一层前向的形状账本（0.6B，TP=1）

把 §2.3–§4 的数字合并成一张表，T 为本步 token 总数：

| 步骤 | 操作 | 形状变化 | 参数量 |
|---|---|---|---|
| embed | `VocabParallelEmbedding` | `[T] → [T,1024]` | 155.6M |
| input_layernorm | fused add+rms | `[T,1024]`（+residual） | 1K |
| qkv_proj | 融合 GEMM | `[T,1024] → [T,4096]` | 4.2M |
| split/view + QK-Norm + RoPE | 视图/逐头 | `[T,16,128]` 等 | 256 |
| attention 核心 | 写 KV + flash-attn | `→ [T,16,128]` | 0（cache 是池子） |
| o_proj | GEMM | `[T,2048] → [T,1024]` | 2.1M |
| post_attention_layernorm | fused add+rms | `[T,1024]` | 1K |
| gate_up_proj | 融合 GEMM | `[T,1024] → [T,6144]` | 6.3M |
| SiluAndMul | 融合激活 | `[T,6144] → [T,3072]` | 0 |
| down_proj | GEMM | `[T,3072] → [T,1024]` | 3.1M |

纵向合计，顺便验证模型名：

```text
每层参数 ≈ 4.2 + 2.1 + 6.3 + 3.1 = 15.7M
28 层    ≈ 440M
embedding ≈ 155.6M（tie_word_embeddings=True，lm_head 不另计）
合计     ≈ 596M ≈ 0.6B ✓
```

> 💡 **一句话总结**：每 token 每层的矩阵乘 ≈ 31.5 MFLOPs，28 层 ≈ 880 MFLOPs，加 lm_head 的 311 MFLOPs——所以 prefill 全量过 lm_head（每 token 都算）和只算序列末位，差出的是**整个模型一半的算力**，这就是末位选择优化的量级来源。

---

## 6. TP=2：同一份代码的另一副面孔

qwen3.py 里没有任何 `if tp_size > 1` 的分支——TP 全部藏在积木里。但读码时应该能在脑子里"渲染"出双卡版：

![TP=2 时同一份 qwen3.py 的切分与通信点](assets/qwen3_tp_sharding.svg)

| 模块 | 切法 | 每 rank 持有 | 前向通信 |
|---|---|---|---|
| `embed_tokens` | 词表切 | vocab 的一半行 | 1 次 all-reduce（mask 置零求和） |
| `qkv_proj` | 列切（按头） | `[q 8 头 \| k 4 头 \| v 4 头]·128` | 0 |
| attention | 头天然分片 | 8 Q 头 × 4 KV 头（GQA 在卡内仍 2:1） | 0 |
| `o_proj` | 行切 | 输入 2048 维的一半 | **★ all-reduce** |
| `gate_up_proj` | 列切 | `[T, 2×1536]` | 0 |
| `down_proj` | 行切 | 输入 3072 维的一半 | **★ all-reduce** |
| `lm_head` | 词表切 | logits 的 vocab 分片 | 1 次 gather（去 rank 0） |

通信账单：每层 2 次 all-reduce × 28 层 + embedding + lm_head = **58 次集合通信 / forward**。切分数学与偏移计算的完整推导见 [linear.md](linear.md) §2–§4。

---

## 7. 两件杂务的闭环：权重从 checkpoint 到运行时

加载链路是 `ModelRunner.__init__` → `load_model(model, path)` → 对每个权重名查 `packed_modules_mapping`：

```python
# utils/loader.py（节选）
for k in packed_modules_mapping:
    if k in weight_name:                       # "q_proj" in "...self_attn.q_proj.weight"
        v, shard_id = packed_modules_mapping[k]
        param_name = weight_name.replace(k, v) # → "...self_attn.qkv_proj.weight"
        param = model.get_parameter(param_name)
        param.weight_loader(param, f.get_tensor(weight_name), shard_id)  # shard_id="q"
        break
```

以 `layers.0.self_attn.q_proj.weight` 为例的完整旅程：

| 阶段 | 状态 |
|---|---|
| checkpoint | `q_proj.weight [2048, 1024]`（分立、完整） |
| 名字改写 | `q_proj` → `qkv_proj`（replace） |
| 定位参数 | `model.get_parameter("...qkv_proj.weight")`：`[4096, 1024]`（融合、可能已切分） |
| shard 级搬运 | `weight_loader`：`chunk(tp_size)[rank]` 切出本卡份，`narrow(offset)` 放进融合参数的 q 段 |

配套的 tie 闭环：0.6B 的 checkpoint 里**没有** `lm_head.weight`（tie 模型不重复存），nano 在 `__init__` 里先行共享 `.data`，随后加载 `embed_tokens.weight` 时 lm_head 自动就位——顺序（先 tie 后 load）与机制（共享存储）缺一不可。

---

## 8. 与 HF transformers / vLLM 的对照

| 关注点 | HF transformers | nano-vllm（本文件） | vLLM |
|---|---|---|---|
| QKV 投影 | 三个独立 `nn.Linear` | 融合 `QKVParallelLinear` | 融合（同款思路） |
| attention | SDPA/FA2，全量 K/V 常驻 | paged KV cache + flash-attn | 同 nano（多后端） |
| 残差 | 显式 `+` | fused add-RMSNorm 元组协议 | fused（同款协议） |
| RoPE | 每层实例 | `lru_cache` 全局共享一份 | 全局 cache |
| logits | 全量返回 | 末位选择、图外计算 | logits processor |
| 权重布局 | 与 checkpoint 一致 | 运行时融合 + 翻译表加载 | 同 nano |

可以看出 nano-vllm 的模型文件基本是 **vLLM 模型实现的极简版**——这不是巧合，读通这 216 行，vLLM 里 `models/qwen3.py` 的结构几乎可以直接对上。

---

## 9. 常见陷阱

1. **`head_dim` 不是 hidden / num_heads**。0.6B 显式配置 128（而 1024/16=64）；`head_dim or hidden_size // total_num_heads` 的 fallback 只对未配置的模型安全。算 `q_size`、`o_proj` 输入维时用错基准，形状会在 view 处炸
2. **QK-Norm 与 attention_bias 绑在同一个开关**。`qkv_bias=getattr(config, 'attention_bias', True)` 且默认 True——配置里没有该字段的模型会被当成"带 bias、无 QK-Norm"处理。0.6B 显式 `false`，走 QK-Norm 分支
3. **positions 必须是绝对位置**。前缀缓存命中 / chunked prefill 时 `start = num_cached_tokens ≠ 0`；若传相对位置，RoPE 相位全错且**不报错**——静默产出垃圾
4. **rope_scaling 只认 rope_theta**。yarn / 动态 NTK 等重标定不实现（`assert rotary_dim == head_size`），长上下文变体会直接 assert 失败——这是支持边界，不是 bug
5. **模块注册顺序 = KV cache 层索引**。`allocate_kv_cache` 靠 `model.modules()` 的遍历顺序给每层 Attention 挂 `kv_cache[0/1, layer_id]`——把 `layers` 从 `ModuleList` 换成无序容器会**静默挂错层**
6. **tie 依赖共享存储，不依赖加载顺序之外的重绑定**。若有人后写 `lm_head.weight = nn.Parameter(...)` 重新赋值，共享即断——改权重要用 in-place 语义

---

## 10. 面试要点

**Q：为什么 `Qwen3ForCausalLM.forward` 不直接返回 logits？**
> 三个理由：① CUDA graph 的边界划在 hidden states——TP 下 lm_head 有 `dist.gather`，NCCL 集合通信不宜捕获进图；② prefill 的末位选择藏在 `ParallelLMHead` 里，全量投影多算约 250 倍；③ 关注点分离——采样属于引擎，模型是纯前向函数，才能被 graph / compile 整段接管。

**Q：DecoderLayer 为什么把 residual 当返回值层层传递？**
> fused add-RMSNorm 协议：求和与归一化在同一个 kernel 里完成（`@torch.compile` 融合），求和结果同时作为新残差返回。对比 `x = x + attn(norm(x))`：每层省 2 个独立加法 kernel（28 层 56 个），少两次 `[T,1024]` 全量读写，求和在 fp32 域完成（数值稳定）。首层 residual=None 走无融合分支。

**Q：GQA 对 Tensor Parallelism 的约束是什么？0.6B 最多几卡？**
> 构造期两个断言：Q 头数和 KV 头数都要整除 TP。0.6B 是 16 Q / 8 KV → TP ≤ 8，卡在 KV 头上（GQA 把 KV 头变成了稀缺资源）。TP=2 时每卡 8 Q 头 / 4 KV 头，卡内仍是 2:1 广播；KV Cache 显存也随之 ÷2。

**Q：QK-Norm 加在哪里？为什么 v 不做？**
> qkv split/view 之后、RoPE 之前，对 q、k **逐头**做 RMSNorm(head_dim)。归一化作用在旋转前的语义坐标上（与 HF 同序）。v 不参与相似度计算、只做值投影，norm 它没有稳定注意力的意义。

**Q：28 层的 Attention 怎么各自找到自己的 KV cache？**
> Attention 出生时 `k_cache = v_cache = torch.tensor([])`；引擎 `allocate_kv_cache` 按池子大小分配大张量后，遍历 `model.modules()` 按**注册顺序**把 `kv_cache[0/1, layer_id]` 逐层注入。warmup 发生在分配之前，空 cache 被 `numel()` 守卫跳过——所以 warmup 是一次无缓存写入的纯计算。

**Q：融合 qkv_proj 换来了什么、付出了什么？**
> 换来：三次小 GEMM 变一次大 GEMM（kernel 更少、算力利用率更高）。付出：checkpoint 分立权重与运行时融合参数的布局不一致，加载期需要 `packed_modules_mapping` 翻译 + `weight_loader` 做 shard 级 narrow/chunk 搬运——正确性成本从"结构一致"转移到了"加载器正确"。

**Q：tie_word_embeddings 在 TP 下为什么不乱？**
> embed 和 lm_head 用**同一种词表切法**（每 rank 持有同一片 vocab 行），tie 共享的是本 rank 的分片 `.data`——rank 0 的 lm_head 分片等于 rank 0 的 embed 分片。前向 lm_head 各算 logits 的 vocab 分片，gather 到 rank 0 拼回全词表，正好与采样的单点执行（rank 0）对齐。

**Q：28 层共享一个 RoPE 实例，凭什么不出错？**
> `get_rope` 带 `@lru_cache(1)` 且 28 层传入的参数完全相同（head_dim / rotary_dim / max_position / base），命中的是同一个对象。省下 27 份 `[max_position, head_dim]` 的 cos_sin_cache。若某层参数不同（如部分层不同 base），lru_cache 自然 miss 出新实例——共享的前提是"参数相同"，这由构造参数保证。

---

## 11. 延伸阅读

- [Day 5 教程](../day5.md)：ModelRunner 的启动时序、attention 双路径、CUDA graph 捕获——本文件调用方的完整语境
- [Day 6 教程](../day6.md)：TP 的切分数学与 A/B 实验设计
- [linear.md](linear.md)：本文件引用最重的积木箱（Column/Row/Merged/QKV 四种线性层）
- [sequence.md](sequence.md) / [scheduler.md](scheduler.md)：引擎侧如何看待这些前向（调度产物 → Context → 本文件）
- [flash-attention 仓库](https://github.com/Dao-AILab/flash-attention)：`flash_attn_varlen_func` / `flash_attn_with_kvcache` 的 kernel API
- [Qwen3 技术报告](https://github.com/QwenLM/Qwen3/blob/main/docs/Qwen3_Technical_Report.md)：QK-Norm 与 GQA 配置的官方出处
