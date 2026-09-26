---
id: "learn:topic:nano-vllm:d2"
type: learn
title: "Day 2：引擎主线——generate() 的一生"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, engine-loop, sequence]
updated: 2026-09-25
day: 2
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 2：引擎主线——`generate()` 的一生

## 🎯 目标

通过今天的学习，你将：

1. 读完引擎主线全部四个文件：`llm.py`（4 行）→ `config.py` → `sequence.py` → `engine/llm_engine.py`——今天过后，"一次 `generate()` 经过了哪些代码"你能在纸上默写
2. 掌握 `step()` 的**三段式结构**（schedule → execute → postprocess）——这是所有推理引擎的主循环模板，vLLM 完全同构
3. 理解 `Sequence` 的字段设计：`block_table` / `num_cached_tokens` / `num_scheduled_tokens` 三个数字如何驱动调度与 KV 管理
4. 弄清 Config 每个参数**影响哪一层**，以及两个静默行为（参数被过滤、max_model_len 被 clamp）背后的设计
5. 用 trace 脚本亲眼看到 prefill/decode 交替，并"预告"chunked prefill（Day 4 的主角）
6. 产出本周骨架图：**`generate()` 的完整调用链时序图**

> 💡 **前置知识**：[Day 1](day1.md) 的代码地图与主线预览；[Week 6 Continuous Batching](../../daily/week6/day2/README.md) 的概念版（waiting/running 队列）
> ⚠️ **环境要求**：同 Day 1；今天的 trace 实验需要能跑通的 nano-vllm 环境

---

## 为什么第二天就读引擎主线

昨天建立了地图，今天走主干道。理由很直接：**`llm_engine.py` 是唯一被所有其他模块"认识"的文件**——Scheduler、ModelRunner 都是被它调用的。先读它，后面四天读任何模块时都知道"谁在调用它、为什么调用它"：

| 今天读的文件 | 行数级 | 在主线中的角色 |
|--------------|--------|----------------|
| `llm.py` | 4 | 门面：API 兼容层 |
| `config.py` | ~30 | 参数容器：所有模块共享的唯一配置对象 |
| `sequence.py` | ~90 | 数据结构：请求在引擎内的化身 |
| `engine/llm_engine.py` | ~120 | 主循环：把各模块串成引擎 |

> 💡 **一句话总结**：今天读完，nano-vllm 的"骨架"就立起来了——Day 3-5 都是往这副骨架的三个环节（schedule / execute / postprocess）里填细节。

---

## 核心概念

### 2.1 门面层：只有 4 行的 `llm.py`

```python
# nanovllm/llm.py —— 完整内容
from nanovllm.engine.llm_engine import LLMEngine

class LLM(LLMEngine):
    pass
```

`LLM` 直接**继承** `LLMEngine`。对比 vLLM：`vllm/entrypoints/llm.py` 的 `LLM` 是**包装**（持有 `LLMEngine` 实例，方法委托调用）。差异不是风格偏好，而是需求驱动：

| 设计 | nano-vllm（继承） | vLLM（包装） |
|------|-------------------|--------------|
| 需要支撑的入口 | 只有同步离线 `generate()` | 离线 `LLM` + 在线 `AsyncLLMEngine` + 流式 + server |
| 引擎实例数 | 一个进程一个 | 同步/异步引擎类不同，入口层要适配两者 |
| 额外职责 | 无 | 进度条、输出顺序、异常屏蔽……包装层可加逻辑 |

> 💡 **面试考点**：当只有一个使用场景时，继承是最省代码的方案；一旦出现"同一引擎、多种入口"（vLLM 的同步/异步/服务化），就必须换成包装/组合——**需求决定架构，不是设计模式决定架构**。

### 2.2 Config：一个 dataclass 打天下

```python
# nanovllm/config.py —— 核心内容（节选）
@dataclass(slots=True)
class Config:
    model: str
    max_num_batched_tokens: int = 16384
    max_num_seqs: int = 512
    max_model_len: int = 4096
    gpu_memory_utilization: float = 0.9
    tensor_parallel_size: int = 1
    enforce_eager: bool = False
    hf_config: AutoConfig | None = None
    eos: int = -1
    kvcache_block_size: int = 256
    num_kvcache_blocks: int = -1

    def __post_init__(self):
        assert os.path.isdir(self.model)                    # ① 必须本地路径
        assert self.kvcache_block_size % 256 == 0           # ② 对齐 flash-attn page size
        assert 1 <= self.tensor_parallel_size <= 8
        self.hf_config = AutoConfig.from_pretrained(self.model)
        self.max_model_len = min(self.max_model_len, self.hf_config.max_position_embeddings)  # ③ 静默 clamp
```

**参数 → 影响层** 映射表（今天先记映射，机制后三天展开）：

| 参数 | 默认值 | 影响哪一层 | 一句话作用 |
|------|--------|-----------|-----------|
| `max_num_batched_tokens` | 16384 | Scheduler（prefill） | 单个 prefill step 的 **token 预算**：一次前向最多算多少 token |
| `max_num_seqs` | 512 | Scheduler | 并发**序列数**上限：waiting→running 最多放多少条 |
| `max_model_len` | 4096 | Scheduler / 接口层 | 单请求 token 总长上限 |
| `gpu_memory_utilization` | 0.9 | ModelRunner | 显存占用比例 → 决定 KV Cache 池大小 |
| `num_kvcache_blocks` | -1 | BlockManager | 物理块数量（-1 = 加载权重后按剩余显存**自动推算**，Day 5） |
| `kvcache_block_size` | 256 | BlockManager / flash-attn | 每块装多少 token 的 KV |
| `enforce_eager` | False | ModelRunner | 是否关闭 CUDA graph |
| `tensor_parallel_size` | 1 | ModelRunner / layers | TP 进程数 |
| `eos` | -1 | Scheduler | 结束符 id（引擎启动时从 tokenizer 回填） |

三个值得注意的设计：

1. **kwargs 静默过滤**：`LLMEngine.__init__` 用 `dataclasses.fields(Config)` 过滤 kwargs——**拼错参数名不会报错，只是被丢弃**。好处是接口层可以无脑透传；坏处见"常见陷阱"
2. **`kvcache_block_size % 256 == 0`**：块大小被钉死为 256 的倍数，对齐 flash-attn 的 page size 约束（Day 5 读 attention 层时会再遇到它）
3. **静默 clamp**：`max_model_len` 大于模型上限时不报错、取 min——工程上"宽容"和"严格"的取舍，vLLM 同参数超限会直接报错

### 2.3 Sequence：请求在引擎内的化身

```python
# nanovllm/engine/sequence.py —— 核心内容（节选）
class SequenceStatus(Enum):
    WAITING = auto()      # 等待首次 prefill（或被抢占后回到这里）
    RUNNING = auto()      # prefill 完成，正在 decode
    FINISHED = auto()     # 生成结束

class Sequence:
    block_size = 256                       # 类属性，引擎启动时被 Config 覆盖
    counter = count()                      # 全局自增 id 生成器

    def __init__(self, token_ids, sampling_params=SamplingParams()):
        self.seq_id = next(Sequence.counter)
        self.status = SequenceStatus.WAITING
        self.token_ids = copy(token_ids)
        self.last_token = token_ids[-1]
        self.num_tokens = len(token_ids)
        self.num_prompt_tokens = len(token_ids)
        self.num_cached_tokens = 0         # ★ 前缀缓存已命中的 token 数
        self.num_scheduled_tokens = 0      # ★ 本 step 被排进批的 token 数
        self.is_prefill = True
        self.block_table = []              # ★ 逻辑块→物理块的映射表
        ...
```

**状态机只有三态**（WAITING → RUNNING → FINISHED），对比 vLLM 的 `SequenceStatus` 有 8+ 态（含 SWAPPED 等待换入换出）——nano 的抢占直接回到 WAITING 重算，省掉了整个 swap 支线（Day 4 展开）。

**三个数字字段是调度系统的"通用语言"**，读懂它们今天就没白过：

| 字段 | 语义 | 谁写它 | 谁读它 |
|------|------|--------|--------|
| `num_cached_tokens` | 前缀缓存已覆盖的 token 数 | BlockManager（命中时）/ Scheduler（postprocess 回填） | Scheduler（算本步要算多少新 token） |
| `num_scheduled_tokens` | 本 step 排进批的 token 数 | Scheduler.schedule() | ModelRunner（组输入张量）/ postprocess（回填） |
| `block_table` | 逻辑块 → 物理块号列表 | BlockManager | ModelRunner（生成 block_table/slot_mapping 张量） |

三者的时序配合（预览，Day 3/4 展开）：

```text
新请求:  num_cached_tokens=0, block_table=[]
Day3:    BlockManager.allocate() → 命中前缀缓存 n 块
           → num_cached_tokens = n×256, block_table=[...复用块+新块]
Day4:    Scheduler.schedule() → num_scheduled_tokens = num_tokens - num_cached_tokens
Day5:    ModelRunner 按 block_table 构造张量 → 前向
Day4:    postprocess() → num_cached_tokens += num_scheduled_tokens（回填）
```

**一个隐藏的宝藏：`__getstate__` 的 pickle 优化**

```python
def __getstate__(self):
    last_state = self.last_token if not self.is_prefill else self.token_ids
    return (self.num_tokens, ..., self.block_table, last_state)
```

为什么会有这段代码？因为 **TP 模式下 `step()` 要把序列对象发给其他 rank 的进程**（`model_runner.call("run", seqs, ...)` 跨进程传递）：

- **prefill**：需要完整 `token_ids`（要为每个 token 计算 KV）
- **decode**：只需要 `last_token`——上一步刚生成的那个 token 就是本次前向的全部输入

所以序列化时 decode 只传一个 int，省掉整个 token 列表的 IPC 带宽。**小优化，大视野**：推理引擎的性能意识渗透到每个字节。

### 2.4 LLMEngine：主循环的三个环节

#### `__init__`：启动与 TP 多进程

```python
# 节选
ctx = mp.get_context("spawn")
for i in range(1, config.tensor_parallel_size):
    event = ctx.Event()
    process = ctx.Process(target=ModelRunner, args=(config, i, event))
    process.start()
self.model_runner = ModelRunner(config, 0, self.events)   # rank 0 留在本进程
self.tokenizer = AutoTokenizer.from_pretrained(config.model, use_fast=True)
config.eos = self.tokenizer.eos_token_id
self.scheduler = Scheduler(config)
atexit.register(self.exit)
```

- TP 的实现是**每 rank 一个独立进程**（rank 0 在主进程内，其余 spawn），`mp.Event` 做启动同步，`atexit` 保证退出时回收
- 注意初始化顺序：先 ModelRunner（算出 KV Cache 池），再 Scheduler（拿着 `num_kvcache_blocks` 建块管理器）——**依赖关系决定了初始化顺序**

#### `add_request`：从文本到 Sequence

```python
def add_request(self, prompt: str | list[int], sampling_params):
    if isinstance(prompt, str):
        prompt = self.tokenizer.encode(prompt)
    seq = Sequence(prompt, sampling_params)
    self.scheduler.add(seq)
```

三行：编码（str 才编，token id 列表直通）→ 构造 Sequence → 进 waiting 队列。**nano 没有 processor 抽象**，vLLM V1 专门有 `processor.py` 做输入校验、chat template、多模态预处理——又是"单场景 vs 多场景"的取舍。

#### `step()`：三段式主循环（今天最重要的一段代码）

```python
def step(self):
    seqs, is_prefill = self.scheduler.schedule()            # ① 调度
    num_tokens = sum(seq.num_scheduled_tokens for seq in seqs) if is_prefill else -len(seqs)
    token_ids = self.model_runner.call("run", seqs, is_prefill)   # ② 执行
    self.scheduler.postprocess(seqs, token_ids, is_prefill) # ③ 后处理
    outputs = [(seq.seq_id, seq.completion_token_ids) for seq in seqs if seq.is_finished]
    return outputs, num_tokens
```

- **① schedule**：决定这个 step 跑谁、跑多少 token（Day 4）
- **② execute**：`model_runner.call("run", ...)` 是 RPC 风格接口——rank 0 直接调用、其他 rank 走进程通信，统一写法（Day 5）
- **③ postprocess**：登记哈希、回填计数、判停、释放块（Day 4）
- **`num_tokens` 的正负号技巧**：prefill 返回正的 token 数，decode 返回负的序列数——一个 int 同时编码了"阶段"和"数量"，`generate()` 用它分别计算 Prefill/Decode 吞吐显示在进度条上

#### `generate()`：批量提交 + 轮询收割

```python
# 节选（去掉进度条代码）
def generate(self, prompts, sampling_params, use_tqdm=True):
    if not isinstance(sampling_params, list):
        sampling_params = [sampling_params] * len(prompts)
    for prompt, sp in zip(prompts, sampling_params):
        self.add_request(prompt, sp)
    outputs = {}
    while not self.is_finished():
        output, num_tokens = self.step()
        for seq_id, token_ids in output:
            outputs[seq_id] = token_ids
    outputs = [outputs[seq_id] for seq_id in sorted(outputs.keys())]   # ★ 恢复输入顺序
    return [{"text": self.tokenizer.decode(ids), "token_ids": ids} for ids in outputs]
```

四个细节：

1. **一次性提交全部请求**，然后 `while not is_finished(): step()`——请求不会中途加入，但 continuous batching 依然关键：**各请求完成时刻参差**，每个 step 都有完成的退出、腾出的算力给没完成的
2. **只有 FINISHED 的序列才进 outputs**——没有流式输出（对比 vLLM 的 `stream=True`，那是 server + 异步引擎才有的能力）
3. **输出顺序恢复**：`sorted(outputs.keys())` 按 `seq_id` 排序。`seq_id` 来自 `itertools.count()`，按 `add_request` 的插入顺序自增——所以排序后正好回到输入顺序。**用"时间戳式的单调 id"恢复顺序**是个值得记下的模式
4. 解码 `token_ids → text` 发生在**全部生成结束后**，不在循环内——流式场景这里必须改成增量解码

### 2.5 SamplingParams：极简到只剩 3 个参数

```python
@dataclass(slots=True)
class SamplingParams:
    temperature: float = 1.0
    max_tokens: int = 64
    ignore_eos: bool = False

    def __post_init__(self):
        assert self.temperature > 1e-10, "greedy sampling is not permitted"
```

对比 vLLM 的 `SamplingParams`：30+ 个字段（`top_p` / `top_k` / `n` / `stop` / 各类 penalty / `logprobs`……）。两个信息：

- **删减幅度之大**本身就是教学信息：vLLM 的采样层一半代码在处理边界（数组参数、长度校验、序列化）
- **greedy（temperature=0）被显式禁止**：因为 sampler 走的是 `softmax + multinomial` 一条路，不支持 argmax 分支（Day 5 读 `layers/sampler.py` 时验证）。想输出确定结果？`temperature=0.0001` 也行——但这与数学上的 greedy 并不等价

---

## 动手实践

### 任务 A：按顺序精读四个文件（60 分钟）

推荐顺序与自问清单（每读完一个文件，合上屏幕回答）：

| 顺序 | 文件 | 自问清单 |
|------|------|----------|
| 1 | `llm.py` | 为什么继承而非包装？（见 2.1） |
| 2 | `config.py` | 每个参数影响哪一层？`eos` 和 `num_kvcache_blocks` 为什么默认值是"无效值"？ |
| 3 | `sequence.py` | 三个数字字段的语义？`__len__` / `block(i)` / `num_blocks` 分别服务谁？ |
| 4 | `engine/llm_engine.py` | step() 三段式各做什么？generate() 如何恢复输出顺序？ |

> 💡 **读码技巧**：`llm_engine.py` 里的 tqdm 进度条代码（set_postfix 等）可以跳过——先抓主循环骨架，装饰性代码后看。

### 任务 B：trace 实验——亲眼看 prefill/decode 交替（40 分钟）

```python
# trace_step.py —— 逐 step 观察调度决策与状态流转
# 运行: python3 trace_step.py
from nanovllm import LLM, SamplingParams

MODEL = "/root/huggingface/Qwen3-0.6B"   # 改成你的本地路径

llm = LLM(MODEL, enforce_eager=True)
orig_step = llm.step

def traced_step():
    outputs, num_tokens = orig_step()
    tag = f"PREFILL {num_tokens:>4d} tok" if num_tokens > 0 else f"DECODE  {-num_tokens:>3d} seq"
    waiting = [s.seq_id for s in llm.scheduler.waiting]
    running = [s.seq_id for s in llm.scheduler.running]
    print(f"step | {tag} | waiting={waiting} running={running} | finished={[sid for sid, _ in outputs]}")
    return outputs, num_tokens

llm.step = traced_step          # 实例属性遮蔽方法，无侵入

for p in ["Hello, nano-vllm.", "The capital of France is", "Write a haiku about GPU:"]:
    llm.add_request(p, SamplingParams(temperature=0.6, max_tokens=6))

while not llm.is_finished():
    llm.step()
```

```text
# 预期输出形态（token 数因 tokenizer 而异）
step | PREFILL   19 tok | waiting=[] running=[0, 1, 2] | finished=[]
step | DECODE    3 seq | waiting=[] running=[0, 1, 2] | finished=[]
step | DECODE    3 seq | waiting=[] running=[0, 1, 2] | finished=[]
step | DECODE    2 seq | waiting=[] running=[0, 2] | finished=[1]     ← seq 1 触发 EOS
...
step | DECODE    1 seq | waiting=[] running=[2] | finished=[0, 2]
```

**观察点**：

1. 第一个 step 是 **PREFILL**：3 条请求的 prompt（共 ~19 token）被拼成**一个 batch 一次算完**——这就是 prefill 的并行性
2. 之后每步 DECODE：每序列 +1 token。`running` 列表随完成逐渐缩短——**continuous batching 在"完成"维度生效**
3. finished 的时刻参差（有请求提前触发 EOS）——如果这是静态 batching，短请求的槽位会空转到最长的结束

### 任务 C：把 chunked prefill"逼"出来（15 分钟）

用 token id 直传 + 极小 token 预算，让 Day 4 的主角提前登场：

```python
# 在 trace_step.py 基础上改两处：
llm = LLM(MODEL, enforce_eager=True, max_num_batched_tokens=8)   # ① 预算砍到 8
llm.add_request(list(range(1000, 1020)), SamplingParams(temperature=0.6, max_tokens=4))  # ② 20-token 的"长" prompt
```

```text
step | PREFILL    8 tok | waiting=[0] running=[] | finished=[]    ← 只装得下 8 个，prompt 被切块
step | PREFILL    8 tok | waiting=[0] running=[] | finished=[]    ← 继续装下一块
step | PREFILL    4 tok | waiting=[] running=[0] | finished=[]    ← 尾块凑齐，转入 RUNNING
step | DECODE    1 seq | ...
```

20 个 token 的 prompt 被切成 8+8+4 三次前向。**现在只观察现象**——为什么要切？切了有什么代价和收益？调度器怎么知道切到哪？这些是 Day 4 的核心问题，今天留个钩子。

### 任务 D：画时序图 + 更新代码地图（35 分钟）

不看本文，画出从 `LLM.generate()` 到返回的全链路时序图，覆盖以下节点（画不出就回到 2.4 再读一遍）：

```text
LLM.generate(prompts)
 ├─ add_request × N        tokenizer.encode → Sequence → scheduler.add
 └─ while not finished:
     step()
      ├─ scheduler.schedule()          → (seqs, is_prefill)
      ├─ model_runner.call("run")      → token_ids（TP 广播给各 rank）
      ├─ scheduler.postprocess()       → 哈希登记/回填/判停/释放
      └─ 收割 finished 序列
 └─ sorted(seq_id) 恢复顺序 → tokenizer.decode
```

然后更新 Day 1 的代码地图表：给今天读过的四个文件填上"一句话职责"。

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| kwargs 拼错不报错 | `LLM(path, enforce_eager=True)` 写成 `enfore_eager`，参数被静默丢弃，行为"莫名"不对 | 记住 nano 会过滤未知 kwargs；调试时先 `print(config)` 确认参数真的生效 |
| `temperature=0` 直接崩溃 | `AssertionError: greedy sampling is not permitted` | 要确定性输出就用极小温度（如 1e-6）；或改 `layers/sampler.py` 加 argmax 分支（很好的第一个 PR 练手） |
| `max_model_len` 设超模型上限 | 没报错但"没生效" | nano 静默 clamp 到 `max_position_embeddings`；vLLM 是报错——知道这个差异 |
| trace 脚本双重调度 | 自己先调 `scheduler.schedule()` 再调 `step()`，同一 step 被调度两次 | 用本文的"实例属性遮蔽 `llm.step`"方案，或只调一次 `schedule` 并手工执行后续两段 |
| 以为 generate 是逐条处理 | 改造代码时逐条调用 `generate([p])` | 全部请求一次性传入，让 prefill 拼批、decode 并批——单条调用吞吐跌一个量级 |

---

## 面试要点

**Q：nano-vllm 的 `LLM` 直接继承 `LLMEngine`，vLLM 却用包装模式，为什么？**
> 需求决定。nano 只有同步离线推理一个场景，继承 4 行搞定，无任何适配成本；vLLM 要同时支撑离线 `LLM`、异步 `AsyncLLMEngine`、OpenAI server 三类入口，引擎本体与入口形态解耦后，包装层各自处理进度条、流式、异常屏蔽。当"一个引擎多种入口"出现时，组合/包装优于继承——这是接口隔离的最小案例。

**Q：描述推理引擎主循环的通用结构。**
> 三段式：**调度**（决定本 step 跑哪些序列、算多少 token）→ **执行**（构造输入张量、前向、采样）→ **后处理**（更新序列状态、登记缓存哈希、判停、释放资源）。nano 的 `step()`、vLLM 的 `EngineCore`、SGLang 的事件循环全都是这个骨架。变化只在每段的复杂度：调度段（抢占/混批/优先级）和执行段（overlap/异步拷贝）是各引擎拉开差距的地方。

**Q：Sequence 的 `__getstate__` 里 prefill 传完整 token 列表、decode 只传 `last_token`，为什么能这么省？**
> 这是 TP 场景的 IPC 带宽优化：`step()` 需要把序列对象发给每个 rank 的 ModelRunner 进程。prefill 要为 prompt 的**每个 token** 算 KV，必须全量；decode 每步的输入只有上一步刚生成的 1 个 token（KV 已在 cache 里），传 `last_token` 一个 int 就够。长上下文下 token 列表可能上千个 int，这个优化把 decode 的 IPC 负载降到常数——体现"推理引擎对每个字节的性能意识"。

**Q：批量 `generate()` 的输出顺序是怎么保证与输入一致的？**
> `add_request` 按输入顺序构造 Sequence，`seq_id` 由 `itertools.count()` 单调自增；收集时用 dict 按 `seq_id` 索引（完成顺序任意），最后 `sorted(keys())` 恢复输入顺序。关键洞察：**完成顺序 ≠ 提交顺序**（continuous batching 各序列完成时刻参差），需要显式的顺序恢复机制——vLLM 用同样的思路（RequestOutput 关联回 request_id）。

**Q：`max_num_batched_tokens` 和 `max_num_seqs` 各限制什么？为什么需要两个上限？**
> 前者是 **prefill 的 token 预算**（一次前向最多算多少 token，防长 prompt 把 step 撑爆、控制单步延迟），后者是**并发序列数上限**（防调度/显存管理开销失控，也是 KV 显存的天花板之一）。两个维度正交：1 条 16K token 的 prompt 和 512 条 32 token 的 prompt，token 预算同样紧张、序列复杂度天差地别。prefill 是 compute-bound 用 token 数约束、decode 是 memory-bound 用序列数约束——**用哪种单位设上限，取决于哪一维先成为瓶颈**。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| 门面层 | `LLM` 继承 `LLMEngine`（单场景）；vLLM 包装（多入口）——需求决定架构 |
| Config | 10 个参数一张"影响层"映射表；kwargs 静默过滤、max_model_len 静默 clamp 两个坑 |
| Sequence | 三态状态机；`num_cached_tokens` / `num_scheduled_tokens` / `block_table` 是调度系统的通用语言；decode 只 pickle `last_token` |
| step() 三段式 | schedule → execute → postprocess；`num_tokens` 正负号编码阶段与数量 |
| generate() | 批量提交 + 轮询收割；`sorted(seq_id)` 恢复顺序；无流式 |
| 实验体感 | trace 看到 prefill 拼批 / decode 并批 / 完成参差；`max_num_batched_tokens=8` 逼出 chunked prefill |

**自测清单**（能答出才算过关）：

- [ ] 合上屏幕默写 step() 三段式，说出每段返回/消费什么
- [ ] 说出三个数字字段（cached/scheduled/block_table）分别被谁写、谁读
- [ ] 解释 decode 为什么只需要传 `last_token` 给 TP worker
- [ ] 解释输出顺序恢复机制（为什么要恢复、怎么恢复）
- [ ] 说出 `max_num_batched_tokens` 与 `max_num_seqs` 的单位差异及原因
- [ ] trace 脚本两个实验的输出已截图/抄录进笔记

**📦 今日产出**：`generate()` 完整调用链时序图（本周骨架图）+ trace 实验记录 + 代码地图四个文件的职责回填。

---

> 📌 **明日预告**：Day 3 进入 nano-vllm 最精华的 150 行——`engine/block_manager.py`：物理块池与引用计数、**链式哈希前缀缓存**（为什么第 n 块的哈希隐含前 n 块全部信息、为什么只哈希满块、哈希碰撞怎么防），以及 `slot_mapping` 如何把"逻辑位置"翻译成"物理槽位"。这是理解 PagedAttention 的临门一脚。
