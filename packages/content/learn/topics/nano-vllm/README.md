---
id: "learn:topic:nano-vllm"
type: learn
title: "nano-vllm：用 1200 行代码读懂 vLLM"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, paged-attention, prefix-caching, continuous-batching]
updated: 2026-09-25
topic: nano-vllm
related_problems: []
related_questions: []
---

# nano-vllm：用 1200 行代码读懂 vLLM

> **适用对象**：完成 [Week 5 PagedAttention / Mini 引擎](../../daily/week5/README.md) 与 [Week 6 Continuous Batching](../../daily/week6/README.md)（或已读 [vLLM 专题](../vllm/README.md)）、想深入 vLLM 源码却被几十万行体量劝退的开发者
> **本周目标**：通过精读 [nano-vllm](https://github.com/GeeeekExplorer/nano-vllm)——一个 **~1200 行**、性能却能与 vLLM 打平的极简复刻——建立 vLLM 的完整心智模型：引擎循环 → 分页 KV Cache → 前缀缓存 → 调度与抢占 → attention kernel 接口，最后把这套模型迁移回 vLLM 主仓库
> **时间投入**：工作日每天 2.5h（早间 1.5h + 晚间 1h），周末每天 5h，周计 22.5h
> **周日里程碑**：产出 ① nano-vllm ↔ vLLM 模块对照表 ② 四份机制笔记（引擎调用链 / BlockManager / Scheduler / Attention）③ 特性 A/B 实验数据；能不看资料画出引擎架构图，完整讲述一次 `generate()` 的生命周期

---

## 本周总览

| 维度 | 内容 |
|------|------|
| **整体目标** | 精读 nano-vllm 全部核心源码（每个文件 < 300 行），理解 vLLM 的五大核心机制在真实代码中的样子：LLMEngine 步进循环、分页 KV Cache（BlockManager）、链式哈希前缀缓存、prefill-first 调度 + chunked prefill + 抢占、flash-attn 的 paged 接口；并建立到 vLLM 主仓库（V1 引擎）的模块映射 |
| **核心产出** | ① 吞吐基线记录（bench.py）② `generate()` 调用链时序图 ③ block table + 链式哈希图解 ④ `schedule()` 流程图（含抢占路径）⑤ prefill/decode kernel 对比笔记 ⑥ prefix caching / CUDA graph A/B 实验表 ⑦ nano-vllm ↔ vLLM 模块对照表 ⑧ 面试问答集 |
| **验收标准** | ① 能说清 1200 行里"保住了什么、删掉了什么"，为什么删掉这些不影响吞吐 ② 能手推链式哈希的计算与更新时机，解释为什么只哈希满块 ③ 能逐行讲清 `schedule()` 里 prefill 与 decode 两条路径的每个分支 ④ 能解释 slot_mapping / block_table / cu_seqlens 三组张量分别喂给哪个 kernel ⑤ 能列出 5 项 nano 没做、vLLM 必须做的生产级能力 |
| **面试准备** | 积累 8 道面试题，覆盖：极简复刻的取舍、链式哈希前缀缓存、slot_mapping、recompute 抢占、chunked prefill 的实现约束、prefill/decode kernel 差异、ref_count 共享场景 |

### 本专题与 Week 5/6、vLLM 专题的边界

| 维度 | Week 5/6（每日教程） | 本 nano-vllm 专题 | [vLLM 专题](../vllm/README.md) |
|------|----------------------|-------------------|-------------------------------|
| **视角** | 原理复现——自己手写 mini 引擎 | **源码精读**——读一个真实能跑的极简引擎 | 工程使用——vLLM 的部署、特性与压测 |
| **代码规模** | 数百行教学代码 | ~1200 行，单文件可读完 | 数十万行，只能按模块走读 |
| **真实度** | 教学简化（单请求/朴素实现） | 生产级机制的完整骨架，官方 bench 吞吐追平 vLLM（Qwen3-0.6B：1434 vs 1362 tokens/s） | 完整工业实现 |
| **读源码体验** | 自己写的不用读 | 每天精读 2-3 个文件，一周读完全部核心 | 依赖本专题建立的心智模型切入 |
| **产出** | mini 引擎 | 机制笔记 + 模块对照表 | 部署 + 压测报告 |

> 💡 **一句话总结**：Week 5/6 教你"造一个玩具"，本专题教你"读懂一台真机的骨架"，vLLM 专题教你"开这台真机"——nano-vllm 是从玩具到工业框架之间**成本最低的一级台阶**。

### 前置准备清单

#### 软件/环境验证
- [ ] Linux + NVIDIA GPU（Ampere 及以上，SM >= 8.0；flash-attn 的要求）
- [ ] Python 3.10+、PyTorch 2.x、CUDA 12.x
- [ ] 依赖：`flash-attn`、`triton`、`xxhash`、`transformers`（tokenizer）
- [ ] nano-vllm 本体（pip 安装或 clone，建议 clone 方便读码加注释）：
  ```bash
  git clone https://github.com/GeeeekExplorer/nano-vllm.git
  cd nano-vllm && pip install -e .
  ```
- [ ] 模型：`Qwen/Qwen3-0.6B`（官方 bench 配置，8GB 显存即可）

#### 验证命令
```bash
huggingface-cli download Qwen/Qwen3-0.6B --local-dir ~/huggingface/Qwen3-0.6B
python3 -c "import nanovllm; print('nanovllm ok')"
python3 example.py    # 仓库自带最小示例
```

#### 必读资源（本周会反复用到）
- ⭐ [nano-vllm GitHub 仓库](https://github.com/GeeeekExplorer/nano-vllm) — 本周精读对象，~1200 行
- ⭐ [vLLM 专题](../vllm/README.md) — 姊妹专题，Day 7 迁移目标
- ⭐ [vLLM 论文精读](../../paper/vllm/README.md) — PagedAttention 原始论文，Day 3 的理论对照
- 📌 [Week 5 Day 4 PagedAttention kernel](../../daily/week5/day4/README.md) — 手写版热身
- 📌 [Week 6 Day 2 Continuous Batching](../../daily/week6/day2/README.md) — 手写版调度器热身
- 📌 [flash-attention 仓库](https://github.com/Dao-AILab/flash-attention) — Day 5 的 kernel API 文档

---

## 为什么学 nano-vllm

vLLM 主仓库有几十万行代码、抽象层次多（V0/V1 双引擎遗留、平台适配、数十种模型与后端），"从入口读到底"是不现实的。而学习推理引擎的最好方式恰恰是**完整读一遍真实实现**——nano-vllm 就是为此存在的：

| 对比项 | 手写 mini 引擎（Week 5/6） | nano-vllm | vLLM 主仓库 |
|--------|----------------------------|-----------|-------------|
| 分页 KV Cache | 有（教学版） | 有（BlockManager + ref_count + 哈希缓存） | 有（多层抽象） |
| Continuous Batching | 有（教学版） | 有（prefill-first + 抢占） | 有（+ swap、TBO 等复杂策略） |
| 前缀缓存 | 无 | 有（xxhash 链式哈希，~80 行） | 有（复杂得多） |
| Chunked prefill | 无 | 有（一个 `if` 的约束） | 有（配置化调度） |
| CUDA graph | 无 | 有 | 有 |
| 性能 | 教学 | **追平 vLLM**（小模型离线场景） | 生产级 |
| 一次能读完 | 是 | **是（一周）** | 否 |

| 场景 | 只读 vLLM | 先读 nano-vllm 再读 vLLM |
|------|-----------|--------------------------|
| **理解调度** | 在数千行调度器里迷路 | 先在 100 行的 `scheduler.py` 里看清骨架 |
| **理解前缀缓存** | 面对 N 层缓存抽象 | 80 行的链式哈希一遍读懂原理 |
| **面试讲原理** | 背文档结论 | 逐行讲清实现，包括边界情况 |
| **改代码验证想法** | 编译+回归成本高 | 改 20 行跑 bench 立刻见效 |

> 💡 **一句话总结**：nano-vllm 证明了 vLLM 的核心机制本质上是精巧而不是庞大——1200 行足够，多余的都是工程化。读懂这 1200 行，vLLM 就从"黑盒"变成"一堆你认识的模块"。

---

## 核心概念速览：nano-vllm 代码地图

```
nanovllm/
├── llm.py                    # LLM 门面类：generate() 入口            (~50 行)
├── config.py                 # Config：所有引擎参数的容器              (~50 行)
├── sampling_params.py        # 采样参数
├── engine/
│   ├── llm_engine.py         # 步进循环：add_request → step → 输出
│   ├── sequence.py           # Sequence：请求对象 + 状态机
│   ├── block_manager.py      # 分页 KV Cache + 链式哈希前缀缓存        (~150 行)
│   └── scheduler.py          # waiting/running 调度 + chunked prefill + 抢占 (~100 行)
├── model_runner 在 engine/ 下：权重加载、输入构造、CUDA graph、执行前向
├── layers/
│   ├── attention.py          # Triton store_kvcache + flash-attn 两个 kernel
│   ├── linear.py             # TP 切分的 QKV/Row-Parallel Linear
│   ├── embed_head.py         # 词表并行 Embedding / LM Head
│   ├── rotary_embedding.py   # RoPE
│   ├── layernorm.py / activation.py / sampler.py
├── models/
│   └── qwen3.py              # 完整 Qwen3 前向（GQA）
└── utils/
    ├── context.py            # 全局上下文：slot_mapping / block_tables 等传给 kernel
    └── loader.py             # 权重加载
```

### 1. 一次 `generate()` 的主线（读源码时时刻对照）

```
LLM.generate(prompts)
  └─ LLMEngine.add_request()          # 文本 → token → Sequence，进 waiting
  └─ 循环 LLMEngine.step():
       ├─ Scheduler.schedule()        # 返回 (scheduled_seqs, is_prefill)
       │    ├─ prefill 路径：从 waiting 取，token 预算内组批（可 chunk）
       │    └─ decode 路径：从 running 取，显存不够则 preempt
       ├─ ModelRunner.execute()       # 构造输入张量 → Qwen3 前向 → sampler
       │    └─ Attention: Triton 写 KV 到 cache → flash-attn 读 block_table
       └─ Scheduler.postprocess()     # hash_blocks 增量哈希、EOS/长度判断、释放块
```

### 2. 三组关键张量（Day 3/5 的主角）

| 张量 | 形状含义 | 谁消费 |
|------|----------|--------|
| **slot_mapping** | 每个 token 写入 KV cache 池的扁平槽位 = `block_id × block_size + 块内偏移` | Triton `store_kvcache_kernel`（写 K/V） |
| **block_table** | 每序列的逻辑块 → 物理块号列表 | `flash_attn_with_kvcache` / `flash_attn_varlen_func`（读 KV） |
| **cu_seqlens** | varlen 批的累积序列长度前缀和 | `flash_attn_varlen_func`（prefill 的批内切分） |

### 3. 链式哈希前缀缓存（BlockManager 的灵魂）

- 每个满块计算 `hash = xxh64(前一块的hash ‖ 本块 token_ids)`——**链式**：第 n 块的哈希隐含前 n 块全部信息
- `hash_to_block_id` 字典索引 → 新请求按块哈希逐块命中，命中即复用物理块（`ref_count += 1`）
- **只哈希满块**：最后一个块未满、还会追加，哈希了就会失效
- **哈希碰撞防御**：`can_allocate` 命中后还要比对 `block.token_ids != token_ids`，不同则视为未命中

### 4. 调度器的极简取舍

- **prefill-first**：先尽力调度 prefill（`max_num_batched_tokens` 预算内），有空位再跑 decode——这是 vLLM 早期策略，新版默认混批
- **chunked prefill 只切第一个 seq**：`if remaining < num_tokens and scheduled_seqs: break`——一个分支就实现了"长 prompt 切块"
- **抢占只有 recompute**：显存不足时释放块、状态回 WAITING、塞回 waiting 队首、`is_prefill=True` 等待重算——没有 vLLM 的 swap 路径

---

## 最小可运行示例

```python
# example.py —— nano-vllm 最小推理示例（API 与 vLLM 几乎一致）
# 运行: python3 example.py

from nanovllm import LLM, SamplingParams

llm = LLM("/root/huggingface/Qwen3-0.6B", enforce_eager=True, tensor_parallel_size=1)
sampling_params = SamplingParams(temperature=0.6, max_tokens=256)
prompts = ["Hello, Nano-vLLM."]
outputs = llm.generate(prompts, sampling_params)
print(outputs[0]["text"])
```

```bash
# 吞吐基线（本周所有实验的对照组）
python3 bench.py
```

官方基线（RTX 4070 Laptop / Qwen3-0.6B / 256 条请求，输入输出各 100-1024 随机）：

| 引擎 | 吞吐 (tokens/s) |
|------|-----------------|
| vLLM | 1361.84 |
| nano-vllm | **1434.13** |

> 💡 **观察点**：`enforce_eager=True` 会关闭 CUDA graph——Day 6 我们会亲手把这个开关翻过来量化差异。

---

## 本周学习计划

| 天数 | 主题 | 精读文件 | 核心产出 |
|------|------|----------|----------|
| Day 1 | 跑通与全景侦察 | 目录结构 + example/bench | 吞吐基线 + 架构分层图初稿 |
| Day 2 | 引擎主线 | `llm.py` / `llm_engine.py` / `sequence.py` / `config.py` | `generate()` 调用链时序图 |
| Day 3 | 分页 KV Cache 与前缀缓存 | `block_manager.py` | block table + 链式哈希图解 |
| Day 4 | 调度器与抢占 | `scheduler.py` | `schedule()` 流程图（含抢占） |
| Day 5 | 模型执行与算子 | `model_runner` / `models/qwen3.py` / `layers/attention.py` / `utils/context.py` | prefill vs decode kernel 笔记 |
| Day 6 | 优化特性 A/B 实验 | `layers/linear.py` / `embed_head.py` + 实验 | 前缀缓存 / CUDA graph / TP 实验表 |
| Day 7 | 迁移 vLLM 与复盘 | vLLM 主仓库对应模块 | 模块对照表 + 面试问答定稿 |

### Day 1（周一）：跑通与全景侦察

- 安装环境与模型，跑通 `example.py`；跑 `bench.py` 记录本机吞吐基线（后续所有实验的对照组）
- 用 `wc -l nanovllm/**/*.py` 数每个文件的行数，按行数排序——你会发现**最大的文件也不到 300 行**
- 对照 [核心概念速览](#核心概念速览nano-vllm-代码地图) 的代码地图浏览全部目录，标注每个文件在 vLLM 中的对应物
- 晚间：写"vLLM 有而 nano 没有"的预测清单（如：API server、异步引擎、量化、投机解码）——Day 7 回来核对
- **产出**：吞吐基线数据 + 分层架构图初稿 → [进入 Day 1](day1.md)

### Day 2（周二）：引擎主线——`generate()` 的一生

- 精读 `llm.py`（门面）→ `engine/llm_engine.py`：`add_request()` 如何把 prompt 变成 `Sequence` 塞进 waiting；`step()` 如何循环驱动 调度 → 执行 → 后处理
- 精读 `engine/sequence.py`：`SequenceStatus`（WAITING/RUNNING/FINISHED）状态机、`block_table` / `num_cached_tokens` / `num_scheduled_tokens` 三个关键字段
- 读 `config.py`：弄清 `max_num_seqs`、`max_num_batched_tokens`、`kvcache_block_size`、`num_kvcache_blocks`、`enforce_eager`、`tensor_parallel_size` 各自影响什么
- **产出**：从 `LLM.generate()` 到 token 返回的完整调用链时序图（这是本周所有笔记的骨架图） → [进入 Day 2](day2.md)

### Day 3（周三）：BlockManager——分页 KV Cache 与前缀缓存

- 逐行精读 `engine/block_manager.py`（~150 行），对照 [vLLM 论文](../../paper/vllm/README.md) §3-§4
- 吃透三组方法：`can_allocate`/`allocate`/`deallocate`（进批时的复用与申请）、`can_append`/`may_append`（decode 时按需扩一个块）、`hash_blocks`（step 后增量登记满块哈希）
- 深挖三个细节：① 链式哈希为什么用前一块哈希做盐 ② `ref_count` 什么时候会 > 1 ③ `_allocate_block` 里为什么要删旧哈希映射
- 回答一个关键问题：**`slot_mapping` 在哪里算出来、又怎么被 Triton kernel 消费**（衔接 Day 5）
- **产出**：逻辑块 → block table → 物理块映射图 + 链式哈希更新时序图 → [进入 Day 3](day3.md)

### Day 4（周四）：Scheduler——Continuous Batching 与抢占

- 逐行精读 `engine/scheduler.py`（~100 行），对照 [Week 6 Day 2 手写 Batcher](../../daily/week6/day2/README.md)
- prefill 路径：token 预算 `max_num_batched_tokens` 内从 waiting 组批；**chunked prefill 的实现只有一个分支**——为什么只允许第一个 seq 被切？切完 `num_scheduled_tokens < num_tokens` 会发生什么？
- decode 路径：`can_append` 检查剩余块数 → 显存不足时 `preempt()`：释放全部块、回 WAITING、塞回 waiting **队首**、`is_prefill=True`——recompute 策略的完整闭环
- `postprocess()`：本步结束后哪些状态被更新（`hash_blocks`、`num_cached_tokens` 回填、EOS 与 `max_tokens` 判停、`deallocate`）
- **产出**：`schedule()` 双路径流程图；列出"vLLM Scheduler 有而这里没有的"（swapped 队列、swap 抢占、混批调度）→ [进入 Day 4](day4.md)

### Day 5（周五）：模型执行与算子层

- 读 `engine/model_runner.py` + `utils/loader.py`：权重怎么加载、`enforce_eager=False` 时 CUDA graph 怎么捕获/重放、torch.compile 挂在哪
- 读 `models/qwen3.py`：一个标准 Qwen3 前向如何组装 `layers/` 里的积木（GQA、RoPE、RMSNorm）
- **重点精读 `layers/attention.py`**（本周最核心的 60 行）：
  - Triton `store_kvcache_kernel`：按 `slot_mapping` 把 K/V 散写到 paged cache——为什么需要自定义 kernel 而不直接 `index_copy`
  - prefill 分支：`flash_attn_varlen_func` + `cu_seqlens`；**前缀缓存命中时 k/v 直接换成 cache 本体**（`k, v = k_cache, v_cache`），block_table 交给 kernel
  - decode 分支：`flash_attn_with_kvcache`（paged 读）
- 读 `utils/context.py`：`get_context()` 全局上下文如何避免在模型接口里层层传参
- **产出**：prefill vs decode 的数据流对比图（谁写 KV、谁读 KV、走哪个 kernel）→ [进入 Day 5](day5.md)

### Day 6（周六）：优化特性 A/B 实验

- **前缀缓存**：构造 256 条共享 512-token 前缀的请求 vs 完全无关请求，对比吞吐与延迟；再用 50% 满块对齐的前缀（如 520 tokens）观察块粒度损失
- **CUDA graph**：`enforce_eager=True` vs `False`，对比 decode 阶段吞吐（batch 越小差异越明显——为什么？）
- **Tensor Parallelism**：读 `layers/linear.py`（QKV 列切、Row 切 + all-reduce）与 `embed_head.py`（词表切分）；有多卡就跑 `tensor_parallel_size=2`，单卡则画出通信点位置图
- **产出**：三组 A/B 实验表（配置、数据、结论一句话）→ [进入 Day 6](day6.md)

### Day 7（周日）：迁移 vLLM 与复盘

- 拿着本周心智模型进 [vLLM 主仓库](https://github.com/vllm-project/vllm)，按对照表走读 V1 引擎对应模块，验证"同一个机制在工业实现里长什么样"：

| nano-vllm | vLLM (V1) | 走读关注点 |
|-----------|-----------|------------|
| `engine/llm_engine.py` | `vllm/v1/engine/` | 异步输出、多进程分离 |
| `engine/scheduler.py` | `vllm/v1/core/scheduler.py` | 混批、优先级、SLO 策略 |
| `engine/block_manager.py` | `vllm/v1/core/kv_cache_manager/` | 双层抽象、copy-on-write |
| `layers/attention.py` | `vllm/v1/attention/` | 多后端、异步输入处理 |
| `model_runner` | `vllm/v1/worker/gpu_model_runner.py` | CUDA graph 管理、持久批 |

- 核对 Day 1 的预测清单，补全"nano 删掉的生产级能力"地图：API server、异步引擎、swap 抢占、量化、投机解码、多模型后端……这些就是后续读 vLLM 的 TODO 列表
- 可选：同机同模型跑 `bench.py` vs vLLM 官方 bench，复现"追平"结论
- 定稿全部笔记，整理面试问答集

---

## 面试要点

**Q：nano-vllm 只用 ~1200 行就追平了 vLLM 的吞吐，它是怎么做到的？删掉的代码不重要吗？**
> 保住的是**决定性能的主干**：分页 KV Cache、continuous batching、前缀缓存、CUDA graph、flash-attn kernel——这些决定了单机离线场景的吞吐上限。删掉的是**决定适用性的工程化**：API server、异步引擎、多模型/多后端适配、量化、投机解码、swap 抢占、平台兼容。结论：性能靠核心算法，规模靠工程化——这两者对推理引擎缺一不可，但学习时应先攻前者。

**Q：nano-vllm 的前缀缓存为什么用链式哈希？为什么只哈希满块？**
> `hash_n = xxh64(hash_{n-1} ‖ tokens_n)`——第 n 块的哈希隐含前缀全部信息，新请求只需逐块查字典 `hash_to_block_id` 就能找到最长可复用前缀，O(块数) 完成。只哈希满块是因为最后一个块还会追加 token，内容未定，哈希登记了也会失效；命中复用后尾部块按普通块分配。另外哈希命中后还要比对 `token_ids` 防碰撞——xxhash 不是密码学哈希。

**Q：slot_mapping 是什么？谁生成、谁消费？**
> 它把"本次前向的每个 token"映射到 KV cache 池的扁平槽位：`slot = block_id × block_size + 块内偏移`，由调度器基于 `block_table` 算出。消费方是 Triton `store_kvcache_kernel`：attention 层算完 K/V 后按它把数据散写进 paged cache（slot 为 -1 的 padding token 跳过）。而读取端（flash-attn）消费的是 block_table 而非 slot_mapping——写入散、读取聚。

**Q：nano-vllm 显存不足时的抢占是怎么做的？为什么选 recompute 而不是 swap？**
> `preempt()`：释放该序列全部物理块、状态回 WAITING、塞回 waiting 队首、`is_prefill=True`——下次调度重新 prefill（好在前缀缓存通常还在，重算成本可控）。选 recompute 是极简取舍：swap 需要 CPU 侧缓存池 + H2D/D2H 拷贝 + 一套换入换出状态机，而 recompute 只需要十几行。vLLM 早期版本两种都支持，后来默认 recompute——因为生成场景下重算一个块的代价通常低于维护 swap 路径的复杂度。

**Q：nano-vllm 的 chunked prefill 是怎么实现的？为什么只允许切第一个序列？**
> prefill 组批时用 `max_num_batched_tokens` 做预算：第一个序列超出预算就切一部分（`num_scheduled_tokens = min(num_tokens, remaining)`），本次只算这部分、状态留在 waiting；从第二个序列起若预算不够就直接 break（`if remaining < num_tokens and scheduled_seqs: break`）。只切第一个是为了实现极简——避免一个序列被切多次的边界情况。这是 Sarathi-Serve 思想的最小实现。

**Q：prefill 和 decode 分别用哪个 attention kernel？为什么不同？**
> prefill 用 `flash_attn_varlen_func`：一次算多个 token，批内序列长度不一，用 `cu_seqlens` 前缀和切分，是 compute-bound 的标准 flash-attention 路径。decode 用 `flash_attn_with_kvcache`：每序列只算 1 个新 token，但要读全部历史 KV，kernel 直接以 paged 方式按 block_table 读 cache，适配 memory-bound 特性。特殊 case：prefill 遇到前缀缓存全命中时，k/v 直接指向 cache 本体并传 block_table——prefill 也能"读缓存"。

**Q：Block 的 ref_count 什么场景下会大于 1？**
> 前缀缓存命中复用：新请求与已缓存请求共享同一物理块时 `ref_count += 1`；释放时减到 0 才真正归还 free 队列。这是 copy-on-write 的前置条件——vLLM 中的并行采样（一个 prompt 多路输出）会大量出现共享 prompt 块，nano-vllm 虽然只做单路输出，但前缀缓存本身就制造了共享。

**Q：CUDA graph 在 nano-vllm 里加速了什么？为什么 decode 受益更大？**
> 加速的是 kernel launch 开销：decode 每步几十个 kernel 但每个只算微秒级，CPU 发射 kernel 的时间占了大头（GPU 等 CPU）；CUDA graph 把整步前向录制成图一次发射。prefill 每个 kernel 都是大计算量，发射开销占比可忽略，收益小。所以 `enforce_eager=True`（关 graph）主要拖慢 decode——这也是 vLLM 加这个开关的原因。

---

## 推荐资源

| 资源 | 类型 | 优先级 |
|------|------|--------|
| [nano-vllm GitHub 仓库](https://github.com/GeeeekExplorer/nano-vllm) | 源码 | ⭐ 必读（本周精读对象） |
| [vLLM 专题](../vllm/README.md) | 姊妹专题 | ⭐ 必读（Day 7 迁移目标） |
| [vLLM 论文精读](../../paper/vllm/README.md)（SOSP 2023） | 论文精读 | ⭐ 必读（Day 3 理论对照） |
| [flash-attention 仓库](https://github.com/Dao-AILab/flash-attention) | 源码 | 📌 推荐（Day 5 kernel API） |
| [Week 5 PagedAttention / Mini 引擎](../../daily/week5/README.md) | 每日教程 | 📌 推荐（前置热身） |
| [Week 6 Continuous Batching](../../daily/week6/README.md) | 每日教程 | 📌 推荐（前置热身） |
| [Sarathi-Serve](https://arxiv.org/abs/2403.02310)（OSDI 2024） | 论文 | 📎 参考（chunked prefill） |
| [Orca](https://www.usenix.org/conference/osdi22/presentation/yu)（OSDI 2022） | 论文 | 📎 参考（continuous batching 起源） |
| [Triton 专题](../triton/README.md) | 姊妹专题 | 📎 衔接（读懂 store_kvcache kernel） |
| [SGLang 专题](../sglang/README.md) | 姊妹专题 | 📎 衔接（对照 RadixAttention） |

---

## 目录结构

```
aiinfra/topics/nano-vllm/
├── README.md                    # 本文件（专题概览 + 一周计划）
├── day1.md                      # Day 1: 跑通与全景侦察（基线、依赖考古、代码地图）
├── day2.md                      # Day 2: 引擎主线（step 三段式、Sequence、时序图）
├── day3.md                      # Day 3: BlockManager（分页 KV Cache、链式哈希前缀缓存）
├── day4.md                      # Day 4: Scheduler（continuous batching、chunked prefill、抢占）
├── day5.md                      # Day 5: 模型执行与算子（attention 双路径、Gumbel-max、CUDA graph）
├── day6.md                      # Day 6: Tensor Parallelism 与优化特性 A/B 实验
├── day7.md                      # Day 7: 迁移 vLLM 与复盘（五站走读、能力地图、结课自测）
├── notes/                       # （规划中）走读笔记
│   ├── engine_walkthrough.md    # Day 2: generate() 调用链
│   ├── block_manager.md         # Day 3: 分页 KV Cache + 链式哈希
│   ├── scheduler.md             # Day 4: 调度与抢占
│   └── attention_kernel.md      # Day 5: prefill/decode kernel 对比
└── benchmark/                   # （规划中）A/B 实验脚本与结果
    └── prefix_cache_ab.md       # Day 6: 前缀缓存 / CUDA graph 实验
```

> 💡 **后续延伸**：完成本专题后有两条路：① 进 [vLLM 专题](../vllm/README.md) 补齐使用、部署与压测（工程视角）；② 直接开 vLLM V1 源码走读，重点补 nano 没有的：量化加载、投机解码、异步引擎与 PD 分离（系统视角）。两者可并行——面试前把本专题的调用链笔记 + vLLM 专题的架构图过一遍即可。
