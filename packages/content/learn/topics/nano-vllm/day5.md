---
id: "learn:topic:nano-vllm:d5"
type: learn
title: "Day 5：模型执行与算子层"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, attention, cuda-graph, triton, sampling]
updated: 2026-09-25
day: 5
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 5：模型执行与算子层

## 🎯 目标

通过今天的学习，你将：

1. 读懂 `engine/model_runner.py`：`__init__` 的启动时序（warmup 为什么在 KV 池分配之前）、`run()` 的四步流程、TP 进程间的 SharedMemory RPC
2. 读懂 `models/qwen3.py`：标准 decoder 如何用 `layers/` 的积木搭起来——QKV 投影、**QK-Norm**、RoPE、fused residual RMSNorm、以及 LM head 里"只算末位"的隐藏优化
3. 精读 `layers/attention.py`（本周最核心的 60 行）：Triton `store_kvcache` 怎么按 slot_mapping 散写、prefill 为什么有**两条 KV 读取路径**、decode 走哪个 kernel
4. 读懂 `utils/loader.py`：HF 分立权重（q/k/v_proj）如何被翻译进融合参数（qkv_proj）——checkpoint 与运行时布局的适配层
5. 读懂 `layers/sampler.py`：**Gumbel-max 采样**的数学（为什么 `argmax(probs/E)` 是精确采样）、`@torch.compile` 到底挂在哪
6. 吃透 CUDA graph：档位设计、reversed 捕获共享 pool、静态 buffer 的 copy-in/replay/copy-out、为什么图的边界止于 lm_head 之前
7. 产出：**prefill vs decode 数据流对比图**（谁写 KV、谁读 KV、走哪个 kernel）

> 💡 **前置知识**：[Day 3](day3.md) 的 slot_mapping/block_table（今天看它们的消费端）、[Day 2](day2.md) 的 step 三段式
> ⚠️ **环境要求**：任务 B 需 GPU；任务 C 纯 CPU 可跑

---

## 执行层在做什么

Day 2 的主线图里，`step()` 的第二段是 `model_runner.call("run", seqs, is_prefill)`。今天拆开它——执行层要回答的问题只有一个：**"给我一组 Sequence 和 is_prefill，怎么把它们变成一次正确且快的 GPU 前向"**：

```text
输入：seqs（调度决定）+ is_prefill
  ├─ prepare_*：Sequence 列表 → 张量组（input_ids/positions/slot_mapping/...）
  ├─ set_context：张量组挂到全局上下文
  ├─ run_model：eager 或 CUDA graph 执行 Qwen3 前向
  │    └─ 每层 Attention：Triton 写 KV → flash-attn 读 KV
  └─ sampler：logits → token ids
```

> 💡 **一句话总结**：调度层（Day 4）决定"算什么"，今天这层决定"怎么算"——所有推理引擎的性能工程（kernel 编排、图捕获、采样向量化）都发生在这一层。

---

## 核心概念

### 5.1 ModelRunner：执行层总指挥

#### `__init__` 的启动时序

```python
dist.init_process_group("nccl", "tcp://localhost:2333", ...)   # ① TP 通信组
torch.set_default_dtype(hf_config.dtype)                        # ② 默认 dtype/device
torch.set_default_device("cuda")
self.model = Qwen3ForCausalLM(hf_config)                        # ③ 直接在 GPU 上构造
load_model(self.model, config.model)                            # ④ 权重加载
self.sampler = Sampler()
self.warmup_model()                                             # ⑤ 最大规模前向：量出激活峰值
self.allocate_kv_cache()                                        # ⑥ 用峰值推算 KV 池（Day 3 公式）
if not self.enforce_eager:
    self.capture_cudagraph()                                    # ⑦ 捕获 decode 图
```

两个容易被忽略的细节：

1. **⑤ 在 ⑥ 之前**——Day 3 讲过：池大小公式里的 `peak − current`（激活临时峰值）要靠 warmup 跑一次最大 batch 前向才能量出来。而 warmup 期间 KV cache **还不存在**：`Attention.k_cache` 初始是空张量 `torch.tensor([])`，`if k_cache.numel() and v_cache.numel()` 守卫让 `store_kvcache` 直接跳过——warmup 是一次"无缓存写入"的纯计算
2. **模型直接在 GPU 上构造**（`set_default_device("cuda")`），加载完再恢复默认值——省一次 CPU 构造 + 整模型搬运

#### `run()` 的四步

```python
def run(self, seqs, is_prefill):
    input_ids, positions = self.prepare_prefill(seqs) if is_prefill else self.prepare_decode(seqs)
    temperatures = self.prepare_sample(seqs) if self.rank == 0 else None
    logits = self.run_model(input_ids, positions, is_prefill)
    token_ids = self.sampler(logits, temperatures).tolist() if self.rank == 0 else None
    reset_context()
    return token_ids
```

prepare → 采样参数 → 前向 → 采样 → **reset_context**（清空全局上下文，防止泄漏到下一步）。

#### TP 的进程间 RPC（30 秒版，细节 Day 6）

`model_runner.call("run", ...)` 是统一入口：rank 0 在本进程直接调用，同时把 `(方法名, 参数)` **pickle 进一块 1MB 共享内存**并 set 各 worker 的 `Event`；其他 rank 的 `loop()` 阻塞在 `event.wait()` 上，醒来后读共享内存、执行同名方法。各 rank 的计算结果靠**层内 NCCL 集合通信**（all-reduce/gather）隐式收敛——通信点藏在 linear 层里（Day 6 画出来）。

### 5.2 prepare 系列：Sequence 列表 → 张量组

Day 3 已经精读过 slot_mapping 的计算，今天看**完整的张量组**（`pin_memory=True` + `.cuda(non_blocking=True)`：页锁定内存 + 异步 H2D，小细节但每个推理引擎都这么干）：

| 张量 | prefill | decode |
|------|---------|--------|
| `input_ids` | 本步所有序列的新 token **拼接**（varlen 扁平） | 每序列 1 个：`seq.last_token` |
| `positions` | `range(start, end)`（**绝对位置**，RoPE 要用） | `len(seq) - 1` |
| `cu_seqlens_q/k` | 批内 q/k 长度前缀和（varlen kernel 的切分依据） | 不需要 |
| `max_seqlen_q/k` | kernel launch 参数 | 不需要 |
| `slot_mapping` | 每个新算 token 一个槽位 | 每序列 1 个 |
| `context_lens` | 不需要 | 每序列总长（含本步刚写的） |
| `block_tables` | **仅前缀命中时**构造（`-1` 右填充对齐） | 总是构造 |

#### `utils/context.py`：全局上下文

```python
@dataclass(slots=True)
class Context:
    is_prefill: bool = False
    cu_seqlens_q/k, max_seqlen_q/k, slot_mapping, context_lens, block_tables ...

_CONTEXT = Context()          # 模块级单例
def get_context(): ...
def set_context(...): ...
def reset_context(): ...
```

**为什么要全局单例？** 看 `Attention.forward(q, k, v)` 的签名——干净得像论文伪代码。slot_mapping、block_tables 这些**调度产物**不进模型接口，模型代码零感知。**代价**：多引擎实例/多线程会打架，测试也难隔离。vLLM 的做法是显式传 `ForwardBatch`/metadata 对象——啰嗦但并发安全。单进程单引擎的 nano 选择偷懒，又一次"需求决定架构"。

今天会遇到两个**依赖全局上下文的地方**：LM head（5.3）和 CUDA graph 捕获（5.7）。

### 5.3 `models/qwen3.py`：积木怎么搭

#### Attention 前向：七步流水

```python
def forward(self, positions, hidden_states):
    qkv = self.qkv_proj(hidden_states)              # ① 融合 QKV 投影（TP 列切，Day 6）
    q, k, v = qkv.split([q_size, kv_size, kv_size], dim=-1)   # ② 切开
    ...
    q = self.q_norm(q); k = self.k_norm(k)          # ③ Qwen3 特有：QK-Norm（仅无 qkv_bias 时）
    q, k = self.rotary_emb(positions, q, k)         # ④ RoPE（绝对位置）
    o = self.attn(q, k, v)                          # ⑤ 核心注意力（5.5 精读）
    return self.o_proj(o.flatten(1, -1))            # ⑥ 输出投影（TP 行切 + all-reduce，Day 6）
```

- **QK-Norm** 是 Qwen3 的标志设计：对 q、k 各做 per-head RMSNorm，稳定注意力分布。注意创建条件 `if not self.qkv_bias`——带 attention bias 的变体不加 QK-Norm
- **GQA**：`num_kv_heads < num_heads`（0.6B 是 8 vs 16），k/v 比 q 小一半，flash-attn kernel 内部处理广播
- **RoPE 的省显存技巧**：`get_rope` 带 `@lru_cache(1)`——**全部 28 层共享同一个 RoPE 实例**，cos_sin_cache 只存一份（`[max_position, head_dim]` 不小）

#### DecoderLayer：fused residual RMSNorm

```python
def forward(self, positions, hidden_states, residual):
    if residual is None:                                        # 第一层：residual 就是输入
        hidden_states, residual = self.input_layernorm(hidden_states), hidden_states
    else:
        hidden_states, residual = self.input_layernorm(hidden_states, residual)   # ★ 融合
    hidden_states = self.self_attn(positions, hidden_states)
    hidden_states, residual = self.post_attention_layernorm(hidden_states, residual)
    hidden_states = self.mlp(hidden_states)
    return hidden_states, residual
```

★ 处的 `add_rms_forward(x, residual)` 返回 `(normed, new_residual)`——**残差加法与 norm 在一个 `@torch.compile` 融合核里完成**，避免"先 add 再 norm"两次读写显存。residual 像一根接力棒穿过整层，这是现代 decoder 的标准写法（vLLM/SGLang 同款）。

#### 侦探时刻：LM head 只算"最后一席"

`Qwen3ForCausalLM.compute_logits(hidden)` 调的是 `ParallelLMHead`，看它的 forward（`layers/embed_head.py`）：

```python
def forward(self, x):
    context = get_context()
    if context.is_prefill:
        last_indices = context.cu_seqlens_q[1:] - 1     # ★ 每个序列最后一个位置
        x = x[last_indices].contiguous()
    logits = F.linear(x, self.weight)                    # 只对末位做词表投影
    ...
```

prefill 的 hidden 是 `[总 token 数, H]`，但**只有每个序列末位的 hidden 才用于预测下一个 token**——先按 `cu_seqlens_q` gather 末位，再做词表投影。省多少？Qwen3-0.6B（vocab 151936、hidden 1024）：每 token 的 lm_head 约 $2 \times 151936 \times 1024 \approx 311$ MFLOPs；2000-token 的 prefill 批、8 条序列：全量 $2000 \times 311M \approx 622$ GFLOPs → 末位 $8 \times 311M \approx 2.5$ GFLOPs，**约 250 倍**。vLLM 的 logits processor 做同样的优化——这里也是 `Context` 全局上下文的第二个受益者（LM head 签名里只有 hidden，cu_seqlens 从天而降）。

顺带解开一个连锁疑问：正因为 logits 是 `[序列数, V]` 而不是 `[总 token, V]`，sampler 的逐序列温度 `[S, 1]` 才能广播、`postprocess` 的 `zip(seqs, token_ids)` 才对得上——**一个优化同时是正确性的前提**。

#### `packed_modules_mapping`：给 loader 的地图

```python
class Qwen3ForCausalLM(nn.Module):
    packed_modules_mapping = {
        "q_proj": ("qkv_proj", "q"), "k_proj": ("qkv_proj", "k"), "v_proj": ("qkv_proj", "v"),
        "gate_proj": ("gate_up_proj", 0), "up_proj": ("gate_up_proj", 1),
    }
```

HF checkpoint 里是**分立**的 `q_proj/k_proj/v_proj` 权重，nano 的模型是**融合**的 `qkv_proj` 参数——这张表是两者的翻译字典（5.4 消费它）。

### 5.4 `utils/loader.py`：checkpoint 翻译层

```python
def load_model(model, path):
    packed_modules_mapping = getattr(model, "packed_modules_mapping", {})
    for file in glob(os.path.join(path, "*.safetensors")):
        with safe_open(file, "pt", "cpu") as f:
            for weight_name in f.keys():
                for k in packed_modules_mapping:            # 命中融合映射
                    if k in weight_name:
                        v, shard_id = packed_modules_mapping[k]
                        param_name = weight_name.replace(k, v)
                        param = model.get_parameter(param_name)
                        weight_loader = getattr(param, "weight_loader")
                        weight_loader(param, f.get_tensor(weight_name), shard_id)
                        break
                else:                                        # 普通权重：整块拷贝
                    param = model.get_parameter(weight_name)
                    weight_loader = getattr(param, "weight_loader", default_weight_loader)
                    weight_loader(param, f.get_tensor(weight_name))
```

两个设计：

1. **`weight_loader` 挂在 Parameter 上**（策略模式）：普通参数用默认的 `param.data.copy_`；融合/TP 切分的参数由 parallel layer 在构造时挂上自己的 loader（知道 shard 偏移、TP rank 该取哪段）——loader.py 本身对 TP 零感知。Day 6 读 linear.py 时会看到这些 loader 的实现
2. **融合的意义**：qkv 三次小 GEMM 合成一次大 GEMM（kernel 少了、算力利用率高了），代价就是加载时要做 shard 级翻译

### 5.5 `layers/attention.py`：60 行 kernel 编排（本周核心）

全文结构：

```python
@triton.jit
def store_kvcache_kernel(...): ...        # 写：按 slot_mapping 散写 K/V

def store_kvcache(key, value, k_cache, v_cache, slot_mapping): ...   # Triton 启动包装

class Attention(nn.Module):
    def forward(self, q, k, v):
        context = get_context()
        k_cache, v_cache = self.k_cache, self.v_cache
        if k_cache.numel() and v_cache.numel():
            store_kvcache(k, v, k_cache, v_cache, context.slot_mapping)   # ① 总是先写
        if context.is_prefill:
            if context.block_tables is not None:    # ② 前缀缓存命中
                k, v = k_cache, v_cache
            o = flash_attn_varlen_func(q, k, v, ..., block_table=context.block_tables)
        else:    # decode
            o = flash_attn_with_kvcache(q.unsqueeze(1), k_cache, v_cache,
                                        cache_seqlens=context.context_lens,
                                        block_table=context.block_tables, ...)
        return o
```

#### ① 写入端：Triton kernel 逐行

```python
@triton.jit
def store_kvcache_kernel(key_ptr, key_stride, value_ptr, value_stride,
                         k_cache_ptr, v_cache_ptr, slot_mapping_ptr, D: tl.constexpr):
    idx = tl.program_id(0)                    # 一个 program 负责一个 token
    slot = tl.load(slot_mapping_ptr + idx)
    if slot == -1: return                     # padding 行直接跳过
    key = tl.load(key_ptr + idx * key_stride + tl.arange(0, D))     # 读一行 K（D = kv头数×头维）
    value = tl.load(value_ptr + idx * value_stride + tl.arange(0, D))
    tl.store(k_cache_ptr + slot * D + tl.arange(0, D), key)         # 散写到槽位
    tl.store(v_cache_ptr + slot * D + tl.arange(0, D), value)
```

**为什么自定义 kernel 而不是 `index_copy_`？** 三个理由，按重要性排序：

1. **`slot == -1` 的掩码语义**：CUDA graph 重放时 batch 会被填充到档位大小（5.7），padding 行的 slot_mapping 填 -1——`index_copy_` 遇到 -1 索引直接崩溃，而 Triton 里一个 early return 就消化了
2. **K/V 两次拷贝合成一个 kernel**：一次发射写两个 cache
3. 教学价值：30 行展示"自定义 kernel 的门槛没有想象中高"

#### ② 读取端：prefill 的两条路径（今天最重要的洞察）

| 场景 | attention 读哪里的 KV | 为什么 |
|------|----------------------|--------|
| prefill **无**前缀命中 | **本地刚算出的 k、v**（连续显存） | 全部历史就是本步刚算的——读连续张量比页表间接寻址快，新 KV 顺手写入 cache 供将来 decode |
| prefill **有**前缀命中 | **cache 本体**（`k, v = k_cache, v_cache` + block_table） | 命中部分的历史 KV **只存在于 cache**，本步只算了尾段——必须按页读 |
| decode | **cache 本体**（`flash_attn_with_kvcache`） | 每步只算 1 个 token，历史全在 cache |

注意一个反直觉点：命中路径里，**本步新算的尾段 KV 也是从 cache 读回的**（store 先写进去，varlen kernel 再按 block_table 读出来）——一次写一次读的浪费，换来的是"读永远走 cache"的单一接口。

两个 kernel 的分工与名字里的信息：`flash_attn_varlen_func`（varlen = 变长批，`cu_seqlens` 切分，**可带 block_table**）服务 prefill；`flash_attn_with_kvcache`（q 每序列 1 个、按 `cache_seqlens` 读页表）服务 decode——**同一个 paged cache，两个读取姿势**。

### 5.6 sampler.py：Gumbel-max 与三处 `@torch.compile`

```python
class Sampler(nn.Module):
    @torch.compile
    def forward(self, logits, temperatures):
        logits = logits.float().div_(temperatures.unsqueeze(dim=1))   # 温度缩放
        probs = torch.softmax(logits, dim=-1)
        sample_tokens = probs.div_(torch.empty_like(probs).exponential_(1)
                                   .clamp_min_(1e-10)).argmax(dim=-1)
        return sample_tokens
```

最后一行是**Gumbel-max 采样**。为什么 `argmax(probs / E)`（$E \sim \text{Exp}(1)$）等价于按 probs 做类别采样？三行推导：

$$\arg\max_i \frac{p_i}{E_i} = \arg\max_i (\ln p_i - \ln E_i)$$

令 $G = -\ln E$，则 $P(G \le g) = P(E \ge e^{-g}) = e^{-e^{-g}}$——这正是标准 **Gumbel(0,1)** 分布的 CDF。所以上式 = $\arg\max_i (\ln p_i + G_i)$，而"Gumbel 噪声加到 log 概率上取 argmax"是教科书结论：**精确的类别采样**（$P(i \text{ 胜出}) = p_i$）。

为什么不直接 `torch.multinomial`？Gumbel-max 全程是**无分支的逐元素运算**——`torch.compile` 能完整融合成一个 kernel，对动态 batch 形状也更友好。顺带解释了 Day 2 的伏笔：`temperature=0` 被禁止，根源就是第一步的 `div_(0)`（inf/nan），而不是什么设计洁癖。

**`@torch.compile` 到底挂在哪？** 全仓库只有三处：`RMSNorm`（两个 forward）、`RotaryEmbedding.forward`、`Sampler.forward`——全是"小算子、每步都跑、融合收益大"的点位，**而不是整个模型**（整模型 compile 面临动态形状重编译、与 CUDA graph 管理冲突两大难题）。这是"精准打击"式的 compile 用法。

### 5.7 CUDA graph：捕获与重放

**动机回顾**（Day 1 实验）：decode 每步几十个小 kernel，GPU 常在等 CPU 发射——把整步前向录成图一次发射。

#### 为什么只给 decode 用？

```python
if is_prefill or self.enforce_eager or input_ids.size(0) > 512:
    eager 前向
else:
    CUDA graph 重放
```

CUDA graph 的输入形状必须**完全固定**。decode 的形状 = `(batch_size,)`，可枚举；prefill 的 token 数任意，不可枚举。所以 prefill 永远 eager。

#### 档位（bucket）与静态 buffer

```python
max_bs = min(max_num_seqs, 512)
self.graph_bs = [1, 2, 4, 8] + list(range(16, max_bs + 1, 16))    # 档位表
input_ids/positions/slot_mapping/context_lens:  [max_bs]
block_tables: [max_bs, max_num_blocks]
outputs: [max_bs, hidden_size]                                     # 注意：是 hidden，不是 logits

for bs in reversed(self.graph_bs):            # ★ 从大到小捕获
    graph = torch.cuda.CUDAGraph()
    set_context(False, slot_mapping=slot_mapping[:bs], ...)      # 上下文指向静态 buffer
    outputs[:bs] = self.model(input_ids[:bs], positions[:bs])    # 先 eager 热身
    with torch.cuda.graph(graph, self.graph_pool):
        outputs[:bs] = self.model(input_ids[:bs], positions[:bs])   # 捕获
    if self.graph_pool is None:
        self.graph_pool = graph.pool()        # 首图建池，后续图共享
```

- **档位表 `[1,2,4,8]+16 步进`**：小 batch 精细（在线低负载常见），大 batch 粗放（padding 浪费可接受）——权衡图数量与 padding 浪费
- **`reversed` 从大到小捕获 + 共享 `graph_pool`**：池子按最大图的需求分配，小图复用同一段显存——若从小图开始，池子会反复扩张，破坏已捕获的图
- **热身再捕获**：捕获前必须 eager 跑一遍（触发 lazy init、memory pool 稳定），否则捕获失败/低效

#### 重放：copy-in → replay → read-out

```python
graph = self.graphs[next(x for x in self.graph_bs if x >= bs)]   # 向上取档
graph_vars["slot_mapping"].fill_(-1)          # padding 行中性化（Triton 见 -1 跳过）
graph_vars["slot_mapping"][:bs] = context.slot_mapping
graph_vars["context_lens"].zero_(); graph_vars["context_lens"][:bs] = context.context_lens
graph_vars["block_tables"][:bs, :cols] = context.block_tables
graph.replay()
return self.model.compute_logits(graph_vars["outputs"][:bs])     # ★ lm_head 在图外
```

三个细节：

1. **改值不改址**：重放读的是捕获时的静态 buffer 地址，所以只能往里 **copy 值**（`[:bs] = ...`），绝不能换张量
2. **padding 中性化**：`fill_(-1)` + `zero_()` 让填充行无副作用——slot=-1 的 Triton 守卫（5.5）在这里兑现
3. **★ 图的边界止于 hidden states**：`outputs` 是 `[bs, hidden]`，lm_head 在图**外**执行。为什么？TP 模式下 `ParallelLMHead` 里有 `dist.gather`——**NCCL 集合通信不宜捕获进 CUDA graph**（与图的流语义/同步语义冲突）。图边界的划定本身就是工程判断

---

## 动手实践

### 任务 A：精读五件套（60 分钟）

| 顺序 | 文件 | 自问 |
|------|------|------|
| 1 | `utils/context.py` | 八个字段各服务谁？为什么 reset_context 不能省？ |
| 2 | `models/qwen3.py` | QK-Norm 的创建条件？fused residual 的元组协议？packed_modules_mapping 给谁用？ |
| 3 | `utils/loader.py` | weight_loader 策略模式挂在哪？分立→融合的翻译发生在哪行？ |
| 4 | `layers/attention.py` | -1 守卫服务谁？两条 prefill 读取路径各自的理由？ |
| 5 | `engine/model_runner.py` | warmup 与 allocate 的顺序约束？graph_bs 档位与 reversed 捕获？copy-in 三件套？ |

### 任务 B：侦察 prepare 张量（40 分钟，需 GPU）

无侵入打点 prepare（实例属性遮蔽，原理同 Day 2）：

```python
# trace_prepare.py —— 打印每次前向的输入张量形态
# 运行: python3 trace_prepare.py
from nanovllm import LLM, SamplingParams
from nanovllm.utils.context import get_context

MODEL = "/root/huggingface/Qwen3-0.6B"   # 改成本地路径
llm = LLM(MODEL, enforce_eager=True)

orig_prefill, orig_decode = llm.model_runner.prepare_prefill, llm.model_runner.prepare_decode

def traced_prefill(seqs):
    out = orig_prefill(seqs)                      # set_context 在里面
    ctx = get_context()                           # reset 在 run() 末尾，此刻仍有效
    print(f"[prefill] batch={len(seqs)} input_ids={tuple(out[0].shape)} "
          f"cu_q={ctx.cu_seqlens_q.tolist()} slots[:6]={ctx.slot_mapping[:6].tolist()}")
    return out

def traced_decode(seqs):
    out = orig_decode(seqs)
    ctx = get_context()
    print(f"[decode ] batch={len(seqs)} input_ids={tuple(out[0].shape)} "
          f"context_lens={ctx.context_lens.tolist()} block_tables{tuple(ctx.block_tables.shape)}")
    return out

llm.model_runner.prepare_prefill = traced_prefill
llm.model_runner.prepare_decode = traced_decode

llm.generate(["Hello, nano-vllm.", "The capital of France is"],
             SamplingParams(temperature=0.6, max_tokens=4), use_tqdm=False)
```

```text
# 预期输出形态（token 数因 tokenizer 而异）
[prefill] batch=2 input_ids=(17,) cu_q=[0, 6, 17] slots[:6]=[0, 1, 2, 3, 4, 5]
[decode ] batch=2 input_ids=(2,) context_lens=[7, 12] block_tables(2, 1)
[decode ] batch=2 input_ids=(2,) context_lens=[8, 13] block_tables(2, 1)
...
```

**观察点**：① prefill 的 `input_ids` 是两段 prompt **拼接**的一维张量（varlen 扁平化），decode 恒为每序列 1 个；② `context_lens` 每步 +1（本步要写入的 token 计入）；③ `slots` 首批从 0 递增（首批序列拿到开头的块）。

### 任务 C：验证 Gumbel-max（15 分钟，纯 CPU）

```python
# gumbel_max_check.py —— 验证 nano 采样与 multinomial 分布一致
# 运行: python3 gumbel_max_check.py
import torch

torch.manual_seed(0)
probs = torch.softmax(torch.tensor([2.0, 1.0, 0.1, -1.0]), -1)
n = 200_000

freq_m = torch.multinomial(probs.expand(n, -1), 1).float().bincount(minlength=4) / n
e = torch.empty(n, 4).exponential_(1).clamp_min_(1e-10)
freq_g = (probs / e).argmax(-1).float().bincount(minlength=4) / n

print("理论      :", [f"{p:.4f}" for p in probs.tolist()])
print("multinomial:", [f"{p:.4f}" for p in freq_m.tolist()])
print("gumbel-max :", [f"{p:.4f}" for p in freq_g.tolist()])   # 两行应都接近理论值
```

再算一笔账写进笔记：你的 GPU 上一次 2000-token prefill（8 条序列），LM head 全量 vs 末位的 FLOPs 差多少（用 5.3 的方法代入你模型的 vocab/hidden）。

### 任务 D：画数据流对比图（35 分钟）

今日产出——**prefill vs decode 数据流对比图**，左右两栏，必须出现这些元素：

- 输入张量组（哪些字段、什么形状）
- store_kvcache 的写入（slot_mapping 从哪来）
- attention 的 KV 来源（本地 or cache，block_table 谁在用）
- LM head 的末位选择（仅 prefill 需要）
- CUDA graph 的边界（仅 decode）

画完与 Day 3 的映射图、Day 4 的流程图钉在一起——三张图就是 nano-vllm 的全貌。

### 学习时间安排（共 2.5 小时）

| 时长 | 内容 |
|---|---|
| 45 分钟 | 理论：本文 5.1-5.7 |
| 60 分钟 | 任务 A：五件套精读 |
| 40 分钟 | 任务 B：张量侦察 |
| 15 分钟 | 任务 C：Gumbel-max 验证 |
| 30 分钟 | 任务 D：对比图 |

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| 以为整模型被 torch.compile | 找不到 model 级的 compile 装饰器 | 只有三处小编织点：RMSNorm / RoPE / Sampler |
| 以为 prefill 也走 CUDA graph | 纳闷为什么图只捕获 decode 形状 | 图要求形状固定；prefill token 数任意，永远 eager |
| CUDA graph 下换张量 | 重放读到旧地址数据 | 只能 copy 值进静态 buffer（改值不改址） |
| 忘了 prefill 的双路径 | 以为 attention 永远读 cache | 无命中时读本地连续张量（更快），命中/decode 才读页表 |
| 每层 new 一个 RoPE | 显存悄悄翻倍 | `get_rope` 的 lru_cache 让 28 层共享一份 cos_sin_cache |
| 手写推理循环不 reset_context | 上一步的 block_tables 泄漏进下一步 | reset 在 `run()` 末尾——自己组装执行流时要保留这个纪律 |

---

## 面试要点

**Q：`argmax(probs / E)`（E 是 Exp(1) 噪声）为什么是精确的类别采样？**
> 取对数：$\arg\max_i \ln p_i - \ln E_i$。令 $G=-\ln E$，由 $P(E \ge e^{-g}) = e^{-e^{-g}}$ 可知 $G \sim \text{Gumbel}(0,1)$，于是等价于 $\arg\max_i (\ln p_i + G_i)$——Gumbel-max 定理保证 $P(i \text{ 胜出}) = p_i$，精确采样。相比 multinomial：全程无分支逐元素运算，`torch.compile` 可融合为单 kernel、对动态形状友好——数学等价性换工程友好性。

**Q：为什么 LM head 只对每个序列的最后一个位置做词表投影？**
> 下一个 token 的预测只来自末位 hidden——prefill 批里其余位置的 logits 永远不会被用到。先按 `cu_seqlens` gather 末位再投影，计算量从 `总token数 × H × V` 降到 `序列数 × H × V`（2000-token 批、8 序列的例子约省 250 倍）。这也是 logits 形状能和逐序列温度对齐、`zip` 后处理成立的前提——优化与正确性在这里是同一件事。vLLM 的 logits processor 同款优化。

**Q：prefill 的 attention 为什么有两条 KV 读取路径？**
> 无前缀命中：全部历史就是本步刚算出的 k/v，直接读本地连续张量（避免页表间接寻址），同时 store_kvcache 把它们写入 cache 供将来；有命中：命中部分的历史只存在于 cache（本步只算了尾段），必须 `k,v = k_cache` 并把 block_table 传给 varlen kernel 按页读。代价是本步新算的 KV 也要"写进去再读回来"——用少量冗余换"读路径统一走 paged 接口"。

**Q：描述 CUDA graph 在推理引擎里的捕获与重放机制。**
> 捕获：按档位表（1/2/4/8 + 16 步进）枚举 decode batch 形状，从大到小捕获（首图建 memory pool，后续共享，避免池子扩张破坏已捕获图），捕获前必须 eager 热身。重放：三段式——把真实输入 **copy 进**静态 buffer（改值不改址；padding 行用 -1/0 中性化）→ `graph.replay()` 一次发射整图 → 从静态输出 buffer **copy 出**结果。收益：消除 decode 每步几十次 kernel launch 的 CPU 开销。图的边界是工程判断：nano 把图止于 hidden states，lm_head 的 TP gather 通信留在图外。

**Q：decode 的 batch 是 13，档位表里没有 13，会发生什么？**
> `next(x for x in graph_bs if x >= bs)` 向上取档到 16：静态 buffer 的前 13 行填真实数据，后 3 行是 padding（slot_mapping=-1 被 Triton 守卫跳过、context_lens=0 让 flash-attn 不读任何块），replay 后只取 `outputs[:13]`。代价是 3/16 ≈ 19% 的 padding 浪费——档位表在小 batch 端加密（1/2/4/8）正是为了控制在线低负载时的浪费率。

**Q：全局 Context 单例有什么隐患？vLLM 为什么不这么做？**
> 隐患：①多引擎实例共用一个模块级变量互相踩踏；②多线程/异步引擎读写竞态；③隐式依赖难以测试（LM head 的行为依赖"天降"的 cu_seqlens）。vLLM 把同样的信息装进 ForwardBatch/metadata 对象**显式传参**——啰嗦但并发安全、可测试。nano 单进程单引擎，偷懒换简洁是合理取舍；一旦做多线程 server（vLLM 的路），必须显式化。

**Q：`store_kvcache` 为什么值得写一个自定义 Triton kernel？**
> 三个理由：① CUDA graph 重放时 padding 行的 slot_mapping 是 -1，`index_copy_` 会崩，Triton 里一个 early return 就消化了掩码语义；② K/V 两个 cache 一次发射写完；③ D = kv_heads × head_dim 的行拷贝模式简单固定，30 行 Triton 就能写对——顺带证明了"引擎作者随手写 kernel"的成本并不高。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| ModelRunner | 启动时序（warmup 先于池分配）；run 四步；TP 的 shm+Event RPC |
| prepare 系列 | prefill 六件套 / decode 五件套；pin_memory+non_blocking；全局 Context 的取舍 |
| qwen3.py | QK-Norm、fused residual RMSNorm、lru_cache 共享 RoPE、LM head 末位选择（250× 优化 + 正确性前提） |
| loader | packed_modules_mapping 翻译分立→融合；weight_loader 策略模式挂在参数上 |
| attention | Triton 写（-1 掩码）、flash-attn 读（varlen+kvcache 两个姿势）；prefill 双路径 |
| sampler | Gumbel-max 精确采样；compile 三挂点（RMSNorm/RoPE/Sampler） |
| CUDA graph | 档位表、reversed 共享 pool、copy-in/replay/copy-out、图边界止于 lm_head（TP gather 不入图） |

**自测清单**（能答出才算过关）：

- [ ] 默写 run() 四步与 prepare 两套张量组的差异
- [ ] 推导 Gumbel-max 的等价性（三行）
- [ ] 说出 prefill 双路径各自的选择理由
- [ ] 解释 reversed 捕获 + 共享 pool 的原因
- [ ] 说出图边界的三个细节（为什么止于 hidden、padding 如何中性化、改值不改址）
- [ ] 解释 LM head 末位选择为什么同时是优化和正确性前提

**📦 今日产出**：prefill vs decode 数据流对比图 + prepare 侦察日志 + Gumbel-max 验证记录。

---

> 📌 **明日预告**：Day 6 补上最后一块拼图——**Tensor Parallelism**：`layers/linear.py` 的 QKV 列切 / Row 切 + all-reduce、`embed_head.py` 的词表切分与 mask+all_reduce，以及 loader 里那些 weight_loader 的真身。然后是三个 A/B 实验：前缀缓存（共享前缀负载 vs 随机负载）、CUDA graph 开关、（多卡的话）`tensor_parallel_size=2`。
