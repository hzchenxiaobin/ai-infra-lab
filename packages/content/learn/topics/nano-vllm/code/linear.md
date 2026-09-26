---
id: "learn:topic:nano-vllm:code-linear"
type: learn
title: "源码解读：linear.py——Tensor Parallelism 的线性层全家桶"
tags: [nano-vllm, vllm, tensor-parallelism]
knowledge_points: [nano-vllm, tensor-parallelism, megatron-lm, distributed-inference]
updated: 2026-09-26
topic: nano-vllm
related_problems: []
related_questions: []
---

# 源码解读：linear.py——Tensor Parallelism 的线性层全家桶

> 源文件：[linear.py](linear.py)（156 行，与 [nano-vllm](https://github.com/GeeeekExplorer/nano-vllm) `nanovllm/layers/linear.py` 完全一致）
> 前置阅读：[Day 6：Tensor Parallelism 与优化特性 A/B 实验](../day6.md) · [Day 5](../day5.md) 的 loader 策略模式 · [Day 2](../day2.md)（`code/sequence.py` 的解读日）

---

## 🎯 这份文档带你弄懂

1. **一个基类 + 五个派生类**的分工：为什么不直接用一个 `nn.Linear` 加个 `tp_size` 参数
2. **两种切法的数学**：列切（输出维）前向为什么零通信、行切（输入维）为什么必须 all-reduce
3. **weight_loader 挂载机制**：权重加载如何与模型结构解耦（策略模式的最小实现）
4. **Merged / QKV 融合层**的偏移计算：`shard_offset` / `shard_size` 的来源与 GQA 的整除约束
5. 三个高频面试细节：**bias 只在 rank 0 加**、**Column-Row 必须配对**、**TP 的通信账单**

---

## 1. 这个文件在 nano-vllm 里的位置

nano-vllm 的 `layers/` 目录是"带 TP 意识的算子积木箱"：attention、layernorm、rope、sampler 都在这里，而 `linear.py` 是其中**被 qwen3.py 引用最多**的一个——一个 decoder layer 里 4 个投影中的 3 种都出自它：

| Qwen3 中的模块 | 使用的类 | 切法 | 前向通信 |
|---|---|---|---|
| `qkv_proj` | `QKVParallelLinear` | 输出维（按头切） | 0 |
| `o_proj` | `RowParallelLinear` | 输入维 | 1 次 all-reduce |
| `gate_up_proj` | `MergedColumnParallelLinear` | 输出维（两段融合） | 0 |
| `down_proj` | `RowParallelLinear` | 输入维 | 1 次 all-reduce |

整个文件的类图与分工：

![linear.py 类图：一个基类加五个派生线性层](assets/linear_class_hierarchy.svg)

可以看出设计意图：**继承树上只分两支**——"怎么切权重"（Column / Row）决定构造函数和 weight_loader 的行为，"切完的权重里装了几段东西"（单段 / Merged 两段 / QKV 三段）只在子类里微调 weight_loader 的偏移计算。forward 则几乎不被重写。

---

## 2. 预备知识：$Y = XW^\top$ 的两种切法

PyTorch 的 `nn.Linear` 权重形状是 `[output_size, input_size]`，前向即 $Y_{[T,out]} = X_{[T,in]} \cdot W^\top_{[in,out]}$。TP 要把这个矩阵乘分到 N 张卡上，只有两个自然的切口：

| 切法 | 切的维度 | 每 rank 持有 | 前向结果 | 通信 |
|---|---|---|---|---|
| **列切（Column）** | 输出维（`W` 的行、`dim=0`） | $W_r$：全部输入 → 部分输出特征 | $Y_r$：输出的**列分片** | **0**（下游本来就按特征分片算） |
| **行切（Row）** | 输入维（`W` 的列、`dim=1`） | $W_r$：部分输入 → 全部输出特征 | $X_r W_r^\top$：输出的**部分和** | 1 次 all-reduce（求和） |

关键直觉：

- 列切时 $X$ 每个 rank 都完整，各算各的输出列，**天然不需要通信**；
- 行切时每 rank 只有 $X$ 的列分片（恰好由上游列切层产出），算出的是**部分和**，必须求和才得到完整 $Y$。

`tp_dim` 这个字段就是切法的编码：`0` = 沿 dim 0（输出维）切，`1` = 沿 dim 1（输入维）切，`None` = 不切。它**只在 weight_loader 里被用到**——这是本文件最容易被忽略的设计：**切分逻辑全部集中在权重加载阶段，forward 阶段几乎是普通 matmul**。

---

## 3. 逐段精读

### 3.1 `divide()`：整除约束的唯一出口（linear.py:7）

```python
def divide(numerator, denominator):
    assert numerator % denominator == 0
    return numerator // denominator
```

三行代码，但它是 **TP 可用性的守门员**：头数、KV 头数、中间维都必须被 `tp_size` 整除，否则这里直接 assert 失败（而不是静默算错）。后面所有"÷ tp_size"的地方都走它，报错时机统一在构造期。

### 3.2 `LinearBase`：把三件事钉在基类里（linear.py:12）

```python
class LinearBase(nn.Module):
    def __init__(self, input_size, output_size, bias=False, tp_dim=None):
        super().__init__()
        self.tp_dim = tp_dim
        self.tp_rank = dist.get_rank()
        self.tp_size = dist.get_world_size()
        self.weight = nn.Parameter(torch.empty(output_size, input_size))
        self.weight.weight_loader = self.weight_loader     # ★
        ...
```

四个值得停下来咀嚼的细节：

1. **`output_size` / `input_size` 已经是"本地尺寸"**。派生类在调 `super().__init__()` 之前就完成了 `divide()`——基类拿到的永远是切分后的大小，`self.weight` 从出生起就是分片形状，后面没有任何 reshape。
2. **`dist.get_rank()` 在构造期读取**。注意它的语义：如果进程组里除了 TP 还有其他并行（PP/DP），这里应该是 `tp_group` 内的 rank——nano-vllm 只支持 TP，所以直接用全局 rank，读码时要意识到这个简化。
3. **`self.weight.weight_loader = self.weight_loader`（linear.py:26）是全文最"Python"的一行**：把方法对象当作属性挂到 `nn.Parameter` 上。`nn.Parameter` 允许设置非 tensor 属性，于是**"这个参数该怎么从 checkpoint 装载"的知识被封装在参数自身**，权重加载器（`utils/loader.py`）只需 `getattr(param, "weight_loader")` 盲调用——一个最小化的策略模式。
4. **`forward` 直接 `raise NotImplementedError`**，且 `weight_loader` 在基类里没有定义（各派生类自己实现）。基类只管"公共状态"，不管行为。

### 3.3 `ReplicatedLinear`：对照组（linear.py:37）

不切分，`weight_loader` 就是整份 `copy_`，forward 就是 `F.linear`。Qwen3 没用到它，但它的存在让类谱系完整：**"不切"也是切法的一种**（`tp_dim=None`）。

### 3.4 `ColumnParallelLinear`：列切，前向零通信（linear.py:54）

```python
class ColumnParallelLinear(LinearBase):
    def __init__(self, input_size, output_size, bias=False):
        tp_size = dist.get_world_size()
        super().__init__(input_size, divide(output_size, tp_size), bias, 0)   # tp_dim=0

    def weight_loader(self, param, loaded_weight):
        param_data = param.data
        shard_size = param_data.size(self.tp_dim)          # 本地分片大小 = out/tp
        start_idx = self.tp_rank * shard_size              # 本 rank 负责的行区间
        loaded_weight = loaded_weight.narrow(self.tp_dim, start_idx, shard_size)
        param_data.copy_(loaded_weight)

    def forward(self, x):
        return F.linear(x, self.weight, self.bias)         # 普通 matmul，无通信
```

三段各自回答一个问题：

- **构造**：`divide(output_size, tp_size)` ——逻辑上的输出维被砍成 N 份；`tp_dim=0` 声明"加载时沿 dim 0 取片"。
- **weight_loader**：`narrow(dim, start, length)` 是无拷贝的视图操作——从完整的 checkpoint 权重里"切出"本 rank 的那一截再 `copy_` 进本地参数。`start_idx = tp_rank * shard_size` 说明**各 rank 拿的是连续且互不重叠的行段**。
- **forward**：与 `ReplicatedLinear` 一字不差！列切的全部代价都被吸收进了权重布局，**运行时它就是一个更小的普通 Linear**。

### 3.5 `RowParallelLinear`：行切 + all-reduce（linear.py:131）

```python
class RowParallelLinear(LinearBase):
    def __init__(self, input_size, output_size, bias=False):
        tp_size = dist.get_world_size()
        super().__init__(divide(input_size, tp_size), output_size, bias, 1)  # tp_dim=1

    def weight_loader(self, param, loaded_weight):
        param_data = param.data
        if param_data.ndim == 1:            # bias 是 1-D：整份复制，不切
            param_data.copy_(loaded_weight)
            return
        shard_size = param_data.size(self.tp_dim)
        start_idx = self.tp_rank * shard_size
        loaded_weight = loaded_weight.narrow(self.tp_dim, start_idx, shard_size)
        param_data.copy_(loaded_weight)

    def forward(self, x):
        y = F.linear(x, self.weight, self.bias if self.tp_rank == 0 else None)   # ★
        if self.tp_size > 1:
            dist.all_reduce(y)              # 部分和求和 → 完整输出
        return y
```

三个必考细节：

1. **bias 只在 rank 0 加**：`dist.all_reduce` 默认是 **SUM**。如果每个 rank 都在本地加一次 bias，归约后 bias 被加了 N 次。`self.bias if self.tp_rank == 0 else None` 一个三元表达式防住这个经典 bug——这也解释了 weight_loader 里 `ndim == 1` 的分支：bias 每个 rank 都要**完整**持有（因为只有 rank 0 用它，但其他 rank 的参数也得有值）。
2. **`tp_size > 1` 才 all_reduce**：单卡模式下这个类退化成普通 Linear，零开销——这让同一份代码能跑 TP=1 和 TP=N。
3. **输入分片从哪来**：Row 层假设上游已经把 $X$ 切好了。如果上游是普通层（完整 $X$），每 rank 会算出错误的部分和——所以 **Row 层几乎必须跟在 Column 层后面**。

### 3.6 Column-Row 配对：通信账单的来源

把 3.4 和 3.5 串起来看一个完整的 decoder layer。**Column 的输出分片恰好是 Row 需要的输入分片**，中间结果从不聚合，每个"投影对"只在 Row 出口付一次 all-reduce：

![Column-Row 配对：一个 Decoder Layer 的 TP 数据流](assets/linear_column_row_pairing.svg)

从这张图可以直接读出 TP 的账单：

| 维度 | TP=N 的效果 |
|---|---|
| 权重显存 | ÷ N（每 rank 只存分片） |
| KV Cache 显存 | ÷ N（KV 头也被切） |
| 计算量 | ÷ N |
| 通信 | **每层 forward 恰好 2 次 all-reduce**（o_proj + down_proj），外加 embedding 的 1 次 all-reduce 和 lm_head 的 1 次 gather |
| 约束 | 注意力头数 / KV 头数 / 词表 / 中间维都要被 N 整除 |

对比另外两种"不配对"的切法就能理解为什么 Megatron 这么设计：全 Column（输出要用时得 all-gather）、全 Row（输入得先切好再聚合）——**配对切分让通信次数最少**。

### 3.7 `MergedColumnParallelLinear`：gate/up 融合（linear.py:76）

Qwen3 的 MLP 里 `gate_proj` 和 `up_proj` 形状相同（都是 `[I, H]`）、下游总是一起被 `silu_and_mul` 消费。nano-vllm 把它们融合成一个 `[2I/N, H]` 的本地权重，**一次 matmul 出 `[T, 2I_r]`**，省一次 kernel launch 和一次激活读写：

```python
class MergedColumnParallelLinear(ColumnParallelLinear):
    def __init__(self, input_size, output_sizes, bias=False):
        self.output_sizes = output_sizes                        # 例如 [I, I]
        super().__init__(input_size, sum(output_sizes), bias)   # 逻辑输出 = 2I

    def weight_loader(self, param, loaded_weight, loaded_shard_id):   # id: 0=gate, 1=up
        shard_offset = sum(self.output_sizes[:loaded_shard_id]) // self.tp_size
        shard_size = self.output_sizes[loaded_shard_id] // self.tp_size
        param_data = param_data.narrow(self.tp_dim, shard_offset, shard_size)
        loaded_weight = loaded_weight.chunk(self.tp_size, self.tp_dim)[self.tp_rank]
        param_data.copy_(loaded_weight)
```

与 3.4 的差别全在 weight_loader，且多了一个参数 `loaded_shard_id`：

- checkpoint 里 gate / up 是**两个独立的 tensor**，加载时来一个就要写进融合权重的**对应槽位**；
- `shard_offset = 前面所有段的长度之和 ÷ tp_size`：id=0（gate）落在本地权重的 `[0, I/N)` 行，id=1（up）落在 `[I/N, 2I/N)` 行；
- 本地槽位用 `narrow` 定位，checkpoint 侧用 `chunk(tp_size)[tp_rank]` 取本 rank 的那一份——**两侧都是视图操作，只有最后的 `copy_` 发生数据搬运**。

### 3.8 `QKVParallelLinear`：三段布局 + GQA（linear.py:96）

最复杂的一类，但结构上是 Merged 的"三段特化版"，只是三段**长度不再相等**（GQA 下 KV 头比 Q 头少）：

```python
class QKVParallelLinear(ColumnParallelLinear):
    def __init__(self, hidden_size, head_size, total_num_heads, total_num_kv_heads=None, bias=False):
        total_num_kv_heads = total_num_kv_heads or total_num_heads     # 缺省 = MHA
        self.num_heads = divide(total_num_heads, tp_size)              # 本 rank Q 头数
        self.num_kv_heads = divide(total_num_kv_heads, tp_size)        # 本 rank KV 头数 ★GQA 约束
        output_size = (total_num_heads + 2 * total_num_kv_heads) * head_size
        super().__init__(hidden_size, output_size, bias)
```

weight_loader 按 `"q" / "k" / "v"` 三种 shard_id 计算各自的落点：

| shard_id | shard_size（本地段长） | shard_offset（本地段起点） |
|---|---|---|
| `"q"` | `num_heads * head_size` | `0` |
| `"k"` | `num_kv_heads * head_size` | `num_heads * head_size` |
| `"v"` | `num_kv_heads * head_size` | `(num_heads + num_kv_heads) * head_size` |

注意 offset 全部用**本 rank 的头数**计算（不是全局），因为融合权重的三段布局是 per-rank 的。数值例子（Qwen3 典型配置）：

![QKVParallelLinear 三段布局与 GQA 头切分](assets/linear_qkv_gqa_layout.svg)

前向之后，`qwen3.py:78` 用 `qkv.split([q_size, kv_size, kv_size], dim=-1)` 把三段切开——**融合层负责"装"，下游负责"拆"**，两头共享同一套尺寸约定。

GQA 的整除约束值得单独强调：`total_num_kv_heads=8, tp_size=2` 时每 rank 4 个 KV 头，每 4 个 Q 头共享的 1 组 KV 在 rank 内部保持完整——**分组从不跨 rank**。若 `tp_size=3`，`divide(8, 3)` 直接 assert 失败。这就是"Qwen3-4B（8 KV 头）最多 TP=8"这类结论的代码出处。

---

## 4. 权重加载全链路：weight_loader 被谁调用

linear.py 里只有 weight_loader 的**定义**，调用方在 `utils/loader.py`，两层配合完成"checkpoint 的分开存储 → 模型里的融合分片"：

```python
# utils/loader.py（节选）
def load_model(model, path):
    packed_modules_mapping = getattr(model, "packed_modules_mapping", {})
    for file in glob(os.path.join(path, "*.safetensors")):
        with safe_open(file, "pt", "cpu") as f:
            for weight_name in f.keys():
                for k in packed_modules_mapping:                 # "q_proj" / "gate_proj" / ...
                    if k in weight_name:
                        v, shard_id = packed_modules_mapping[k]  # ("qkv_proj", "q")
                        param_name = weight_name.replace(k, v)   # qkv_proj.weight
                        param = model.get_parameter(param_name)
                        weight_loader = getattr(param, "weight_loader")
                        weight_loader(param, f.get_tensor(weight_name), shard_id)
                        break
                else:
                    param = model.get_parameter(weight_name)
                    weight_loader = getattr(param, "weight_loader", default_weight_loader)
                    weight_loader(param, f.get_tensor(weight_name))
```

配合 `qwen3.py:187` 的映射表：

```python
packed_modules_mapping = {
    "q_proj": ("qkv_proj", "q"),   "k_proj": ("qkv_proj", "k"),   "v_proj": ("qkv_proj", "v"),
    "gate_proj": ("gate_up_proj", 0), "up_proj": ("gate_up_proj", 1),
}
```

整条数据流（以 gate_up_proj 为例）：

![weight_loader 从 checkpoint 分片到本地融合权重](assets/linear_weight_loader.svg)

这套设计的精妙之处在于**三层解耦**：

| 层 | 知道什么 | 不知道什么 |
|---|---|---|
| `loader.py` | 权重名怎么改写（packed_modules_mapping） | 权重该怎么切（委托给 param） |
| `linear.py` 的类 | 自己的切法与偏移 | checkpoint 里的文件布局 |
| `qwen3.py` 的映射表 | 哪些 checkpoint 名字对应融合模块的哪一段 | 切分数学 |

新增一个模型（如 LLaMA）只需提供自己的 `packed_modules_mapping`，所有 TP 线性层原样复用。

---

## 5. 设计亮点与取舍

**做对了的**：

1. **切分逻辑全部前置到加载期**——forward 路径干净到几乎看不出 TP 的存在（除 Row 的 all-reduce），对 CUDA graph 捕获友好（形状固定）。
2. **视图操作（narrow / chunk）+ 一次 copy_**——加载期没有多余的全量拷贝。
3. **策略模式挂在 Parameter 上**——加载器零分支，扩展新融合方式不动框架。

**简化掉的**（读码时应意识到的边界）：

1. `dist.get_rank()` 用的是**全局 rank**——若引入 PP/DP，需要改成 TP 进程组内的 rank；
2. weight_loader 是**阻塞式逐 tensor 加载**——vLLM 还处理量化、dtypes 转换、多文件并发，这里一概没有；
3. `ColumnParallelLinear.forward` 假设输入是**完整的** $X$——若上游是另一个 Row 层（输出刚好完整），恰好成立；但若上游是列切的非配对层，就需要额外的 gather，本文件不提供；
4. QKV 的融合假设三个 checkpoint 权重**同 dtype 同形状语义**——不做校验，错配会静默产出错误的模型。

---

## 6. 自测问题

读完本文件，你应该能不看代码回答：

1. `ColumnParallelLinear` 和 `RowParallelLinear` 的 `tp_dim` 分别是多少？这个字段在哪些方法里被使用？
2. 为什么 `RowParallelLinear.forward` 里 bias 只在 rank 0 加？如果每个 rank 都加，输出会错多少？（bias × tp_size）
3. `MergedColumnParallelLinear` 的 `shard_offset` 为什么等于"前面各段之和 ÷ tp_size"而不是"前面各段分片之和"？两者数值上相等吗？（相等，但语义前者是全局尺寸的计算，`// tp_size` 隐含整除约束）
4. Qwen3-4B 有 32 个 Q 头、8 个 KV 头，`tensor_parallel_size=4` 时每 rank 的 qkv_proj 输出维是多少？（(8 + 2×2) × 128 = 1536）
5. 一个 28 层的模型 TP=2 前向一次，`linear.py` 里的类总共触发多少次集合通信？（28 × 2 = 56 次 all-reduce；embedding/lm_head 的通信在 `embed_head.py`，不计入）
6. `param.weight_loader = self.weight_loader` 这行代码解决了什么问题？如果删掉它，`load_model` 会怎么失败？（getattr 找不到属性会走 default_weight_loader，整份拷贝进分片形状的参数 → 形状不匹配报错）

---

## 7. 延伸阅读

- [Day 6 教程](../day6.md)：TP 的 A/B 实验设计与通信账单
- [Day 5 教程](../day5.md)：loader / weight_loader 策略模式的首次登场
- `layers/embed_head.py`：同款 weight_loader 机制在词表并行上的应用
- Megatron-LM 论文 §3.3（*Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism*）：Column-Row 配对的原始出处
