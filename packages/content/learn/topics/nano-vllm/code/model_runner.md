---
id: "learn:topic:nano-vllm:code:model-runner"
type: learn
title: "model_runner.py 源码解读：执行层总指挥"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, model-runner, kv-cache, cuda-graph, tensor-parallel]
updated: 2026-09-26
topic: nano-vllm
related_problems: []
related_questions: []
---

# model_runner.py 源码解读：执行层总指挥

> 💡 **前置知识**：[Day 5](../day5.md)（执行层与算子层总览）、[Day 3](../day3.md)（slot_mapping / block_table 的调度侧视角）、[Day 2](../day2.md)（step 三段式）
> **源码**：[model_runner.py](model_runner.py)（257 行，逐行引用在正文中）

## 🎯 目标

通过本文，你将：

1. 建立 `ModelRunner` 的**全景职责地图**：它在 Scheduler（决定"算什么"）和模型/算子层（决定"怎么算"）之间，负责**把 Sequence 列表变成一次正确且快的 GPU 前向**
2. 逐行读懂 `__init__` 的 8 步启动时序，并回答三个经典问题：**为什么 warmup 在 KV 分配之前、graph 捕获在 KV 分配之后、模型要直接建在 GPU 上**
3. 掌握 `allocate_kv_cache()` 的**峰值测算法**：`total × util − used − peak + current` 这一行公式如何决定引擎能同时服务多少序列
4. 吃透 **prepare 系列**：`prepare_prefill` / `prepare_decode` 如何把 Python 对象拼成 varlen 张量组，`slot_mapping` 的两个公式分别是什么
5. 理解 TP 模式下 rank 0 与 worker 进程的 **SharedMemory + Event RPC**，以及为什么**计算结果不需要 RPC 回传**
6. 拆解 `run_model()` 的 **eager / CUDA graph 双路径**与 `capture_cudagraph()` 的档位设计、reversed 捕获、copy-in/replay/copy-out 三段式
7. 积累 6 道高频面试题的完整答案

---

## 一、全景：ModelRunner 在引擎中的位置

![ModelRunner 架构总览](assets/model_runner_architecture.svg)

`ModelRunner` 是 nano-vllm 里**唯一同时认识"调度世界"和"GPU 世界"的类**。上游 `LLMEngine.step()` 把 `seqs + is_prefill` 交给它，下游它产出 `token_ids` 交回 `postprocess`：

```python
# engine/llm_engine.py —— 唯一的调用点
token_ids = self.model_runner.call("run", seqs, is_prefill)
```

它的 257 行代码可以切成六组职责：

| 分组 | 方法 | 一句话职责 |
|------|------|-----------|
| 启动/生命周期 | `__init__` / `exit` / `warmup_model` | 建 NCCL 组、建模型、量峰值、切 KV 池、录图；退出时逆序清理 |
| KV 显存管理 | `allocate_kv_cache` / `prepare_block_tables` | 峰值测算法定块数；`-1` 右填充对齐块表 |
| CUDA Graph | `capture_cudagraph` | 档位 `[1,2,4,8,16,…,512]`，由大到小捕获共享 pool |
| prepare 系列 | `prepare_prefill` / `prepare_decode` / `prepare_sample` | Sequence 列表 → 张量组，挂到全局 Context |
| 执行入口 | `run` / `run_model` | 四步流水：prepare → 前向 → 采样 → reset_context |
| TP 进程间 RPC | `call` / `write_shm` / `read_shm` / `loop` | rank 0 直调 + 广播；worker 阻塞等任务 |

> 💡 **一句话总结**：Scheduler 决定"算什么"，`ModelRunner` 决定"怎么算"——所有推理引擎的性能工程（张量拼装、显存切池、图捕获、采样向量化）都发生在这 257 行里。

与 vLLM 的对应关系：`ModelRunner` ≈ `vllm/v1/worker/gpu_model_runner.py`（数千行），差异在于 nano 用**全局 Context 单例**替代了 vLLM 显式传递的 `ForwardBatch`/metadata 对象——模型层接口因此干净得像论文伪代码，代价是多实例/多线程不安全。

---

## 二、启动时序：`__init__` 的 8 步

![启动时序](assets/model_runner_init_sequence.svg)

```python
# engine/model_runner.py L17-48
def __init__(self, config: Config, rank: int, event: Event | list[Event]):
    self.config = config
    hf_config = config.hf_config
    self.block_size = config.kvcache_block_size          # 默认 256
    self.enforce_eager = config.enforce_eager
    self.world_size = config.tensor_parallel_size
    self.rank = rank
    self.event = event

    dist.init_process_group("nccl", "tcp://localhost:2333",
                            world_size=self.world_size, rank=rank)   # ①
    torch.cuda.set_device(rank)
    default_dtype = torch.get_default_dtype()
    torch.set_default_dtype(hf_config.dtype)             # ② 如 bf16
    torch.set_default_device("cuda")
    self.model = Qwen3ForCausalLM(hf_config)             # ③ 直接在 GPU 上构造
    load_model(self.model, config.model)                 # ④ 权重翻译加载
    self.sampler = Sampler()
    self.warmup_model()                                  # ⑤ 量激活峰值
    self.allocate_kv_cache()                             # ⑥ 切 KV 池
    if not self.enforce_eager:
        self.capture_cudagraph()                         # ⑦ 录 decode 图
    torch.set_default_device("cpu")                      # ⑧ 恢复默认值
    torch.set_default_dtype(default_dtype)

    if self.world_size > 1:
        if rank == 0:
            self.shm = SharedMemory(name="nanovllm", create=True, size=2**20)
            dist.barrier()
        else:
            dist.barrier()
            self.shm = SharedMemory(name="nanovllm")
            self.loop()                                  # worker 就位，阻塞等任务
```

几个容易被忽略的细节：

- **单卡也初始化 NCCL**：`init_process_group` 无条件执行，`world_size=1` 时退化成空操作。这让 `linear.py` 里的 `dist.get_rank()` / `dist.all_reduce()` 无需判空——**用通信原语的"退化形态"换取代码路径统一**
- **③+④ 在 ② 之后**：`set_default_device("cuda")` 生效期间，`nn.Linear` 的 `torch.empty(...)` 参数直接在 GPU 上申请，省一次"CPU 构造 + 整模型 `.cuda()` 搬运"
- **⑧ 恢复默认值**：构造完成后把默认 device/dtype 改回 cpu，避免污染主进程后续的普通张量操作

### 2.1 `warmup_model()`：为什么在 KV 分配之前

```python
# engine/model_runner.py L91-101
def warmup_model(self):
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    max_num_batched_tokens, max_model_len = self.config.max_num_batched_tokens, self.config.max_model_len
    seq_len = min(max_num_batched_tokens, max_model_len)
    num_seqs = min(max_num_batched_tokens // seq_len, self.config.max_num_seqs)
    seqs = [Sequence([0] * seq_len) for _ in range(num_seqs)]   # 满批假序列
    for seq in seqs:
        seq.num_scheduled_tokens = seq_len
    self.run(seqs, True)
    torch.cuda.empty_cache()
```

三个关键点：

1. **先 `reset_peak_memory_stats()`**：把之前（建模型、加载权重）的峰值清零，保证量出来的 `peak` 只反映**一次最大规模前向**的激活开销
2. **构造极端 batch**：`seq_len × num_seqs ≈ max_num_batched_tokens`，即调度器允许的最大单步 token 预算——将来运行时不可能超过它
3. **此时 KV cache 还不存在**：`Attention.k_cache` 初始是空张量 `torch.tensor([])`，`forward` 里 `if k_cache.numel() and v_cache.numel()` 守卫让 `store_kvcache` 直接跳过；且假序列没有 `block_table`，`prepare_prefill` 会跳过 slot_mapping——**warmup 是一次"无缓存写入"的裸前向**，专门用来量激活峰值

> ⚠️ **顺序不可颠倒**：如果把 `allocate_kv_cache()` 放在 warmup 之前，峰值统计里就不含"将来运行时必然发生"的激活开销，KV 池会切得过大，运行时激活一上来就 OOM。

### 2.2 `allocate_kv_cache()`：显存账本

![KV Cache 布局](assets/model_runner_kv_cache_layout.svg)

```python
# engine/model_runner.py L103-121
def allocate_kv_cache(self):
    config = self.config
    hf_config = config.hf_config
    free, total = torch.cuda.mem_get_info()
    used = total - free
    peak = torch.cuda.memory_stats()["allocated_bytes.all.peak"]
    current = torch.cuda.memory_stats()["allocated_bytes.all.current"]
    num_kv_heads = hf_config.num_key_value_heads // self.world_size      # GQA + TP 切分
    head_dim = getattr(hf_config, "head_dim",
                       hf_config.hidden_size // hf_config.num_attention_heads)
    block_bytes = 2 * hf_config.num_hidden_layers * self.block_size \
                  * num_kv_heads * head_dim * hf_config.dtype.itemsize
    config.num_kvcache_blocks = int(total * config.gpu_memory_utilization
                                    - used - peak + current) // block_bytes
    assert config.num_kvcache_blocks > 0
    self.kv_cache = torch.empty(2, hf_config.num_hidden_layers,
                                config.num_kvcache_blocks, self.block_size,
                                num_kv_heads, head_dim)
    layer_id = 0
    for module in self.model.modules():
        if hasattr(module, "k_cache") and hasattr(module, "v_cache"):
            module.k_cache = self.kv_cache[0, layer_id]   # 视图，零拷贝
            module.v_cache = self.kv_cache[1, layer_id]
            layer_id += 1
```

拆成三步看：

**第一步：算能用多少**（显存账本）

$$\text{可用字节} = \underbrace{total \times util}_{\text{预算上限}} - \underbrace{used}_{\text{已常驻（权重等）}} - \underbrace{(peak - current)}_{\text{瞬态激活峰值}}$$

- `used`：`total - free`，此刻已常驻的权重、梯度上下文等
- `peak - current`：warmup 量出的**激活瞬态峰值**——运行时这部分会反复出现又释放，必须预留
- `current` 是当下还活着的分配（主要是模型本身，已含在 `used` 里），所以公式里加回去，避免重复扣除

**第二步：算一块多大**（block_bytes）

$$\text{block\_bytes} = \underbrace{2}_{K \text{ 和} V} \times L_{\text{layer}} \times \text{block\_size} \times \underbrace{\frac{H_{kv}}{TP}}_{\text{GQA+TP 切分后}} \times D_{head} \times \text{itemsize}$$

以 Qwen3-0.6B（28 层、8 个 KV 头、head_dim 128、bf16）单卡为例：`2 × 28 × 256 × 8 × 128 × 2 ≈ 37MB` 一块。

**第三步：一次 `torch.empty` 切视图绑定**

- 整个引擎的 KV cache 是**一个大张量**，形状 `[2, L, num_blocks, block_size, num_kv_heads, head_dim]`——连续分配，无碎片
- 遍历 `model.modules()`，把 `kv_cache[0, layer_id]` / `kv_cache[1, layer_id]` **视图**（不是拷贝）挂到每层 `Attention` 的 `k_cache` / `v_cache` 上
- 绑定后地址**终身固定**：CUDA graph 捕获的就是这些指针——这就是为什么捕获必须在分配之后

> 💡 **一句话总结**：`num_kvcache_blocks` 是整个引擎容量的源头——Scheduler 的 BlockManager 拿着它建块管理器，能同时服务多少序列、前缀缓存能存多少块，全部由这一行公式决定。

---

## 三、TP 进程间 RPC：SharedMemory + Event

![TP RPC 机制](assets/model_runner_tp_rpc.svg)

`tensor_parallel_size > 1` 时，`LLMEngine` 会为每个 worker 起一个独立进程，**进程里跑的就是 `ModelRunner.__init__`**（见 `llm_engine.py` 的 `ctx.Process(target=ModelRunner, args=(config, i, event))`）。此后每个 rank 各持一份完整实例，问题变成：**主进程怎么让所有 rank 执行同一个方法？**

```python
# engine/model_runner.py L85-89 —— 统一入口
def call(self, method_name, *args):
    if self.world_size > 1 and self.rank == 0:
        self.write_shm(method_name, *args)     # 广播给 worker
    method = getattr(self, method_name, None)
    return method(*args)                        # 本地执行

# L76-83 —— rank 0 写
def write_shm(self, method_name, *args):
    data = pickle.dumps([method_name, *args])
    n = len(data)
    self.shm.buf[0:4] = n.to_bytes(4, "little")     # 4 字节长度前缀
    self.shm.buf[4:n+4] = data
    for event in self.event:                        # 逐个唤醒 worker
        event.set()

# L68-74 —— worker 读
def read_shm(self):
    self.event.wait()                               # 阻塞直到被唤醒
    n = int.from_bytes(self.shm.buf[0:4], "little")
    method_name, *args = pickle.loads(self.shm.buf[4:n+4])
    self.event.clear()
    return method_name, args

# L61-66 —— worker 主循环
def loop(self):
    while True:
        method_name, args = self.read_shm()
        self.call(method_name, *args)
        if method_name == "exit":
            break
```

设计要点：

| 设计 | 为什么 |
|------|--------|
| **1MB 共享内存 + 4 字节长度前缀** | pickle 字节流长度可变，读端按 `n` 截取，避免读到上一轮的脏数据 |
| **`Event` 唤醒而非轮询** | worker 阻塞在 `event.wait()`，零 CPU 空转；每个 worker 一个 Event（rank 0 持有 list） |
| **`call()` 是唯一入口** | 单卡也走它（只是不广播），`step()` 里一行代码同时适配单卡/多卡 |
| **`Sequence.__getstate__` 瘦身** | 跨进程序列化只带 6 个数字 + 末 token（见 `sequence.py` L72-83），decode 时 IPC 负载是常数 |
| **`exit` 也是一条消息** | 优雅退出走同一条 RPC 通道，无需额外的 kill 机制 |

### 结果怎么收敛？——不靠 RPC

最容易误解的一点：**`token_ids` 不需要从 worker 传回 rank 0**。因为：

1. 每个 rank 收到**同样的输入**（同一个 pickle），执行**同样的前向**
2. TP 通信点藏在**层里**：`VocabParallelEmbedding` / `o_proj` / `down_proj` 的 `forward` 内部调 `dist.all_reduce`（NCCL 集合通信，`__init__` 时建好的进程组）
3. `lm_head` 是 vocab 并行：`dist.gather` 把各 rank 的 logits 分片拼到 rank 0——**完整 logits 只存在于 rank 0**

所以 `run()` 里所有采样相关代码都判 `rank == 0`，worker 直接返回 `None`。

---

## 四、prepare 系列：Sequence 列表 → 张量组

![prepare 张量构造](assets/model_runner_prepare_tensors.svg)

这一层做的事：把 Scheduler 产出的 Python 对象（`list[Sequence]`）拼成 kernel 要的张量组。**所有小张量都 `pin_memory=True` + `.cuda(non_blocking=True)`**——页锁定内存 + 异步 H2D，每个推理引擎的标配。

| 张量 | prefill | decode |
|------|---------|--------|
| `input_ids` | 本步所有序列的新 token **拼接**（varlen 扁平，无 padding） | 每序列 1 个：`seq.last_token` |
| `positions` | `range(start, end)`（**绝对位置**，RoPE 要用） | `len(seq) - 1` |
| `cu_seqlens_q/k` | 批内 q/k 长度前缀和（varlen kernel 的切分依据） | 不需要 |
| `slot_mapping` | 每个新算 token 一个槽位 | 每序列 1 个 |
| `context_lens` | 不需要 | 每序列总长（**含本步刚写的**） |
| `block_tables` | **仅前缀命中时**构造 | 总是构造（`-1` 右填充） |

### 4.1 `prepare_prefill`：varlen 拼接 + 前缀缓存

```python
# engine/model_runner.py L129-170（节选）
def prepare_prefill(self, seqs: list[Sequence]):
    input_ids, positions = [], []
    cu_seqlens_q, cu_seqlens_k = [0], [0]
    slot_mapping = []
    for seq in seqs:
        start = seq.num_cached_tokens            # 前缀命中的部分跳过
        seqlen_q = seq.num_scheduled_tokens      # chunked prefill 也体现在这
        end = start + seqlen_q
        seqlen_k = end                           # k 长度 = 全部历史（含缓存）
        input_ids.extend(seq[start:end])
        positions.extend(range(start, end))      # 绝对位置
        cu_seqlens_q.append(cu_seqlens_q[-1] + seqlen_q)
        cu_seqlens_k.append(cu_seqlens_k[-1] + seqlen_k)
        ...
        for i in range(start_block, end_block):  # 只为"新算的块"算槽位
            slot_start = seq.block_table[i] * self.block_size
            if i == start_block:
                slot_start += start % self.block_size   # 首块跳过命中部分
            ...
    if cu_seqlens_k[-1] > cu_seqlens_q[-1]:      # k 比 q 长 ⇒ 前缀命中
        block_tables = self.prepare_block_tables(seqs)
    ...
    set_context(True, cu_seqlens_q, cu_seqlens_k, max_seqlen_q,
                max_seqlen_k, slot_mapping, None, block_tables)
```

对照上图（block_size=4 示意）手工验算一遍 `slot_mapping`：

- **seq A**（8 token 全算，`block_table=[7,2]`）：块 0（物理 7）→ slots 28–31；块 1（物理 2）→ slots 8–11
- **seq B**（前 4 命中，只算 4 个，`block_table=[3,5]`）：`start=4` → `start_block=1`，物理块 5 → slots 20–23
- `cu_seqlens_q=[0,8,12]`，`cu_seqlens_k=[0,8,16]`——**k 总长大于 q 总长**是前缀命中的判据，此时才构造 `block_tables`，`flash_attn_varlen_func` 改读 `k_cache/v_cache` 并带 `block_table`，**被缓存的 token 不再重算**

> ⚠️ **chunked prefill 的落点**：一个长 prompt 被切成多步算时，第 2 步开始 `num_cached_tokens > 0` 但没有前缀命中——`start` 同样会让 positions 和 slot_mapping 从中间算起。**前缀缓存与 chunked prefill 共用同一套"跳过已算部分"的代码路径**。

### 4.2 `prepare_decode`：每序列 1 个 token

```python
# engine/model_runner.py L172-188
def prepare_decode(self, seqs: list[Sequence]):
    input_ids, positions, slot_mapping, context_lens = [], [], [], []
    for seq in seqs:
        input_ids.append(seq.last_token)
        positions.append(len(seq) - 1)
        context_lens.append(len(seq))            # 含本步刚写的这个 token
        slot_mapping.append(seq.block_table[-1] * self.block_size
                            + seq.last_block_num_tokens - 1)
    ...
    block_tables = self.prepare_block_tables(seqs)
    set_context(False, slot_mapping=slot_mapping,
                context_lens=context_lens, block_tables=block_tables)
```

decode 的 slot 公式比 prefill 简单得多——**新 token 永远落在末块的下一个小空格**：

$$slot = \text{block\_table}[-1] \times \text{block\_size} + \underbrace{\text{last\_block\_num\_tokens} - 1}_{\text{末块内偏移}}$$

对照上图验算：seq A（len=6，`block_table=[7,2]`，末块 2 格）→ `2×4 + 2 − 1 = 9`；seq C（len=3，`block_table=[4]`）→ `4×4 + 3 − 1 = 18`。

`context_lens` 的语义要精确：**包含本步正在写入的 token**——`flash_attn_with_kvcache` 用它决定读 cache 的前多少个位置，而本步的 k/v 会先被 `store_kvcache` 写进末槽。

### 4.3 `prepare_block_tables` / `prepare_sample`

```python
# engine/model_runner.py L123-127
def prepare_block_tables(self, seqs: list[Sequence]):
    max_len = max(len(seq.block_table) for seq in seqs)
    block_tables = [seq.block_table + [-1] * (max_len - len(seq.block_table))
                    for seq in seqs]                       # -1 右填充
    return torch.tensor(block_tables, dtype=torch.int32,
                        pin_memory=True).cuda(non_blocking=True)
```

批内序列块数不一，**短序列的块表用 -1 右填充**到最长——kernel 对 `-1` 块自然跳过（与 slot_mapping 的 `-1` 语义一致）。

`prepare_sample` 则把每序列的 `temperature` 收集成一个 `[bs]` 张量——采样参数也批量化，配合 `sampler.py` 的 Gumbel-max 一次算完整个 batch。

---

## 五、执行主链：`run()` 与 `run_model()`

![执行流程](assets/model_runner_run_flow.svg)

```python
# engine/model_runner.py L214-220 —— 四步流水
def run(self, seqs: list[Sequence], is_prefill: bool) -> list[int]:
    input_ids, positions = self.prepare_prefill(seqs) if is_prefill else self.prepare_decode(seqs)
    temperatures = self.prepare_sample(seqs) if self.rank == 0 else None
    logits = self.run_model(input_ids, positions, is_prefill)
    token_ids = self.sampler(logits, temperatures).tolist() if self.rank == 0 else None
    reset_context()                # 清空全局 Context，防跨步泄漏
    return token_ids
```

`run_model` 是性能工程的核心分叉点：

```python
# engine/model_runner.py L195-212
@torch.inference_mode()
def run_model(self, input_ids, positions, is_prefill):
    if is_prefill or self.enforce_eager or input_ids.size(0) > 512:
        # 路径 A：eager 前向
        return self.model.compute_logits(self.model(input_ids, positions))
    else:
        # 路径 B：CUDA graph 重放
        bs = input_ids.size(0)
        context = get_context()
        graph = self.graphs[next(x for x in self.graph_bs if x >= bs)]  # 选档
        graph_vars = self.graph_vars
        graph_vars["input_ids"][:bs] = input_ids
        graph_vars["positions"][:bs] = positions
        graph_vars["slot_mapping"].fill_(-1)          # 先清空
        graph_vars["slot_mapping"][:bs] = context.slot_mapping
        graph_vars["context_lens"].zero_()
        graph_vars["context_lens"][:bs] = context.context_lens
        graph_vars["block_tables"][:bs, :context.block_tables.size(1)] = context.block_tables
        graph.replay()
        return self.model.compute_logits(graph_vars["outputs"][:bs])
```

**为什么三分支走 eager、其余走图？**

| 条件 | 原因 |
|------|------|
| `is_prefill` | 本步 token 数 = 批内新 token 总数，**每步都在变**，档位对不上；且 prefill 是计算密集，launch 开销占比小 |
| `enforce_eager` | 用户显式关闭图（调试、省显存） |
| `bs > 512` | 超出最大档位 `max_bs = min(max_num_seqs, 512)`，没有图可用 |

**路径 B 的 copy-in 三板斧**值得背下来：

1. `slot_mapping.fill_(-1)` 再写前 `bs` 个——**先清后写**，防止上一轮残留
2. `context_lens.zero_()` 再写前 `bs` 个——多余行的 context_len=0，kernel 侧跳过
3. `block_tables` 只拷**实际用到的列**（`[:bs, :实际块数]`），右侧原本就是 0

`compute_logits`（`ParallelLMHead.forward`）还藏着一个联动优化：prefill 时它从 Context 读 `cu_seqlens_q`，**只取每个序列末位的 hidden 算 logits**——`[total_tokens, hidden]` 的输出只有 `[num_seqs, vocab]` 进入采样，省掉整个 vocab 维度的大 GEMM 大头。

---

## 六、CUDA Graph：`capture_cudagraph()` 的捕获与重放

![CUDA Graph 捕获与重放](assets/model_runner_cudagraph.svg)

```python
# engine/model_runner.py L222-257（节选）
@torch.inference_mode()
def capture_cudagraph(self):
    max_bs = min(self.config.max_num_seqs, 512)
    max_num_blocks = (config.max_model_len + self.block_size - 1) // self.block_size
    input_ids = torch.zeros(max_bs, dtype=torch.int64)        # 静态 buffer
    positions = torch.zeros(max_bs, dtype=torch.int64)
    slot_mapping = torch.zeros(max_bs, dtype=torch.int32)
    context_lens = torch.zeros(max_bs, dtype=torch.int32)
    block_tables = torch.zeros(max_bs, max_num_blocks, dtype=torch.int32)
    outputs = torch.zeros(max_bs, hf_config.hidden_size)
    self.graph_bs = [1, 2, 4, 8] + list(range(16, max_bs + 1, 16))
    self.graphs = {}
    self.graph_pool = None

    for bs in reversed(self.graph_bs):                        # 从大到小！
        graph = torch.cuda.CUDAGraph()
        set_context(False, slot_mapping=slot_mapping[:bs],
                    context_lens=context_lens[:bs],
                    block_tables=block_tables[:bs])
        outputs[:bs] = self.model(input_ids[:bs], positions[:bs])   # warmup
        with torch.cuda.graph(graph, self.graph_pool):              # 捕获
            outputs[:bs] = self.model(input_ids[:bs], positions[:bs])
        if self.graph_pool is None:
            self.graph_pool = graph.pool()                   # 首图建池
        self.graphs[bs] = graph
        torch.cuda.synchronize()
        reset_context()

    self.graph_vars = dict(input_ids=input_ids, positions=positions,
                           slot_mapping=slot_mapping, context_lens=context_lens,
                           block_tables=block_tables, outputs=outputs)
```

### 6.1 四个关键设计

**① 档位化（graph_bs）**：`[1,2,4,8,16,32,…,512]` 共 ~36 档。实际 `bs=5` 时选 `next(x for x in graph_bs if x >= bs) = 16`，**多算 11 行**换来"任何 bs 都有图可用"且捕获成本有限。小档位（1/2/4/8）单独列出是因为小 batch 对 launch 开销最敏感。

**② reversed（从大到小）捕获**：第一个（最大）图捕获时建立 `graph_pool`，后续小图全部共享这个池。**池按最大需求一次成型**——如果从小往大捕获，池会在捕获过程中扩张，可能使先前图里录下的张量地址失效。PyTorch 官方同样建议按显存占用降序捕获。

**③ 共享静态 buffer + 指针固定**：六个 buffer 按最大档位分配一次，所有档位的图录的都是这些地址的**切片视图**（`slot_mapping[:bs]`）。重放时改的是**内容**，不动指针——这是 copy-in/replay/copy-out 三段式的物理基础。

**④ `-1` 槽位天然无效**：`store_kvcache` 的 Triton kernel 开头就是 `if slot == -1: return`（`attention.py` L23）。所以档位比实际 bs 多出来的行：`slot_mapping=-1` 不写 KV、`context_lens=0` 不读 KV——**档位与实际 batch size 彻底解耦**，不需要为每个 bs 单独捕获。

### 6.2 图边界：为什么止于 lm_head 之前

图录的是 `model()` 的输出 `hidden_states`（`[bs, hidden]`），`compute_logits` / `sampler` 留在图外，原因有三：

1. **prefill 分支没有图**，`compute_logits` 要为 eager/graph 两条路径共用，放在图外统一
2. `lm_head` 的 forward 依赖 Context（prefill 时按 `cu_seqlens_q` 取末位）且 TP 下有 `dist.gather`——集合通信进图会让捕获过程真的发生跨卡同步，复杂化
3. logits 形状 `[bs, vocab]` 巨大，且马上被采样消费掉，没必要缓存输出 buffer

> 💡 **一句话总结**：CUDA graph 的本质是"**用静态形状换动态调度**"——decode 阶段每步形状几乎不变，把它档位化之后，几十个 kernel 的 launch 开销折叠成一次 `graph.replay()`，这正是 decode 阶段小 batch 吞吐的命门。

---

## 七、`exit()`：逆序清理

```python
# engine/model_runner.py L50-59
def exit(self):
    if self.world_size > 1:
        self.shm.close()
        dist.barrier()                    # 等 worker 也 close
        if self.rank == 0:
            self.shm.unlink()             # 只有 rank 0 有权释放共享内存
    if not self.enforce_eager:
        del self.graphs, self.graph_pool
    torch.cuda.synchronize()
    dist.destroy_process_group()
```

与 `__init__` 严格对称：`__init__` 里 rank 0 `create` 共享内存 + barrier，`exit` 里 rank 0 `unlink` + barrier；图是最后捕获的，最先 `del`。`LLMEngine` 用 `atexit.register(self.exit)` 兜底，正常退出时由 `call("exit")` 通知 worker 跳出 `loop()`。

---

## 八、面试要点

**Q1：为什么 warmup 必须在 allocate_kv_cache 之前？**

> KV 池大小的公式是 `total×util − used − (peak − current)`，其中 `peak − current` 是激活的**瞬态峰值**——只有跑一次最大规模前向（`max_num_batched_tokens` 满批）才能量出来。如果不 warmup，公式会少扣这块预算，KV 池切得过大，运行时激活一来就 OOM。warmup 时 KV cache 尚未绑定（`k_cache` 还是空张量），`store_kvcache` 被 `numel()` 守卫跳过，是一次纯计算，不影响测量的正确性。

**Q2：`slot_mapping` 在 prefill 和 decode 下分别怎么算？**

> 都是 `slot = 物理块号 × block_size + 块内偏移`，但"块内偏移"的来源不同。prefill：遍历本步新算 token 覆盖的逻辑块区间 `[start_block, end_block)`，首块偏移是 `start % block_size`（跳过前缀命中/chunk 已算的部分），末块截至 `end - i*block_size`；每个新算 token 一个槽。decode：每序列只有 1 个新 token，永远落在末块，`slot = block_table[-1] × block_size + last_block_num_tokens − 1`。

**Q3：TP 模式下 `call()` 的 RPC 是怎么工作的？为什么 token_ids 不需要从 worker 传回？**

> rank 0 把 `(方法名, 参数)` pickle 进 1MB 命名共享内存（前 4 字节存长度），然后逐个 `event.set()` 唤醒 worker；worker 的 `loop()` 阻塞在 `event.wait()`，醒来后按长度读共享内存、unpickle、本地执行同名方法。结果不回传是因为：各 rank 收到同样输入、执行同样前向，TP 的通信点藏在层里（`o_proj`/`down_proj`/embedding 的 `all_reduce`、lm_head 的 `gather` 到 rank 0）——**完整 logits 只在 rank 0 存在**，采样只在 rank 0 做，worker 返回 None。

**Q4：CUDA graph 为什么从最大档位开始（reversed）捕获？**

> 所有档位的图共享一个 `graph_pool`，第一个捕获的图建立池。从最大档位开始，池按最大显存需求一次成型；后续小图直接复用，不会触发池扩张。反过来从小到大捕获，池会在过程中扩张，可能使先前图录下的张量地址失效。这是 PyTorch 官方推荐的做法（按显存占用降序捕获共享 pool 的图）。

**Q5：实际 bs=5 但用的是 bs=16 的图，多出的 11 行怎么保证不算错？**

> 三重保证：copy-in 时 `slot_mapping.fill_(-1)` 后只写前 5 个，Triton kernel 对 `slot == -1` 直接 return，不写 KV；`context_lens.zero_()` 后只写前 5 个，注意力 kernel 对 0 长度序列不产生有效输出；`block_tables` 只拷实际列。最后 copy-out 只取 `outputs[:5]`。**用"无效值 + kernel 侧守卫"实现档位与实际 bs 的解耦**。

**Q6：全局 Context（`set_context`/`get_context`）这个设计有什么利弊？vLLM 怎么做？**

> 利：模型层接口干净——`Attention.forward(q, k, v)` 不需要传 slot_mapping/block_tables 等十来个调度产物，`lm_head` 也能直接读 `cu_seqlens`；单进程单引擎下代码量最少。弊：模块级单例意味着多引擎实例、多线程会互相踩，测试难以隔离，还要求 `run()` 结束必须 `reset_context()` 防泄漏。vLLM 用显式的 `ForwardBatch`/`AttentionMetadata` 对象一路传参——啰嗦但并发安全。nano 的选择再次体现"需求决定架构"。

---

## 九、小结

把 257 行读薄成一张卡片：

| 生命周期 | 关键动作 | 一句话 |
|----------|----------|--------|
| 启动 | `__init__` 8 步 | NCCL → GPU 建模型 → 加载 → **warmup 量峰值** → **切 KV 池** → **录图** → 恢复默认 → shm 握手 |
| 每步 prefill | `prepare_prefill` | varlen 拼接 + cu_seqlens + 逐块算 slot；前缀命中才建 block_tables |
| 每步 decode | `prepare_decode` | 每序列 1 token；slot = 末块 × bs + 末块内偏移 |
| 执行 | `run_model` | prefill/eager/bs>512 → eager；否则选档 copy-in → replay → copy-out |
| 采样 | `sampler` | Gumbel-max 批量化，仅 rank 0 |
| 收尾 | `reset_context` | 清空全局上下文，防跨步泄漏 |
| 退出 | `exit` | shm unlink + destroy_process_group，与 init 对称 |

> 📌 **延伸阅读**：[Day 5](../day5.md) 从算子层视角看同一批数据（Triton 写 KV / flash-attn 读 KV）；[Day 3](../day3.md) 看 BlockManager 与链式哈希前缀缓存的调度侧；[Day 6](../day6.md) 看 TP 通信点的完整分布。
