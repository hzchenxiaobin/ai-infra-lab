---
id: "learn:topic:nano-vllm:d1"
type: learn
title: "Day 1：跑通与全景侦察"
tags: [nano-vllm, vllm]
knowledge_points: [nano-vllm, paged-attention, prefix-caching]
updated: 2026-09-25
day: 1
topic: nano-vllm
related_problems: []
related_questions: []
---

# Day 1：跑通与全景侦察

## 🎯 目标

通过今天的学习，你将：

1. 搭好 nano-vllm 环境，跑通 `example.py` 并跑出 `bench.py` 的**本机吞吐基线**——这是本周 Day 6 所有 A/B 实验的对照组
2. 学会用"依赖清单反推架构"：从 `pyproject.toml` 的 5 个依赖说出 nano-vllm 每一层借了谁的轮子
3. 建立**代码地图**：知道 20 来个源文件各自负责什么、对应 vLLM 主仓库的哪个模块——Day 7 迁移时直接用
4. 用 `wc -l` 亲手验证"~1200 行"的体量，建立"这个仓库我一周能读完"的信心
5. 写下"vLLM 有而 nano 没有"的**预测清单**——Day 7 回来核对，检验你对推理引擎的理解

> 💡 **前置知识**：建议先完成 [Week 6 推理系统基础](../../daily/week6/README.md)（KV Cache、prefill/decode、continuous batching 的概念版），今天的"全景"会把它们落到真实代码的目录上
> ⚠️ **环境要求**：Linux + NVIDIA GPU（Ampere 及以上，SM >= 8.0——flash-attn 的硬性要求）；Python 3.10～3.12；CUDA 12.x；显存 >= 4GB（Qwen3-0.6B 留足 KV Cache）

---

## 为什么第一天只做"侦察"

读源码专题最常见的失败路径：Day 1 就从 `llm.py` 第一行逐行啃，Day 3 卡在某个细节里放弃。今天的策略是**先跑起来、再拿地图**：

| 学习方式 | 问题 | 今天的做法 |
|----------|------|------------|
| 直接逐行读码 | 没有全局地图，细节淹没主线 | 只读目录结构和依赖，代码留给 Day 2-5 逐文件精读 |
| 只跑 demo | 知其然不知其所以然 | 跑通后立刻记录基线数据 + 建立文件级地图 |
| 先读 vLLM 再读 nano | 被 40 万行吓退 | 反过来：小仓库建心智模型，Day 7 才进大仓库 |

> 💡 **一句话总结**：今天产出的不是"知识"，而是三样**工具**——一条基线数据、一张代码地图、一份预测清单。后面 6 天的精读都挂在这张地图上。

---

## 环境搭建

### 安装

```bash
# 1. 虚拟环境（Python 必须 3.10~3.12）
python3.11 -m venv .venv && source .venv/bin/activate

# 2. 先装 torch（与你的 CUDA 版本匹配，略）
pip install torch

# 3. clone 仓库本地安装——本周要反复读码、加注释，不要用 pip install git+ 方式
git clone https://github.com/GeeeekExplorer/nano-vllm.git
cd nano-vllm && pip install -e .
```

`pyproject.toml` 声明的依赖只有 5 个：

```text
torch>=2.4.0  triton>=3.0.0  transformers>=4.51.0  flash-attn  xxhash
```

> ⚠️ **flash-attn 是最大的安装障碍**：编译安装可能要十几分钟且对 CUDA 版本挑剔。优先尝试 `pip install flash-attn --no-build-isolation`；装不上时去 [flash-attention releases](https://github.com/Dao-AILab/flash-attention/releases) 找匹配 torch/cuda/Python 版本的预编译 wheel。

### 下载模型

```bash
huggingface-cli download Qwen/Qwen3-0.6B --local-dir ~/huggingface/Qwen3-0.6B/
# 国内镜像：export HF_ENDPOINT=https://hf-mirror.com
```

### 验证

```bash
python3 -c "import nanovllm; print('nanovllm ok')"
python3 example.py
```

```text
Prompt: '<|im_start|>user\nintroduce yourself<|im_end|>\n<|im_start|>assistant\n'
Completion: "I'm Qwen, a large language model developed by Alibaba Cloud..."
```

---

## 核心概念

### 1.1 nano-vllm 是什么

nano-vllm 是 Xingkai Yu（GeeeekExplorer）从零实现的**轻量级 vLLM 复刻**：

| 维度 | 事实 |
|------|------|
| 体量 | **~1200 行 Python**，最大单文件仅两百多行，全部纯 Python + 2 个 Triton/调用 kernel |
| 性能 | 官方 bench（Qwen3-0.6B，256 条随机请求）吞吐 **1434 tok/s，反超 vLLM 的 1362 tok/s** |
| 功能 | 离线批推理、分页 KV Cache、前缀缓存、chunked prefill、抢占、CUDA graph、torch.compile、Tensor Parallel |
| 模型 | Qwen3（dense） |
| 定位 | **教学/研究**：读它 = 读 vLLM 的"骨架抽出版" |

关键认知：它**不是玩具**。Week 5/6 手写的 mini 引擎为了可读牺牲了性能，nano-vllm 却在真实 bench 里追平 vLLM——说明它保留了决定性能的全部主干，删掉的只是工程化外壳。这正是它作为"vLLM 学习入口"的价值：**每删掉的东西都可以反问一句"vLLM 为什么需要它"**。

### 1.2 依赖清单反推架构

只看 5 个依赖，就能反推出引擎的分层——这个"考古"练习比读文档更能建立直觉：

| 依赖 | 在 nano-vllm 里干什么 | 对应的"轮子" |
|------|----------------------|--------------|
| `torch` | 模型执行、张量算子、CUDA graph | 引擎不做算术，只做调度——计算全交给 PyTorch |
| `flash-attn` | prefill 用 `flash_attn_varlen_func`、decode 用 `flash_attn_with_kvcache`，都支持 paged KV（block table） | attention kernel 完全不自研 |
| `triton` | `store_kvcache_kernel`：把 K/V 按 slot_mapping 散写进 paged cache | 唯一"手写"的 kernel，仅 ~30 行 |
| `transformers` | 只用 tokenizer 和模型 config，**不用** `AutoModelForCausalLM` | 模型结构自己实现了 `models/qwen3.py` |
| `xxhash` | 前缀缓存的链式块哈希 | 一个哈希库撑起整个 prefix caching |

> 💡 **面试考点**：nano-vllm 和 vLLM 都不自己写 attention kernel（vLLM 的 FlashAttention 后端同样封装 flash-attn）——**推理引擎的核心竞争力在系统层（调度/显存/批处理），而不是重新发明算子**。真正自研算子（如 PagedAttention 原始 CUDA kernel）只在社区没有现成实现时才值得。

### 1.3 代码地图：20 个文件的分工

```
nanovllm/
├── llm.py                  # LLM 门面类：generate() 入口
├── config.py               # Config：全部引擎参数的容器
├── sampling_params.py      # SamplingParams
├── engine/                 # —— 系统层（本周主角）——
│   ├── llm_engine.py       #   步进循环：add_request → step
│   ├── sequence.py         #   Sequence：请求对象 + 状态机
│   ├── scheduler.py        #   调度：组批 / chunked prefill / 抢占
│   ├── block_manager.py    #   分页 KV Cache + 链式哈希前缀缓存
│   └── model_runner.py     #   权重加载 / 输入构造 / CUDA graph / 前向
├── layers/                 # —— 算子层 ——
│   ├── attention.py        #   ★ Triton 写 KV + flash-attn 读 KV
│   ├── linear.py           #   TP 切分的 QKV/Row-Parallel Linear
│   ├── embed_head.py       #   词表并行 Embedding / LM Head
│   ├── rotary_embedding.py #   RoPE
│   ├── layernorm.py        #   RMSNorm
│   ├── activation.py       #   SiLU
│   └── sampler.py          #   采样
├── models/
│   └── qwen3.py            # —— 模型层：Qwen3 前向（GQA）——
└── utils/
    ├── context.py          #   全局上下文：slot_mapping/block_tables 传给 kernel
    └── loader.py           #   权重加载（含 TP 切分）
```

与 vLLM 主仓库（V1 引擎）的对应关系——**这张表是 Day 7 的走读地图，今天先混个脸熟**：

| nano-vllm | vLLM (V1) | 深入日 |
|-----------|-----------|--------|
| `llm.py` | `vllm/entrypoints/llm.py` | Day 2 |
| `engine/llm_engine.py` | `vllm/v1/engine/llm_engine.py` | Day 2 |
| `engine/sequence.py` | `vllm/v1/request.py` | Day 2 |
| `engine/scheduler.py` | `vllm/v1/core/sched/` | Day 4 |
| `engine/block_manager.py` | `vllm/v1/core/kv_cache_manager/` | Day 3 |
| `engine/model_runner.py` | `vllm/v1/worker/gpu_model_runner.py` | Day 5 |
| `models/qwen3.py` | `vllm/model_executor/models/qwen3.py` | Day 5 |
| `layers/attention.py` | `vllm/v1/attention/`（FlashAttention 后端） | Day 5 |
| `layers/linear.py` 等 | `vllm/model_executor/layers/` + `vllm/distributed/` | Day 6 |
| `utils/loader.py` | `vllm/model_executor/model_loader/` | Day 5 |

### 1.4 一次 `generate()` 的 30 秒预览

本周的主线图，先在这里立个碑（每个环节的深入日）：

```text
LLM.generate(prompts)                      # Day 2
  └─ LLMEngine.add_request()               # 文本/token → Sequence → waiting
  └─ while 未全部完成: LLMEngine.step()    # Day 2
       ├─ Scheduler.schedule()             # Day 4：组批、切块、抢占
       ├─ ModelRunner.execute()            # Day 5：构造输入 → 前向 → 采样
       │    └─ Attention                   # Day 3/5：slot_mapping 写 KV
       │                                   #        block_table 读 KV
       └─ Scheduler.postprocess()          # Day 4：哈希登记、判停、释放
```

### 1.5 API 与 vLLM 的异同

API 刻意模仿 vLLM，但有几处小差异，第一天就用得上：

| 维度 | vLLM | nano-vllm |
|------|------|-----------|
| 构造 | `LLM(model="Qwen/...")` 支持模型名自动下载 | `LLM("/本地/路径")` 用本地路径 |
| 传 prompt | 文本，或 `dict(prompt_token_ids=...)` | **直接传 token id 列表也行** |
| 采样参数 | 单个 `SamplingParams` 或列表 | 同样支持**每请求一个参数**的列表 |
| 输出 | `RequestOutput` 对象（`output.outputs[0].text`） | **dict**（`output["text"]`） |
| 服务化 | `vllm serve`（OpenAI 兼容） | 无——只有离线批推理 |

---

## 动手实践

### 任务 A：跑通 example.py（30 分钟）

`example.py` 的关键内容（建议先自己读一遍原文）：

```python
llm = LLM(path, enforce_eager=True, tensor_parallel_size=1)
sampling_params = SamplingParams(temperature=0.6, max_tokens=256)
outputs = llm.generate(prompts, sampling_params)
print(outputs[0]['text'])
```

**观察点**（比跑通更重要）：

1. prompt 先经 `tokenizer.apply_chat_template()` 套了对话模板——nano-vllm 自己不做 chat template，交给 transformers
2. `enforce_eager=True` 关闭了 CUDA graph（Day 6 会量化这个开关的代价）
3. 生成期间另开终端盯 `nvidia-smi`：decode 阶段 SM 利用率仍然不高——**即使追平 vLLM，单请求视角的 decode 依然是 memory-bound**，引擎的收益来自批处理多个请求
4. 把两条 prompt 的总耗时记下来；把 prompts 列表改长（复制 8 份），再跑一次——耗时增长远小于"单条耗时 × 8"，这就是 continuous batching 的体感

### 任务 B：跑 bench.py 记录基线（40 分钟）

先读懂 benchmark 的设计（这本身就是学习）：

```python
# bench.py 的骨架（节选）
num_seqs, max_input_len, max_ouput_len = 256, 1024, 1024
llm = LLM(path, enforce_eager=False, max_model_len=4096)   # ① 开 CUDA graph

# ② 256 条请求，输入/输出长度都在 100~1024 随机——模拟真实长短混合负载
prompt_token_ids = [[randint(0, 10000) for _ in range(randint(100, max_input_len))] ...]
sampling_params  = [SamplingParams(temperature=0.6, ignore_eos=True, max_tokens=...) ...]

llm.generate(["Benchmark: "], SamplingParams())   # ③ 先跑一条 warmup
t = time.time()
llm.generate(prompt_token_ids, sampling_params, use_tqdm=False)   # ④ 正式计时
throughput = total_tokens / (time.time() - t)
```

四个设计细节值得咀嚼：

- **`ignore_eos=True`**：不等模型自然停止，强制生成到 `max_tokens`——让"输出 token 数"可控，吞吐分母才准确
- **warmup 单独跑一条**：首次前向会触发 Triton 编译、CUDA graph 捕获等一次性开销，不 warmup 计时会虚高
- **计时口径**：`总输出 token 数 ÷ 总耗时`——注意这是**吞吐**指标，不含延迟信息
- **长度随机**：混合长短序列才能测出调度器处理"完成顺序参差"的能力，全部等长会退化成静态 batching 的场景

跑两组并记录（本机数据，抄进笔记）：

```bash
python3 bench.py
# 记录: Total: xxxxtok, Time: xx.xxs, Throughput: xxxx.xx tok/s
```

| 配置 | 吞吐 (tok/s) | 备注 |
|------|--------------|------|
| `enforce_eager=False`（开 CUDA graph） | | 本周对照组 |
| `enforce_eager=True`（改 bench.py 一行） | | 差值 = CUDA graph 的贡献，Day 6 深挖 |

### 任务 C：行数侦察（30 分钟）

亲手量化"1200 行"：

```bash
cd nano-vllm
wc -l nanovllm/*.py nanovllm/*/*.py | sort -n
```

把结果填进这张表（**这张表就是本周的阅读计划**——按行数从小到大读，或按架构层次读）：

| 文件 | 行数 | 一句话职责（今天猜，读完填） | 精读日 |
|------|------|------------------------------|--------|
| `engine/scheduler.py` | | | Day 4 |
| `engine/block_manager.py` | | | Day 3 |
| `engine/llm_engine.py` | | | Day 2 |
| `engine/sequence.py` | | | Day 2 |
| `layers/attention.py` | | | Day 5 |
| `engine/model_runner.py` | | | Day 5 |
| `models/qwen3.py` | | | Day 5 |
| `layers/linear.py` | | | Day 6 |
| 其余 `layers/*.py`、`utils/*.py`、`llm.py`、`config.py` | | | 顺路 |

**两个验证性问题**：

1. 最大的文件是哪个？超过 300 行了吗？（体感：再大也就是"一次晚自习能读完"的量）
2. `engine/` 五个文件加起来占多大比例？——**系统层（调度/显存）才是 vLLM 类引擎的本体**，模型和算子只是被调度的对象

### 任务 D："vLLM 有而 nano 没有"预测清单（20 分钟）

不看 vLLM 文档，先凭推理写下你的预测（至少凑 8 条）。起点提示——想一个真实在线服务需要什么：

```text
我的预测清单（Day 7 核对）：
1. API server（HTTP/OpenAI 兼容）
2. 异步流式输出（每生成一个 token 就推给客户端）
3. ...
```

然后打开 [vLLM 仓库](https://github.com/vllm-project/vllm) 只看目录名核对一遍，给每条标注"我预测到了 / 意外"。**意外项就是你理解的盲区**，值得记下来。

### 学习时间安排（共 2.5 小时）

| 时长 | 内容 |
|---|---|
| 30 分钟 | 理论：本文 1.1-1.5 节 |
| 30 分钟 | 任务 A：跑通 example.py + 观察点 |
| 40 分钟 | 任务 B：bench 基线两组数据 |
| 30 分钟 | 任务 C：行数侦察 + 填表 |
| 20 分钟 | 任务 D：预测清单 + 核对 |

---

## 常见陷阱与最佳实践

| 陷阱 | 现象 | 正确做法 |
|------|------|----------|
| flash-attn 装不上 | 编译报错/卡死 | 找预编译 wheel；或降低版本要求；SM < 8.0 的老卡（如 T4/V100）直接放弃，换 A 系以上 |
| Python 版本不符 | 安装报 `requires-python <3.13` | 用 3.10～3.12 的解释器建虚拟环境 |
| 模型路径写模型名 | 找不到权重 | 先 `huggingface-cli download` 到本地，`LLM()` 传本地路径 |
| 首次跑 bench 特别慢 | 第一条请求含编译/CUDA graph 捕获开销 | bench.py 已做 warmup；自己写脚本时记得同样处理 |
| 在 busy GPU 上跑 bench | 吞吐忽高忽低 | 基线数据务必独占 GPU 时采集，否则对照组失真 |
| 拿 nano 吞吐对比生产 vLLM | 结论"vLLM 不行" | 官方对比仅限单卡离线小模型场景；在线服务、量化、多模型的差距 Day 7 展开 |

---

## 面试要点

**Q：nano-vllm 用 ~1200 行就追平了 vLLM 的离线吞吐，这说明什么？vLLM 的几十万行都是多余的吗？**
> 说明决定单机离线性能的主干是**系统机制**（分页 KV Cache、continuous batching、前缀缓存、CUDA graph），而不是代码量。但 vLLM 的体量花在 nano 不做的事上：API server、异步引擎、上百种模型与后端适配、量化、投机解码、PD 分离、多硬件平台——这些决定"能不能用在生产"，不决定"单场景跑多快"。正确的结论是：核心算法很精巧，工业适用性很昂贵。

**Q：为什么 nano-vllm 和 vLLM 都不自研 attention kernel？**
> 因为社区已有高质量 paged attention kernel（flash-attn 的 `flash_attn_with_kvcache` 原生支持 block table）。推理引擎的价值在系统层——调度、显存管理、批组装、kernel 编排；只有社区没有现成实现时才值得自研算子（vLLM 当年手写 PagedAttention CUDA kernel 就是因为当时没有 paged KV 的开源 kernel）。判断"造轮子还是用轮子"本身就是 Infra 工程的核心能力。

**Q：bench.py 里为什么要先跑一条 warmup 再计时？**
> 首次前向包含一次性开销：Triton kernel JIT 编译、CUDA graph 捕获、lazy 初始化等，可能占数秒。不剔除的话吞吐指标严重失真。这也是所有推理 benchmark 的通用纪律：**warmup 后再计时**——顺带一提，`ignore_eos=True` 是另一条纪律：让输出 token 数可控，否则随机提前停止会让分母不可比。

**Q：`enforce_eager` 这个参数是干什么的？example 里设 True、bench 里设 False，为什么？**
> 控制 CUDA graph 的开关：`True` = eager 模式，每步逐个 launch kernel；`False` = 捕获一次前向为 CUDA graph，之后整图重放，消除 kernel launch 开销。example 追求启动快（捕获要花时间），设 True；bench 追求稳态吞吐，设 False。decode 阶段每步几十个小 kernel、GPU 常常在等 CPU 发射，所以 CUDA graph 对 decode 提升最大——Day 6 会用 A/B 数据验证。

---

## 今日小结

| 收获 | 具体内容 |
|------|----------|
| 定位认知 | nano-vllm ≈ vLLM 的骨架抽出版：1200 行、追平 vLLM 离线吞吐、只做离线推理 |
| 依赖考古 | torch（执行）/ flash-attn（attention）/ triton（写 KV）/ transformers（tokenizer）/ xxhash（前缀缓存）——引擎不自研算子 |
| 代码地图 | engine/ 五件套 = 系统层本体；layers/ + models/ = 被调度的对象；每个文件都有 vLLM 对应物 |
| 基线数据 | bench.py 两组（eager / CUDA graph）吞吐已记录——本周实验的对照组 |
| API 异同 | 输出是 dict、可直接传 token ids、无 server 模式 |

**自测清单**（能答出才算过关）：

- [ ] 不看笔记说出 5 个依赖各自负责什么
- [ ] 画出 `generate()` → step → schedule → execute → postprocess 的主线图
- [ ] 说出 `engine/` 至少 4 个文件的职责和 vLLM 对应物
- [ ] 解释 bench.py 里 warmup 和 `ignore_eos=True` 的用意
- [ ] 预测清单已写满 8 条并核对

**📦 今日产出**：吞吐基线两组数据 + 行数统计表（带精读日标注）+ "vLLM 有而 nano 没有"预测清单。

---

> 📌 **明日预告**：Day 2 沿主线图读**引擎层**——`llm.py` → `llm_engine.py` → `sequence.py`：`add_request()` 如何把 prompt 变成 Sequence、`step()` 循环怎么组织、`SequenceStatus` 状态机如何流转，以及 `config.py` 里每个参数影响哪一层。产出本周最重要的一张图：`generate()` 的完整调用链时序图。
