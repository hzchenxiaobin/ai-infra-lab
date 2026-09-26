---
id: "learn:topic:nano-vllm:d6"
type: learn
title: "Day 6：Tensor Parallelism 与优化特性 A/B 实验"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, tensor-parallelism, prefix-caching, cuda-graph]
updated: 2026-09-25
day: 6
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 6：Tensor Parallelism 与优化特性 A/B 实验

## 🎯 目标

通过今天的学习，你将：

1. 精读 `layers/linear.py`：Megatron 式 **Column-Row 配对**如何把 TP 的通信压到每层 2 次 all-reduce——列切前向零通信、行切一次归约、bias 只在 rank 0 加
2. 吃透 `QKVParallelLinear`：融合权重在每个 rank 上的三段布局（q|k|v）、weight_loader 的偏移计算、GQA 对 TP 度的整除约束
3. 补完 `embed_head.py` 的词表并行（mask + all_reduce / gather 到 rank 0），画出**一个 forward 的通信账单**
4. 完成**三组 A/B 实验**：前缀缓存（对齐/错位前缀的块粒度损失）、CUDA graph（小 batch vs 大 batch 的收益差异）、TP（双卡冒烟或单卡画图）
5. 产出：三组实验表（配置、数据、一句话结论）——Day 7 复盘和面试的弹药库

> 💡 **前置知识**：[Day 5](day5.md) 的 loader/weight_loader 策略模式（今天看它的真身）+ [Day 3](day3.md) 的块哈希（实验一的原理）
> ⚠️ **环境要求**：实验一/二需单卡 GPU（建议显存 ≥ 6GB）；实验三双卡可选，单卡用画图替代；周六时间预算 5 小时

---

## 今天的结构：上午读码，下午实验

昨天读完了执行层，但 `layers/linear.py` 和 `embed_head.py` 的 **TP 切分**被特意留到今天——因为它们是"读懂"与"验证"的完美配对：上午理解切分数学，下午用实验验证三个优化特性（前缀缓存、CUDA graph、TP）各自的收益从哪来。

| 优化特性 | 原理日 | 今天的验证方式 |
|----------|--------|----------------|
| Tensor Parallelism | 本文 6.1-6.6 | 读码 + 双卡冒烟 / 通信点图 |
| Prefix caching | [Day 3](day3.md) | 实验 1：A/B/C 负载对比 |
| CUDA graph | [Day 5](day5.md) 5.7 | 实验 2：2×2 矩阵（batch × 开关） |

---

## 核心概念

### 6.1 TP 总览：切什么、不切什么

Tensor Parallelism 把每层的矩阵乘按维度切开分到多卡。nano-vllm 沿用 Megatron-LM 的经典方案，先看一个 decoder layer 里谁被切、通信发生在哪：

```text
rank r 视角的一个 Qwen3 decoder layer（hidden [T, H] 完整复制在各 rank）：

  hidden [T, H]（各 rank 相同）
   ├─ qkv_proj   ColumnParallel：x @ W_rᵀ → qkv_r [T, (q_r+2k_r)·hd]      ← 无通信
   ├─ attention  只算本 rank 的 q_r 个头（GQA 广播在 kernel 内）           ← 无通信
   ├─ o_proj     RowParallel：部分和 → all_reduce → hidden [T, H] 完整    ★通信 1
   ├─ gate_up    ColumnParallel → [T, 2·I_r]                              ← 无通信
   └─ down_proj  RowParallel：部分和 → all_reduce → hidden 完整           ★通信 2

整个 forward 另有：embedding 的 all_reduce（★通信 0）+ lm_head 的 gather（★通信 3）
```

**TP 的账单**（这是评估一切并行方案的框架）：

| 维度 | TP=N 的效果 |
|------|-------------|
| 权重显存 | ÷ N（每 rank 只存分片） |
| KV Cache 显存 | ÷ N（kv_heads 也切） |
| 计算量 | ÷ N |
| 通信 | **每 forward 约 (2L+2) 次集合通信**（L=28 层 → 58 次），每次搬 [T, H] |
| 约束 | 注意力头数、KV 头数、词表、中间维都要被 N 整除 |

### 6.2 ColumnParallelLinear：输出维切分，前向零通信

```python
class ColumnParallelLinear(LinearBase):
    def __init__(self, input_size, output_size, bias=False):
        super().__init__(input_size, divide(output_size, tp_size), bias, 0)   # tp_dim=0

    def forward(self, x):
        return F.linear(x, self.weight, self.bias)      # 就是普通 matmul！
```

权重形状 `[output, input]`，**沿 dim 0（输出维）切**。前向为什么零通信？$Y = XW^\top$，$X$ 每个 rank 都有完整的，$W$ 只拿自己那几**列**（输出特征分片）——算出来的 $Y_r$ 是输出特征的一部分，**不需要立刻合并**，因为下游（注意力头 / MLP 激活）本来就可以按特征分片各自算。

### 6.3 RowParallelLinear：输入维切分 + all-reduce

```python
class RowParallelLinear(LinearBase):
    def __init__(self, input_size, output_size, bias=False):
        super().__init__(divide(input_size, tp_size), output_size, bias, 1)   # tp_dim=1

    def forward(self, x):
        y = F.linear(x, self.weight, self.bias if self.tp_rank == 0 else None)
        if self.tp_size > 1:
            dist.all_reduce(y)        # 部分和求和 → 完整输出
        return y
```

沿输入维切：每 rank 拿 $W$ 的部分**行**，配上游 Column 层给出的分片输入 $X_r$——算出的 $Y_r = X_r W_r^\top$ 是**部分和**，一次 all-reduce 求和得到完整 $Y$。

**两个必考细节**：

1. **bias 只在 rank 0 加**：all-reduce 是求和，若每个 rank 都加 bias，结果里 bias 被加了 N 次——`self.bias if self.tp_rank == 0 else None` 一个三元表达式防住这个经典 bug
2. **为什么 Column-Row 必须配对**：Column 的输出分片**恰好**是 Row 需要的输入分片，中间结果从不聚合——每个"投影对"只在 Row 出口付一次 all-reduce。对比另两种切法：全 Column（输出分片要用时得 all-gather）；全 Row（输入得先切片聚合）。**配对切分让通信次数最少**

### 6.4 QKVParallelLinear：融合 + 三段布局

```python
class QKVParallelLinear(ColumnParallelLinear):
    def __init__(self, hidden_size, head_size, total_num_heads, total_num_kv_heads, bias=False):
        self.num_heads = divide(total_num_heads, tp_size)
        self.num_kv_heads = divide(total_num_kv_heads, tp_size)     # ★ GQA 的 TP 约束在这
        output_size = (total_num_heads + 2 * total_num_kv_heads) * head_size
        super().__init__(hidden_size, output_size, bias)

    def weight_loader(self, param, loaded_weight, loaded_shard_id):   # "q" / "k" / "v"
        if loaded_shard_id == "q":   shard_size, shard_offset = self.num_heads * head_size, 0
        elif loaded_shard_id == "k": shard_size, shard_offset = self.num_kv_heads * head_size, self.num_heads * head_size
        else:                        shard_size, shard_offset = self.num_kv_heads * head_size, \
                                      self.num_heads * head_size + self.num_kv_heads * head_size
        param_data = param.data.narrow(self.tp_dim, shard_offset, shard_size)
        loaded_weight = loaded_weight.chunk(self.tp_size, self.tp_dim)[self.tp_rank]
        param_data.copy_(loaded_weight)
```

每个 rank 的融合权重布局是三段式 `[q_r | k_r | v_r]`。以 Qwen3-0.6B（16 头、8 KV 头、head_dim 128）、TP=2 为例：

```text
checkpoint（分立）                 每 rank 的 qkv_proj.weight（融合）
q_proj.weight  [2048, 1024]  ─┐    rank0: [ q[0:8]·128 | k[0:4]·128 | v[0:4]·128 ]
k_proj.weight  [1024, 1024]  ─┼→   rank1: [ q[8:16]·128 | k[4:8]·128 | v[4:8]·128 ]
v_proj.weight  [1024, 1024]  ─┘
```

加载动作（配合 [Day 5](day5.md) 的 loader）：`chunk(tp_size)[rank]` 从 checkpoint 整块里切出本 rank 的份，`narrow(offset)` 放进融合参数的对应段。这就是 `packed_modules_mapping` 里 shard_id（"q"/"k"/"v"）的最终归宿。

**GQA 的 TP 约束**：`divide(total_num_kv_heads, tp_size)` 断言整除——8 个 KV 头最多 TP=8。KV 头比 Q 头少的模型（GQA/MQA），TP 度上限常常卡在 KV 头数上，这是选 TP 度时的第一检查项。

`MergedColumnParallelLinear`（gate_up）是同款逻辑的二维版：shard_id 0/1 对应 gate/up，`shard_offset = sum(output_sizes[:id]) // tp_size`。

### 6.5 词表并行：Embedding 与 LM head

```python
# VocabParallelEmbedding.forward（词表按 rank 切片）
if self.tp_size > 1:
    mask = (x >= self.vocab_start_idx) & (x < self.vocab_end_idx)   # 本 rank 管辖内的 token
    x = mask * (x - self.vocab_start_idx)      # 管辖外 → 索引 0（查了再置零）
y = F.embedding(x, self.weight)
if self.tp_size > 1:
    y = mask.unsqueeze(1) * y                  # 管辖外的 embedding 置零
    dist.all_reduce(y)                         # 各 rank 部分结果求和 → 完整 embedding
```

每个 token 的 embedding 只存在于唯一一个 rank——mask 置零 + all-reduce 求和是"每 rank 只贡献自己那部分"的标准写法。`ParallelLMHead` 继承同样的词表切分，但收尾换成 `dist.gather`：**logits 的 vocab 分片收集到 rank 0 拼接**（采样只在 rank 0 做，[Day 5](day5.md) 的 `if self.rank == 0` 在这里闭环）。

### 6.6 一个 forward 的通信账单（今天读码的总结图）

```text
TP=N 时一次 forward 的全部集合通信：
  embedding all_reduce ×1
  每层 (o_proj + down_proj) all_reduce ×2  ──× 28 层 = 56
  lm_head gather ×1（去 rank 0）
  ────────────────────────────────
  合计 58 次集合通信，每次约 [T, H] 大小
```

TP 的收益（显存 ÷N、算力 ÷N）与成本（58 次同步通信）都随 N 增长——**通信延迟在 N 大 / 模型小 / 序列短时会吞掉并行收益**，这就是为什么小模型很少上大 TP、PD 分离和多机推理要用更聪明的并行组合。

---

## 动手实践

### 任务 A：精读 linear.py + embed_head.py（60 分钟）

| 自问 | 线索 |
|------|------|
| Column 的 forward 为什么就是普通 F.linear？ | X 完整、W 列切、输出分片恰好是下游要的 |
| Row 的 bias 为什么 `tp_rank == 0` 才加？ | all-reduce 求和，N 个 rank 各加一次 = bias×N |
| QKV 的 shard_offset 三段怎么算的？ | q 在 0、k 在 q_size、v 在 q_size+kv_size |
| 词表并行为什么用 mask+all_reduce 而不是 all_gather？ | embedding 每行只在一个 rank，求和即拼接 |
| 6.6 的 58 次通信，哪几次的 tensor 最大？ | 与 T 成正比——prefill 大步最贵 |

### 实验 1：前缀缓存 A/B/C（60 分钟）

三组负载，同一引擎顺序跑（**顺序很重要**：A 先跑避免被 B/C 的缓存污染）：

```python
# ab_prefix.py —— 前缀缓存收益与块粒度损失
# 运行: python3 ab_prefix.py
import random, time
from nanovllm import LLM, SamplingParams

MODEL = "/root/huggingface/Qwen3-0.6B"      # 改成本地路径
random.seed(0)
N, OUT = 32, 128                             # 32 条请求、每条生成 128 token

llm = LLM(MODEL, enforce_eager=True)
orig_step, stats = llm.step, {"prefill": 0}

def stat_step():                             # 统计本次 run 的 prefill 实算 token
    outputs, num_tokens = orig_step()
    if num_tokens > 0:
        stats["prefill"] += num_tokens
    return outputs, num_tokens
llm.step = stat_step

def run(tag, prompts):
    stats["prefill"] = 0
    sps = [SamplingParams(temperature=0.6, max_tokens=OUT, ignore_eos=True)] * len(prompts)
    t = time.time()
    llm.generate(prompts, sps, use_tqdm=False)
    dt = time.time() - t
    print(f"{tag:14s} 耗时 {dt:5.1f}s | 吞吐 {N*OUT/dt:6.0f} tok/s | prefill 实算 {stats['prefill']:6d} tok"
          f"（理论无缓存 {N*len(prompts[0])}）")

prefix = [random.randint(1000, 9000) for _ in range(512)]           # 512 = 2 个整块，完美对齐
prefix_c = [random.randint(1000, 9000) for _ in range(520)]         # 独立生成，避免蹭 B 的缓存
tail = lambda: [random.randint(1000, 9000) for _ in range(16)]

run("A 全随机",      [[random.randint(1000, 9000) for _ in range(528)] for _ in range(N)])
run("B 共享512对齐", [prefix + tail() for _ in range(N)])
run("C 共享520错位", [prefix_c + tail() for _ in range(N)])
```

**预期结果与解读**：

| 组 | prefill 实算（预期） | 相对吞吐 |
|----|---------------------|----------|
| A 全随机 | 32×528 = 16896 | 基线 |
| B 共享 512（对齐） | 528 + 31×16 ≈ 1024 | 明显最高 |
| C 共享 520（错位 8） | 520 + 31×(8+16) ≈ 1264 | 略低于 B |

- **B 的原理**：请求 0 把 512-token 前缀算进 2 个满块并登记哈希；请求 1-31 的 `can_allocate` 逐块命中（`ref_count` 共享，[Day 3](day3.md) 任务 B 第 2 幕的放大版）——prefill 工作量只剩 16-token 尾段
- **C 的原理**：520 = 2 整块 + 8 个"孤儿" token——孤儿落在不满的尾块，**永远不进哈希**，每个请求都要重算。这就是**块粒度损失**：错位 < 1 块（<256 token）的前缀复用不到
- C−B 每请求只差 8 token，肉眼快看不出来——把 C 的前缀换成 **384**（1 整块 + 128 孤儿）再跑一次，损失放大 16 倍，差距立刻可见
- **注意**：若中途看到 preempt 日志（块池不够），把 N 减半再跑

### 实验 2：CUDA graph 2×2（60 分钟）

每格一个独立进程（避免引擎间显存/端口干扰）：

```python
# ab_graph.py —— 用法: python3 ab_graph.py <num_seqs> <eager|graph>
import random, sys, time
from nanovllm import LLM, SamplingParams

MODEL = "/root/huggingface/Qwen3-0.6B"
num_seqs, eager = int(sys.argv[1]), sys.argv[2] == "eager"
random.seed(0)

llm = LLM(MODEL, enforce_eager=eager, max_model_len=4096)
prompts = [[random.randint(1000, 9000) for _ in range(512)] for _ in range(num_seqs)]
sps = [SamplingParams(temperature=0.6, max_tokens=256, ignore_eos=True)] * num_seqs

llm.generate(["warmup"], SamplingParams(max_tokens=1))     # 排除图捕获等一次性开销
t = time.time()
llm.generate(prompts, sps, use_tqdm=False)
dt = time.time() - t
print(f"seqs={num_seqs:3d} {'eager' if eager else 'graph':5s} | "
      f"吞吐 {num_seqs*256/dt:6.0f} tok/s | 耗时 {dt:.1f}s")
```

```bash
python3 ab_graph.py 8 eager && python3 ab_graph.py 8 graph
python3 ab_graph.py 256 eager && python3 ab_graph.py 256 graph
```

**预期方向**（把你的实测填进去）：

| batch | eager | graph | graph 提升 |
|-------|-------|-------|-----------|
| 8 | | | 大（launch 开销占比高） |
| 256 | | | 小（计算时间摊薄了 launch） |

**为什么小 batch 差异大？** decode 每步的 kernel 数量与 batch 无关（约几十个），CPU 发射开销近似常数；batch=8 时每个 kernel 只算 8 行，GPU 计算时间极短——**CPU 发射速度成了瓶颈**，graph 一次发射整图直接解除；batch=256 时每步计算量是 32 倍，launch 开销被摊薄，收益缩小。**同一个优化在不同负载下收益天差地别——所以 A/B 实验必须扫 batch 维度**。

### 实验 3：Tensor Parallelism（30 分钟，双卡可选）

**双卡冒烟**：

```python
# tp_run.py —— 双卡 TP=2 最小验证
from nanovllm import LLM, SamplingParams
llm = LLM("/root/huggingface/Qwen3-0.6B", tensor_parallel_size=2, enforce_eager=True)
out = llm.generate(["introduce yourself"], SamplingParams(temperature=0.6, max_tokens=64))
print(out[0]["text"])
```

```bash
CUDA_VISIBLE_DEVICES=0,1 python3 tp_run.py
```

观察点：① `nvidia-smi` 出现**两个进程各占一张卡**（rank 0 在主进程、rank 1 是 spawn 的子进程，[Day 5](day5.md) 5.1）；② 每 rank 的权重显存约为单卡的一半（各持分片）；③ 日志/显存里 KV 池也是每 rank 一份（kv_heads 减半）。

> ⚠️ **两个工程坑**：① NCCL 用**写死的端口 2333**（`init_process_group("nccl", "tcp://localhost:2333")`）——同机同时只能跑一个 TP 引擎，残留进程要 `kill` 干净；② TP 进程崩了一半时另一个可能挂着，先查 `ps`。

**单卡替代任务**：把 6.6 的通信账单画成完整通信点图（一个 decoder layer 从 hidden 到 hidden，标出 2 个 all-reduce 的位置与 tensor 形状），再对照 [vLLM 专题](../vllm/README.md) Day 6 的 TP 部分看工业版差异。

### 学习时间安排（共 5 小时，周六）

| 时长 | 内容 |
|---|---|
| 90 分钟 | 理论：本文 6.1-6.6 + 任务 A 精读 |
| 60 分钟 | 实验 1：前缀缓存 A/B/C |
| 60 分钟 | 实验 2：CUDA graph 2×2 |
| 30 分钟 | 实验 3：TP 冒烟 / 通信点图 |
| 60 分钟 | 整理三组实验表 + 周日预习（vLLM 模块对照预热） |

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| Row 层 bias 每个 rank 都加 | TP>1 时输出系统性偏大 | bias 只在 rank 0 加（源码用三元表达式防住） |
| TP 度超过 KV 头数 | `divide` 断言崩溃 | Qwen3-0.6B（8 KV 头）TP ≤ 8；先查 GQA 头数再定 TP 度 |
| 前缀缓存实验顺序随意 | B 的缓存污染 C 的基线 | 先跑无共享的 A，B/C 用互相独立的前缀 |
| 前缀长度不查块对齐 | 以为"共享了就命中" | 只有**整块**（256 token）参与哈希——尾段 1-255 token 白共享 |
| CUDA graph 实验共用一个引擎 | enforce_eager 是引擎级参数，跑完 eager 再跑 graph 需要重建 | 每格独立进程（脚本已按此设计） |
| TP 残留进程占住 2333 端口 | 下次启动 NCCL init 报错 | `ps aux | grep tp_run` 清理；nano 端口写死是已知局限 |

---

## 面试要点

**Q：Tensor Parallelism 为什么必须 Column-Row 配对？其他切法差在哪？**
> $Y=XW^\top$：沿 W 的输出维切（Column）时 X 完整、输出是特征分片，前向零通信；沿输入维切（Row）时输入需分片、输出是部分和，出口一次 all-reduce。Column 的输出分片恰好是 Row 需要的输入分片——中间激活从不聚合，每个"投影对"只付一次归约。全 Column 要在用到处 all-gather；全 Row 要在入口切分聚合——通信次数都更多。这是"按数据流形状选切分轴"的经典案例。

**Q：RowParallelLinear 的 bias 为什么要特判 rank 0？**
> all-reduce 对各 rank 的结果求和。bias 加在 matmul 结果上是加性项——N 个 rank 各加一次，归约后 bias 被放大 N 倍。所以只在 rank 0 的 partial 里带上 bias。这类"加性项 × 集合通信"的 bug 是 TP 实现的高频错误点（损失函数里的常数项、LayerNorm 的均值修正同理）。

**Q：TP 模式下 QKV 融合权重在每个 rank 上怎么布局？加载时怎么放对位置？**
> 每 rank 三段式 `[q_r·hd | k_r·hd | v_r·hd]`。HF checkpoint 是分立的 q/k/v_proj——weight_loader 按 shard_id 算段内偏移（q 在 0、k 在 q_size、v 在 q_size+kv_size），再把 checkpoint 权重 `chunk(tp_size)` 取本 rank 份 `copy_` 进去。融合收益（一次 GEMM）与 TP 切分（段内偏移）在 loader 里交汇——这也是为什么 weight_loader 必须挂在参数上（策略模式）。

**Q：GQA 模型选 TP 度有什么约束？为什么？**
> KV 头数必须被 TP 度整除（`divide(total_num_kv_heads, tp_size)` 断言）。Q/K/V 三个投影里 k、v 的输出维 = KV 头数×head_dim，切不出整数份就无解。MQA（KV 头=1）直接排除 TP>1——这是很多新模型 KV 头很少带来的实际部署约束。相比之下注意力 Q 头数、MLP 中间维、词表也要整除，但 KV 头数通常是最紧的那个。

**Q：设计一个前缀缓存 A/B 实验，要注意哪些变量控制？**
> ① **块对齐**：共享前缀长度必须是块大小整数倍才完全命中（512 = 2 块），错位时损失上界为块大小-1；② **顺序**：先跑无共享负载，共享前缀互相独立，避免跨 run 缓存污染；③ **首请求填充**：组内第一个请求要全量 prefill，之后才命中——N 要够大才能摊薄；④ **缓存存活性**：块池紧张时被抢占/复用会破坏命中（看到 preempt 就减小 N）；⑤ **指标**：吞吐之外最好统计 prefill 实算 token 数（trace step 累加），它比端到端时间更能隔离缓存效应。

**Q：为什么 CUDA graph 对小 batch decode 提升最大？什么时候反而没用？**
> decode 每步 kernel 数量与 batch 无关、CPU 发射开销近似常数；batch 小 → 单 kernel 计算时间短 → 发射开销占比高 → graph（一次发射整图）收益大。batch 大时计算时间摊薄发射开销，收益趋近于零；prefill（形状不固定）和 >512 的 batch 在 nano 里直接走 eager。结论：**graph 是典型的"CPU-bound 补偿"优化，收益与计算强度成反比**——评估它必须扫 batch 维度。

**Q：TP=2 能让推理快 2 倍吗？算一笔账。**
> 不能。算力 ÷2 的同时新增每 forward 约 58 次集合通信（28 层×2 + embedding + lm_head），通信量与 token 数成正比。小模型（0.6B）单卡算力本来就吃不满，通信开销占比高，TP=2 常常不升反降；TP 的真正动机在**大模型放不进单卡显存**（权重+KV ÷N）。TP 带来的另一个隐藏收益：KV 头减半 → 每 token KV 显存 ÷N → 并发容量翻倍。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| Column/Row 配对 | 列切零通信、行切一次归约、配对让中间激活从不聚合——每层恰好 2 次 all-reduce |
| QKV 融合布局 | 每 rank `[q_r \| k_r \| v_r]` 三段；weight_loader 按 shard_id 算偏移 + chunk 取份 |
| 词表并行 | embedding：mask+all_reduce；lm_head：gather 到 rank 0（采样只在 rank 0） |
| TP 账单 | 显存/算力 ÷N；每 forward ≈ 58 次集合通信；KV 头数是 TP 度的紧约束 |
| 实验 1 | 共享对齐前缀：prefill 实算 16896 → ~1024 tok；错位 8 token 即损失可见（块粒度） |
| 实验 2 | graph 收益与 batch 成反比：8 seq 大提升、256 seq 几乎抹平 |
| 实验 3 | 双卡冒烟：两进程各半权重半 KV；端口 2333 写死的工程坑 |

**自测清单**（能答出才算过关）：

- [ ] 默画一个 decoder layer 的 TP 通信点图（2 个 all-reduce 的位置）
- [ ] 解释 bias 的 rank-0 特判与"加性项×集合通信"的通用性
- [ ] 手推 QKV 在 rank r 的三段偏移（q 在 0、k、v）
- [ ] 说出实验 1 里 C 组每请求多算多少 token、为什么
- [ ] 解释实验 2 为什么必须扫 batch 维度
- [ ] 三组实验表已填完（配置/数据/一句话结论）

**📦 今日产出**：三组 A/B 实验表 + TP 通信点图 + 实验日志（含异常情况记录）。

---

> 📌 **明日预告**：Day 7 收官——拿着这一周建立的心智模型进 [vLLM 主仓库](https://github.com/vllm-project/vllm)：按模块对照表走读 V1 引擎（llm_engine / scheduler / kv_cache_manager / gpu_model_runner），核对 Day 1 的预测清单，列出"nano 删掉的生产级能力"地图，跑一次 nano vs vLLM 的同机对比（可选），定稿全部笔记与面试问答。
