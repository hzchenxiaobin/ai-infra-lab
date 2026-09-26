---
id: "learn:topic:nano-vllm:d7"
type: learn
title: "Day 7：迁移 vLLM 与复盘——从 1200 行到 40 万行"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, vllm, v1-engine]
updated: 2026-09-26
day: 7
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 7：迁移 vLLM 与复盘——从 1200 行到 40 万行

## 🎯 目标

通过今天的学习，你将：

1. 拿着本周建立的心智模型进 [vLLM 主仓库](https://github.com/vllm-project/vllm)，按**五站走读路线**读 V1 引擎对应模块，验证"同一个机制在工业实现里长什么样"——每一站都先回忆 nano 版本，再找 V1 的同与异
2. 吃透 V1 与 nano 的三大结构性差异：**进程分离**（AsyncLLM + EngineCore 经 ZMQ 通信）、**持久批**（InputBatch 预分配原地更新）、**混批调度**（chunked prefill 默认开 + prefill/decode 同批混跑）
3. 发现一个"不谋而合"：nano 的 recompute-only 抢占、链式哈希满块缓存，正是 vLLM V1 的方向——**极简直觉与工业演进殊途同归**
4. 核对 [Day 1](day1.md) 的预测清单，补全"nano 删掉的生产级能力"地图（API server / 异步引擎 / 量化 / 投机解码 / 多硬件后端……）——这是后续读 vLLM 的 TODO 列表
5. 可选：同机同模型对拍 nano bench.py vs vLLM，复现（或推翻）"追平"结论，学会推理引擎对拍的公平性纪律
6. 定稿全部笔记与面试问答集，通过结课自测：**不看资料画出引擎架构图、完整讲述一次 `generate()` 的生命周期**

> 💡 **前置知识**：Day 1-6 全部——今天是回收日，本周读过的每个文件都会在 vLLM 里找到对应物
> ⚠️ **环境要求**：任务 A/C 纯读码 + 纸面（无 GPU 也能完成）；任务 B 可选需单卡 GPU + `pip install vllm`；周日时间预算 5 小时

---

## 为什么最后一天才进 vLLM

直接读 vLLM 的失败率高不是因为它难，而是因为**没有参照系**：几十万行里分辨不出哪些是性能主干、哪些是工程化外壳。今天反过来——你已经读过主干（nano），现在只需问一个问题："vLLM 在我认识的每个模块上，多做对了什么？"

| 学习路径 | 问题 |
|----------|------|
| Day 1 直接进 vLLM | 在多层抽象里迷路，读三天放弃 |
| Day 1-6 读完 nano 再进 | 每个文件都有"脸熟"的对应物，走读变成验证假设 |
| 只读 nano 不迁移 | 心智模型停在玩具边界，不知道生产差距在哪 |

> 💡 **一句话总结**：今天的正确姿势不是"读 vLLM"，而是"**拿着对照表去 vLLM 里找证据**"——每找到一个同构点，理解加深一层；每找到一个差异点，就补上一块生产认知。

---

## 核心概念

### 7.1 迁移总则：同一颗心脏，两副骨架

先看两边的高层拓扑。nano 是单进程一条链：

```text
LLM.generate() ── LLMEngine.step() ──┬─ Scheduler.schedule()      # 决策
                                     ├─ ModelRunner.call("run")   # 执行（TP 时 SharedMemory RPC）
                                     └─ Scheduler.postprocess()   # 收尾
```

vLLM V1 是**多进程**拓扑（在线路径）：

```text
API 进程                                 EngineCore 进程                Worker 进程
┌─────────────────────────┐   ZMQ   ┌──────────────────────────┐  RPC  ┌───────────────────┐
│ AsyncLLM                │ ◄─────► │ LLMEngine                │ ◄───► │ GPUModelRunner    │
│  ├─ output_processor    │ msgpack │  ├─ Scheduler            │       │  ├─ InputBatch    │
│  │   （增量 detok /      │         │  │   （waiting/running） │       │  ├─ CUDA graph    │
│  │    stop string /     │         │  ├─ KVCacheManager       │       │  └─ Qwen3 前向    │
│  │    logprobs）        │         │  │   （BlockPool）        │       └───────────────────┘
│  └─ 每请求输出队列       │         │  └─ Executor（多卡 fanout）│
└─────────────────────────┘         └──────────────────────────┘
```

关键区别：**输出处理（detokenizer / stop string / logprobs）被搬到 API 进程**，EngineCore 进程里只剩"调度 + 执行"这条纯热路径。离线路径的 `vllm/entrypoints/llm.py` 直接实例化同一个 `LLMEngine` 类——和 nano 一样在单进程里跑 step 循环，说明"核心引擎"本身与进程拓扑解耦。

**最终对照表**（本周里程碑产出 ①，走读时逐行核实补充）：

| nano-vllm | vLLM (V1) | 同构点 | V1 多做了什么 |
|-----------|-----------|--------|---------------|
| `llm.py` | `vllm/entrypoints/llm.py` | generate 门面 | 进度条、多入口（LLM / AsyncLLM / OpenAI server） |
| `engine/llm_engine.py` | `vllm/v1/engine/llm_engine.py` + `core.py` | step 三段式 | EngineCore 进程封装、`update_from_output()` |
| `engine/sequence.py` | `vllm/v1/request.py` | 状态机 + block_table | logprobs / 结构化输出 / 多模态字段 |
| `engine/scheduler.py` | `vllm/v1/core/sched/scheduler.py` | 双队列 + token 预算 | 混批、优先级调度、结构化 SchedulerOutput |
| `engine/block_manager.py` | `vllm/v1/core/kv_cache_manager/` + `block_pool.py` | 满块链式哈希 + ref_cnt | 双层抽象、LRU 淘汰、copy-on-write |
| `engine/model_runner.py` | `vllm/v1/worker/gpu_model_runner.py` | 张量构造 + CUDA graph | InputBatch 持久批、异步调度重叠 |
| `utils/context.py` | `ForwardBatch` 显式传参 | 调度产物传给 kernel | 并发安全（[Day 5](day5.md) 5.2 的伏笔） |
| `layers/attention.py` | `vllm/v1/attention/backends/` | 写 KV + paged 读 KV | 多后端、平台适配、feature 矩阵 |
| `layers/linear.py` 等 | `vllm/model_executor/layers/` + `vllm/distributed/` | Column-Row 配对 | 量化 GEMM、fused MoE、多硬件通信后端 |
| `utils/loader.py` | `vllm/model_executor/model_loader/` | weight_loader 策略模式 | 量化/LoRA/多格式 checkpoint |
| `layers/sampler.py` | `vllm/v1/sample/sampler.py` | 向量化采样 | top-k/p/min-p、penalties、logprobs、种子 |

### 7.2 第一站 `vllm/v1/engine/`：进程分离与异步输出

nano 的 `LLMEngine.step()`（[Day 2](day2.md)）是同步三段式：调用方阻塞等这批 token。V1 把它拆成两半：

- **AsyncLLM**（`vllm/v1/engine/async_llm.py`）：跑在 API 进程的 asyncio 循环里，每个请求挂一个异步输出队列，token 一到就推给客户端——**流式输出在这里实现**，nano 完全没有的东西
- **EngineCore**（`vllm/v1/engine/core.py`）：独立进程，包着 `LLMEngine` 主循环，经 **ZMQ（msgpack 序列化）** 与 AsyncLLM 通信，消息主体是 `EngineCoreOutputs`（token ids + 完成状态，不是 logits）

**为什么要拆进程？** 三个 nano 用不着、生产必须的理由：

1. **GIL 隔离**：增量 detokenization、stop string 匹配、logprobs 后处理都是 CPU 密集的 Python 代码——放在引擎进程里会拖慢调度循环；拆出去后 EngineCore 的 step 节奏不受输出处理影响
2. **崩溃隔离**：API 层异常（畸形请求、客户端断连）不会带走引擎
3. **流式天然**：每请求独立输出队列 → 逐 token 推送 → AsyncLLM 的 `generate()` 是 async generator

> 💡 **对照回忆**：nano 的 `postprocess` 之后 token 直接躺在 Python 列表里等 `generate()` 收割；V1 里同样的 token 要经历 EngineCore → ZMQ → output_processor → 增量 detok → 客户端五站。**"多出来的每一站都是 nano 删掉的适用性"**——这句话今天会反复应验。

### 7.3 第二站 `vllm/v1/core/sched/scheduler.py`：混批、优先级，以及"删掉 swap"

先看同构——V1 的 `schedule()` 骨架与 [Day 4](day4.md) 逐行读过的 nano 版几乎可以重叠：

| 机制 | nano | V1 |
|------|------|----|
| 队列 | `waiting` / `running` 两个 deque | 同样的双队列 |
| token 预算 | `max_num_batched_tokens` | 同名参数，chunked prefill 依赖它 |
| chunked prefill | 只切第一个 seq 的一个 `if` | `token_ids_chunked` 字段支持任意断点续传 |
| 抢占 victim | running 队尾（sunk cost 最小） | 同样从尾部抢占 |
| 步进后处理 | `postprocess()` | `update_from_output()`——判停、释放、统计 |

再看三处关键差异：

1. **混批**：V1 默认开启 chunked prefill，且**同一个 step 里 prefill 与 decode 混编成一个批**（[Day 4](day4.md) 4.3 那张对比表的"工业版"）——decode 不再给 prefill 让路，在线 ITL 不抖。nano 的 prefill-first 不混批是 vLLM 早期策略，Sarathi-Serve 论文证明了混批的延迟收益
2. **抢占只剩 recompute**：V0 时代 vLLM 支持 swap（KV 搬 CPU）和 recompute 两种抢占；**V1 删掉了 swap，只留 recompute**。理由和 nano 的一样：swap 需要 CPU 侧缓存池 + H2D/D2H 拷贝 + 换入换出状态机，而前缀缓存让重算成本大幅下降——**nano 的极简选择与工业演进不谋而合，这是本周最值得记住的验证**
3. **优先级调度**：`--scheduling-policy priority` 支持请求级优先级；nano 只有 FIFO

还有一个语义差异值得核对（[Day 4](day4.md) 读码发现）：nano 的 `max_num_seqs` 只限**本步批大小**，V1 里它是 **running 集合的上限**——新请求最多补到这个数，语义更严格。

### 7.4 第三站 `vllm/v1/core/kv_cache_manager/`：双层抽象、LRU 淘汰与 CoW

V1 把 nano 的 150 行 `block_manager.py` 拆成三层：`KVCacheManager`（每请求视图）→ `KVCacheCoordinator`（普通组 + 前缀缓存组）→ `BlockPool` + `Block`（物理块账本）。**机制完全同构**：

- `KVCacheManager.get_computed_blocks(request)` ≈ nano 的 `can_allocate`：逐块算哈希查表，返回最长可复用前缀
- `Block.block_hash` 同样是**链式哈希**：`hash(parent_block_hash, token_ids)`——第 n 块的哈希隐含前缀全部信息，且**同样只哈希满块**
- `Block.ref_cnt` 同样支持共享计数；前缀缓存 **V1 默认开启**（V0 时代要显式 `--enable-prefix-caching`）——又一次与 nano 的"永远开"殊途同归

三处 nano 没有的东西：

1. **LRU 淘汰**：V1 的 BlockPool 维护专门的 cached 块队列，块池吃紧时按 LRU 驱逐缓存块；nano 的做法朴素得多——带哈希的块释放后留在 free 队列里"顺带"当缓存，被复用时删旧哈希（[Day 3](day3.md) 的 `_allocate_block` 细节）
2. **Copy-on-Write**：V1 的块被共享（`ref_cnt > 1`）且需要追加写入时，先复制再写。nano 为什么不需要？——nano 只做单路输出（n=1），且前缀缓存**只共享满块**（满块永不追加），不存在"共享 + 要写"的组合。V1 的并行采样（一个 prompt 多路输出）会共享**未满的 prompt 尾块**，各路都要往尾块写 token——CoW 必须有。这就是 [README](README.md) 面试题"ref_count 什么时候 > 1"的工业版答案
3. **块大小**：V1 常见默认 16 token/块（依 attention 后端可变），nano 固定 256——块越小尾部浪费越小、缓存命中粒度越细，代价是页表与哈希开销越大。这是分页系统的经典 tradeoff，两个引擎选了不同工作点

### 7.5 第四站 `vllm/v1/worker/gpu_model_runner.py`：持久批与 zero-overhead

nano 的 `run()`（[Day 5](day5.md) 5.1）每个 step 都从 Sequence 列表**重建**全套张量（prepare 系列）。V1 用 **InputBatch**（`gpu_input_batch.py`）做了激进的优化：

```text
nano：每 step                    V1：InputBatch 持久批
────────────────────             ─────────────────────────────
遍历 seqs 构造 input_ids        预分配 input_ids / positions /
构造 positions                   block_tables [max_reqs, max_blocks_per_req]
构造 slot_mapping                 请求加入 → 写入空槽位
构造 block_tables                 请求退出 → 原地标记回收
（Python 对象 + 张量分配          下一步复用同一块显存
 每步全量重跑）
```

**为什么这很重要**：decode 每 step 的 GPU 计算只有微秒级，Python 侧的组批开销（对象创建、张量分配、H2D 拷贝）成了 CPU 瓶颈——持久批把它从"每步全量"压成"增量更新"。这与 CUDA graph 解决 launch 开销（[Day 6](day6.md) 实验 2）是同一个故事的两半：**decode 的敌人是 CPU，不是 GPU**。

另外两处升级：

- **zero-overhead scheduler**：调度与 GPU 执行**重叠**——GPU 跑第 N 步前向时，另一个线程已经在算第 N+1 步的 `schedule()`。nano 的 schedule → execute 是严格串行的
- **CUDA graph 延伸到 prefill**：nano 只对 decode 捕获图（形状固定档位，[Day 5](day5.md) 5.7）；V1 新版本引入 piecewise CUDA graph（配合 torch.compile 把图切成多段），让变长的 prefill/mixed 批也能部分走图——关注这个方向的演进

### 7.6 第五站 `vllm/v1/attention/` 与算子生态：多后端

nano 的 `attention.py` 只有一条路径：flash-attn（varlen + kvcache 两个入口）。V1 把它抽成**后端接口**（`vllm/v1/attention/backends/`）：

- 后端家族：FlashAttention / FlashInfer / Triton / FlashMLA / 线性注意力…… 按**硬件平台 × 模型特性**自动选择（也可 `VLLM_ATTENTION_BACKEND` 手动指定）
- 每个后端都要实现同一套接口：构造 metadata、写 KV、prefill 注意力、decode 注意力——nano 的 `Attention.forward` 双分支（[Day 5](day5.md) 5.5）正是这个接口的最小实现
- 多后端存在的原因：不同硬件（CUDA/ROCm/NPU）有不同的最优 kernel、不同模型特性（sliding window、MLA、soft-capping）需要不同支持——**适配矩阵 = 代码量**，这就是 40 万行的主要来源之一

顺路看一眼 `vllm/model_executor/`：`models/` 下 100+ 种模型架构（nano 只有 qwen3.py），`layers/quantization/` 下 FP8/GPTQ/AWQ/MARLIN 等量化实现——**权重加载器**（`model_loader/`）要按 checkpoint 格式、量化方案、TP 布局排列组合，nano 的 `utils/loader.py` 只是它最简单的一个分支。

### 7.7 预测清单核对：nano 删掉的生产级能力地图

拿出 [Day 1](day1.md) 任务 D 的预测清单逐条核对。下面是标准答案表（**每行都是一个可深入的方向**）：

| 能力 | vLLM 位置 | 为什么生产必需 | nano 为什么可以不做 |
|------|-----------|----------------|---------------------|
| OpenAI 兼容 API server | `vllm/entrypoints/openai/` | 在线服务的接入标准 | 只做离线批推理 |
| 异步流式输出 | `vllm/v1/engine/async_llm.py` | 逐 token 推送，TTFT 后立即响应 | 同步 generate，一批算完才返回 |
| 增量 detokenizer + stop string | `vllm/v1/engine/detokenizer.py` | token 流 → 文本流；按字符串停 | 结束后一次性 decode |
| 结构化输出 | `vllm/v1/structured_output/` | JSON schema / 正则约束（grammar 位掩码） | 无约束解码需求 |
| 投机解码 | `vllm/v1/spec_decode/`（EAGLE / ngram / MTP） | decode memory-bound，一次验证多 token | 单路自回归 |
| 量化 | `model_executor/layers/quantization/` + FP8 KV | 显存减半、带宽减负——decode 的命脉 | 只支持 BF16 |
| LoRA 多租户 | `vllm/lora/` | 一底座多适配器 | 单模型单任务 |
| 多模型架构 | `model_executor/models/`（100+） | 生态必需 | 一个 qwen3.py 读完正好 |
| 多硬件平台 | `vllm/platform/` + 社区后端（ROCm / CPU / TPU / 昇腾 vllm-ascend） | 用户硬件五花八门 | 写死 NVIDIA + flash-attn |
| PD 分离 / 分布式 KV | `vllm/distributed/` + LMCache / Mooncake 生态 | 大规模部署的吞吐/延迟再平衡 | 单机单卡 |
| 可观测性 | metrics / request 日志 / health check | 线上运维 | print |

核对方法：预测到的画 ✓，没想到的标"意外"——**意外项就是你上周理解的盲区**，也是接下来读 vLLM 的优先级排序。

> 💡 **一句话总结**：这张表就是"1200 行 vs 40 万行"的完整账本——性能主干 1200 行足够，其余全是**适用性**。面试时能讲清"删掉的是适用性、保住的是性能"这句话的每一行证据，本专题就算毕业了。

---

## 动手实践

### 任务 A：五站走读（120 分钟）

clone 主仓库（只读不装也能走读）：

```bash
git clone --depth 1 https://github.com/vllm-project/vllm.git
cd vllm && ls vllm/v1/
```

按 7.2-7.6 的五站顺序走，每站带着自问清单（答不上就回对应 Day 复习）：

| 站 | 文件 | 自问清单 |
|----|------|----------|
| ① engine | `v1/engine/llm_engine.py`、`async_llm.py`、`output_processor.py` | step() 与 nano 三段式怎么对应？增量 detok 为什么必须在 API 进程？EngineCoreOutputs 里传的是什么（为什么不是 logits）？ |
| ② scheduler | `v1/core/sched/scheduler.py` | 找到混批的代码证据；找到 PREEMPTED 状态的赋值点，确认没有 swap 分支；`update_from_output` 对应 nano 的哪个方法？ |
| ③ kv_cache | `v1/core/kv_cache_manager.py`、`block_pool.py`、`block.py` | `get_computed_blocks` 与 `can_allocate` 逐行对照；Block 哈希怎么算、是否只哈希满块；找到 LRU 驱逐与 CoW 的代码 |
| ④ worker | `v1/worker/gpu_model_runner.py`、`gpu_input_batch.py` | InputBatch 的 block_tables 形状是多少；请求退出时哪些字段被原地回收；CUDAGraphRunner 的 capture sizes 怎么定 |
| ⑤ attention | `v1/attention/backends/flash_attn.py` | 它的 prefill/decode 两个方法与 nano `Attention.forward` 双分支怎么对应；后端接口定义了哪些必须实现的方法 |

> ⚠️ **纪律**：只走这五站主线，遇到岔路（量化、spec decode、多模态……）记进 7.7 的表格当 TODO，**不要跟进去**——那是下一个专题的事。

### 任务 B（可选）：同机对拍，复现"追平"（60 分钟）

官方基线（RTX 4070 Laptop）是 nano 1434 vs vLLM 1362 tok/s，但那是 vLLM 0.8.x 时代的数据。今天在你的机器上复现一遍——**关键是公平**：

```python
# bench_vllm.py —— 与 nano bench.py 同负载的 vLLM 版
import random, time
from vllm import LLM, SamplingParams

MODEL = "/root/huggingface/Qwen3-0.6B"     # 与 nano bench.py 同一个本地路径
random.seed(0)                              # ★ 与 nano bench.py 完全相同的生成逻辑
num_seqs = 256
prompt_token_ids = [[random.randint(0, 10000) for _ in range(random.randint(100, 1024))]
                    for _ in range(num_seqs)]
sampling_params = [SamplingParams(temperature=0.6, ignore_eos=True,
                                  max_tokens=random.randint(100, 1024))
                   for _ in range(num_seqs)]

llm = LLM(model=MODEL, max_model_len=4096, enforce_eager=False)   # 与 nano bench 同参
llm.generate([{"prompt_token_ids": prompt_token_ids[0]}],         # warmup（编译/图捕获）
             SamplingParams(max_tokens=1))
t = time.time()
outputs = llm.generate([{"prompt_token_ids": p} for p in prompt_token_ids],
                       sampling_params, use_tqdm=False)
dt = time.time() - t
total = sum(len(o.outputs[0].token_ids) for o in outputs)
print(f"Total: {total}tok, Time: {dt:.1f}s, Throughput: {total/dt:.2f} tok/s")
```

```bash
python3 bench_vllm.py        # vLLM 侧
cd nano-vllm && python3 bench.py   # nano 侧（Day 1 已记录，复跑一次确认环境一致）
```

**公平性检查清单**（任何一条没对齐，结论就不可信）：

| 检查项 | 要求 |
|--------|------|
| 负载 | 同 seed 同分布生成**完全相同**的 token id 列表与 max_tokens |
| 引擎参数 | `max_model_len` / CUDA graph 开关 / `max_num_seqs` / `max_num_batched_tokens` 两侧同值（后者从 [Day 2](day2.md) 的 Config 笔记抄 nano 的值） |
| 环境 | 同卡、同 torch/CUDA 版本、独占 GPU、先跑的进程已退出 |
| 口径 | 都含 warmup、都 `ignore_eos=True`、吞吐都按输出 token 数计 |

记录表（把实测填进去，并记录 vLLM 版本号）：

| 引擎 | 版本 | 吞吐 (tok/s) | 备注 |
|------|------|--------------|------|
| nano-vllm | — | | |
| vLLM | | | 新版 V1 有 piecewise graph 等改进，可能与官方旧数据不同——**这本身是有价值的观察** |

### 任务 C：结课自测与定稿（120 分钟）

1. **默画架构图**：不看任何资料，画 nano 引擎架构图（文件级），每个文件旁标注 vLLM 对应物——这是 [README](README.md) 的周日验收标准 ①
2. **口述生命周期**：对着空白文档完整讲述一次 `generate()` 的生命周期，必须覆盖两个分支：chunked prefill 被切时 token 被丢弃（[Day 4](day4.md) 4.3）、抢占后重调度时命中自己的旧缓存块（[Day 4](day4.md) 4.5）
3. **面试问答定稿**：把 Day 1-6 的 40+ 道面试题浓缩成 8 道"必答题"（一张表：方向 / 题目 / 出处 Day），答案能脱稿讲 90 秒
4. **更新 Day 1 的预测清单**：每条标注 ✓/意外，意外项排进后续学习队列

### 学习时间安排（共 5 小时，周日）

| 时长 | 内容 |
|---|---|
| 120 分钟 | 任务 A：五站走读（每站 ~25 分钟，含自问清单） |
| 60 分钟 | 任务 B：同机对拍（无 GPU 则改为精读 7.5 的 InputBatch 代码） |
| 120 分钟 | 任务 C：默画架构图 + 口述生命周期 + 问答定稿 |
| 20 分钟 | 填完对照表与能力地图，归档全部笔记 |

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| 从 V0 目录读起 | 读到 `vllm/engine/llm_engine.py`（legacy）误以为是 V1 | 只认 `vllm/v1/` 路径；V0 已淘汰，README/文档默认都是 V1 |
| 类名撞名 | V0 与 V1 都有 `LLMEngine`/`Scheduler` | 看包路径：`vllm/v1/...` 才是本周对照对象 |
| 版本差异导致迷路 | 本文描述的文件/方法在本地仓库找不到或已改名 | vLLM 迭代极快（月级重构），以机制对机制，不死记类名 |
| 对拍参数不对齐 | vLLM 默认 `max_num_batched_tokens`/`max_num_seqs` 与 nano 不同，差几倍吞吐 | 先抄齐参数再比；版本号写进记录表 |
| 用 serving 模式对拍离线 bench | `vllm serve` 起服务再压测，混入了网络与排队 | 离线对离线：vLLM `LLM` 类直跑，与 nano bench 同口径 |
| 走读时跟进岔路 | 顺着 spec decode / 量化读了一下午 | 岔路只记 TODO（7.7 的表），五站主线优先 |
| 硬背类名不记机制 | 面试时只会背 vLLM 文件名 | 机制同构才是重点：能讲"抢占为什么只剩 recompute"胜过背十个路径 |

---

## 面试要点

**Q：nano-vllm 与 vLLM V1 有哪些"不谋而合"？这说明了什么？**
> 三处：① 抢占都只做 recompute（V1 删掉了 V0 的 swap——CPU 侧缓存池 + 拷贝 + 状态机的维护成本高于收益，且前缀缓存让重算变便宜）；② 前缀缓存都是满块链式哈希，V1 默认开启；③ chunked prefill 都是 token 预算驱动的标配。说明这些取舍不是"简化版妥协"，而是被工业演进验证的**本质解**——极简实现的直觉与生产系统的收敛方向一致，这是读精简源码的最大价值。

**Q：vLLM V1 为什么要拆成 EngineCore 进程 + AsyncLLM？**
> 三个理由：① GIL 隔离——detokenization、stop string、logprobs 等输出处理是 CPU 密集的 Python 代码，搬出引擎进程才不拖慢调度热路径；② 崩溃隔离——API 层异常不带走引擎；③ 流式输出天然——每请求独立输出队列，AsyncLLM 直接做 async generator。代价是 ZMQ 序列化与进程间往返延迟——用"输出处理不阻塞调度"换来的净收益。nano 单进程同步全干，因为离线批处理里这些成本都不存在。

**Q：同样是链式哈希前缀缓存，V1 比 nano 多处理了什么？**
> ① LRU 淘汰：专门的 cached 块队列 + 驱逐策略（nano 靠 free 队列"顺带"缓存）；② copy-on-write：并行采样共享**未满的 prompt 尾块**且各路都要追加写，必须写时复制——nano 只做 n=1 且只共享满块（满块永不追加），天然不需要 CoW；③ 哈希要适配多场景（不同采样参数/LoRA 的前缀可能不可共享）。这组对比能讲清"共享计数 → 写冲突 → CoW"的完整因果链。

**Q：V1 的 InputBatch（持久批）解决了什么问题？为什么 nano 不需要？**
> decode 每 step 的 GPU 计算只有微秒级，瓶颈在 CPU 侧每步重建输入张量组（Python 对象 + 张量分配 + H2D）。InputBatch 预分配全部缓冲（含常驻显存的 block_tables），请求进出只做原地增量更新，把组批开销从"每步全量"压成"增量"。nano 每步 prepare 重建在小 batch 教学场景无所谓；这与 CUDA graph（消灭 launch 开销）是同一命题的两半——**decode 的敌人是 CPU，不是 GPU**。

**Q："nano-vllm 用 1200 行追平 vLLM"这个结论的边界在哪？**
> 官方 bench 的边界：单卡、离线批推理、0.6B 小模型、纯吞吐口径（无 TTFT/ITL SLO）、BF16、无投机解码。出了这个边界——在线服务（进程分离/流式/结构化输出）、大模型（量化/TP+PD 分离）、低延迟（spec decode/EAGLE）、多租户（LoRA）——vLLM 的几十万行工程化立刻变成数量级优势。正确的表述是：**单场景吞吐的核心算法很精巧（1200 行），跨场景的适用性很昂贵（40 万行）**。

**Q：读完 nano-vllm 之后，读任何新推理引擎的方法论是什么？**
> 四件套定位法：① 找 step 主循环（引擎心跳）；② 找调度决策（谁进批、谁被牺牲、预算怎么分）；③ 找 KV 管理（分页/缓存/共享策略）；④ 找 kernel 编排（谁写 KV、谁读 KV、图捕获边界）。这四样在 nano、vLLM、SGLang、TensorRT-LLM 里全部同构，差异只在每件的实现深度——先找骨架再填细节，就不会被任何仓库的体量吓退。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| 进程拓扑 | V1 = API 进程（AsyncLLM + 输出处理）+ EngineCore 进程（调度+执行）+ Worker 进程；输出处理搬到引擎外——GIL/崩溃/流式三重收益 |
| 五站对照 | engine / sched / kv_cache_manager / gpu_model_runner / attention——每个 nano 文件都在 V1 有同构物，差异集中在"混批、持久批、多后端、CoW/LRU" |
| 殊途同归 | recompute-only 抢占、满块链式哈希默认开、chunked prefill 常态化——极简直觉 = 工业演进方向 |
| 能力地图 | 11 项生产级能力对照表（API server/流式/量化/spec decode/多硬件…）——后续读 vLLM 的 TODO 列表 |
| 对拍纪律 | 同 seed 负载、同参数、同环境、warmup + ignore_eos、记录版本号 |
| 方法论 | 四件套定位法：主循环 → 调度 → KV 管理 → kernel 编排 |

**自测清单**（能答出才算结课）：

- [ ] 不看资料画出 nano 架构图，每个文件标注 vLLM 对应物（含机制一句话）
- [ ] 完整口述一次 `generate()` 生命周期，覆盖 chunked prefill 丢 token 与抢占后缓存自命中两个分支
- [ ] 说出 V1 删掉 swap 的原因，以及它与 nano 选择的一致性
- [ ] 解释 CoW 为什么 V1 必须有、nano 可以没有
- [ ] 说出 5 项 nano 没做、vLLM 必须做的能力及其在仓库中的位置
- [ ] 对照表与能力地图已填完；8 道必答题能脱稿讲 90 秒

**📦 今日产出**：nano ↔ vLLM 模块对照表（定稿）+ 五站走读笔记 + 生产级能力地图 + 8 道必答题 + （可选）同机对拍数据——对应 [README](README.md) 周日里程碑的全部三项。

---

## 后续路线

本周完成了"读懂骨架"，往下三条路线按目标选择：

| 路线 | 内容 | 入口 |
|------|------|------|
| **工程使用** | 部署、SLO 压测、容量规划、量化选型 | [vLLM 专题](../vllm/README.md)（Day 7 的压测方法论正好衔接） |
| **系统深入** | 按能力地图逐项补课：spec decode / 量化 / PD 分离（LMCache、Mooncake）；多硬件适配的真实样本——[昇腾 vllm-ascend](https://github.com/vllm-project/vllm-ascend) 如何在 V1 抽象下接入 NPU | `vllm/v1/spec_decode/`、`layers/quantization/`、[SGLang 专题](../sglang/README.md)（RadixAttention 对照） |
| **算子深入** | store_kvcache 之外的世界：PagedAttention CUDA 实现、FA3 的异步 pipelining | [Triton 专题](../triton/README.md)、[flash-attention 仓库](https://github.com/Dao-AILab/flash-attention) |

> 📌 **最后的话**：nano-vllm 证明的不是"40 万行多余"，而是"核心机制本质上精巧而不是庞大"。本周建立的四件套心智模型（主循环 → 调度 → KV 管理 → kernel 编排）可以迁移到任何推理引擎——遇到新框架（SGLang、TensorRT-LLM、自研引擎）先找这四样，你就永远不会在几十万行里迷路。**先读小仓库建立坐标系，再用坐标系读大仓库**——这是源码学习的通用套路，比它更重要的只有一件事：动手改 20 行，跑一次 bench，让假设接受数据检验。
