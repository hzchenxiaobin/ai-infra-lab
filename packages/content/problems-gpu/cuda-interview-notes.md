---
id: "learn:note:cuda-interview-notes"
type: learn
title: "CUDA 手撕题专题：AI Infra 面经总结"
tags: [cuda, interview]
knowledge_points: [cuda, interview-prep]
updated: 2026-09-09
related_problems: ["gpu:e:001", "gpu:e:002", "gpu:e:003", "gpu:e:009", "gpu:e:021", "gpu:e:023", "gpu:e:052", "gpu:e:054", "gpu:e:065", "gpu:e:066", "gpu:e:068", "gpu:h:012", "gpu:h:014", "gpu:h:015", "gpu:h:020", "gpu:h:026", "gpu:h:036", "gpu:h:039", "gpu:h:046", "gpu:h:053", "gpu:h:056", "gpu:h:059", "gpu:h:073", "gpu:h:074", "gpu:h:093", "gpu:h:109", "gpu:m:004", "gpu:m:005", "gpu:m:006", "gpu:m:010", "gpu:m:011", "gpu:m:013", "gpu:m:016", "gpu:m:017", "gpu:m:018", "gpu:m:022", "gpu:m:025", "gpu:m:027", "gpu:m:028", "gpu:m:029", "gpu:m:030", "gpu:m:032", "gpu:m:033", "gpu:m:034", "gpu:m:035", "gpu:m:037", "gpu:m:038", "gpu:m:040", "gpu:m:042", "gpu:m:043", "gpu:m:044", "gpu:m:045", "gpu:m:047", "gpu:m:050", "gpu:m:051", "gpu:m:055", "gpu:m:057", "gpu:m:058", "gpu:m:060", "gpu:m:061", "gpu:m:064", "gpu:m:067", "gpu:m:069", "gpu:m:070", "gpu:m:071", "gpu:m:072", "gpu:m:075", "gpu:m:076", "gpu:m:078", "gpu:m:080", "gpu:m:081", "gpu:m:082", "gpu:m:084", "gpu:m:085", "gpu:m:087", "gpu:m:090", "gpu:m:094", "gpu:m:096", "gpu:m:105", "gpu:m:106", "gpu:m:107a", "gpu:m:107b", "gpu:m:108", "gpu:m:109", "gpu:m:110", "gpu:m:111", "gpu:m:112", "gpu:m:113", "gpu:m:114", "gpu:m:115", "gpu:m:116"]
related_questions: []
---

# CUDA 手撕题专题：AI Infra 面经总结

> **来源**：知乎、牛客网等平台的 AI Infra 公开面经（链接见文末参考资料），检索整理时间 2026-07
> **适用对象**：准备 AI Infra / 推理引擎 / 高性能计算方向岗位、需要手撕 CUDA kernel 的求职者
> **说明**：知乎页面有反爬保护，部分内容基于搜索摘要整理；小红书正文需登录，内容来自转载与面经汇总。细节请点原文链接核对
> **相关专题**：[AI Infra 面经与面试题整理](/notes/cuda-interview-notes)（面试形式与八股）、[Week 1 CUDA 基础](/week1)（CUDA 入门教程）

---

## 一、考察形式

- 面试一般**不提供 CUDA 运行环境**，也不要求完整可运行代码，通常只写 kernel 函数 + `block_size` / `grid_size` + launch 调用（[牛客：CUDA算子手撕与面试](https://www.nowcoder.com/discuss/697901950464954368)）
- 不局限于 CUDA，Triton / CuTe 也可以写，但直接写 CUDA 是加分项；推荐去 LeetGPU 刷题练习（[知乎：AI infra 面试经验贴](https://zhuanlan.zhihu.com/p/1970722821522061231)）
- 少数公司要求**结果与 CPU 版本对齐**（如某大模型公司的 softmax 3-pass 写法，[牛客：模型部署/推理优化社招面经](https://www.nowcoder.com/discuss/599177965083054080)）
- 形式多为共享屏幕、纯文本编辑器现场写（[牛客：百度 AI Infra 一面](https://www.nowcoder.com/discuss/875003802187792384)）

## 二、高频题（几乎必考）

### 1. Softmax —— 出现频率最高

- 要点：减最大值防溢出（safe softmax）、warp shuffle 归约
- 一维数组和 M×N 矩阵**按行 softmax** 都要会
- 变体：快手考过 "M×K 在 K 方向做 Softmax2D，要求避免爆精度"（[知乎：2025 春招实习面经汇总](https://zhuanlan.zhihu.com/p/1896206045161952147)）
- 进阶：online softmax（FlashAttention 的分块递推形式）

### 2. Reduce（sum / max）

优化链路经常被追问，要能说清每一步的收益：

1. naive：`atomicAdd` 全局归约（线程串行化，性能差）
2. shared memory 折半归约（需 `__syncthreads()`）
3. warp shuffle（`__shfl_down_sync` / `__shfl_xor_sync`，warp 内免同步）
4. 加 float4 向量化访存

### 3. LayerNorm / RMSNorm

- 本质是"每行求均值方差 + 归约"，是 reduce 的直接延伸
- 26 秋招面经："手写 RMSNorm CUDA Kernel"（[知乎：AI infra 26秋招面经](https://zhuanlan.zhihu.com/p/2017740483217081305)）
- 变形考法：要求用 SIMD 向量指令（vadd/vsub/vmul/vdiv）写 LayerNorm，不提供 sqrt，需自己牛顿迭代（社招面经）

## 三、中频题

### 1. SGEMM（矩阵乘）

- 层级：naive → block tile（shared memory）→ thread tile（寄存器分块）
- 常见 follow-up：**Split-K**、float4 向量化、双缓冲
- 面试官能一眼看出你是背的还是理解的，背熟 block tile 的 index 会被快速跳到下一题（知乎 AI infra 面试经验贴）
- 美团北斗考过"GEMM base 版本 + 讲优化方法"（[美团北斗 AI Infra 校招面经](http://ningzhengsheng.cn/2026/04/16/%E9%9D%A2%E8%AF%95%E5%AE%9D%E5%85%B8/AI%20Infra/AIInfra%E9%9D%A2%E7%BB%8F/%E7%BE%8E%E5%9B%A2_%E5%8C%97%E6%96%97_AI_Infra_%E6%A0%A1%E6%8B%9B/)）

### 2. 矩阵转置 transpose

- 考点：全局内存合并访存（读写不能同时合并时优先合并写入）、shared memory 中转、padding 解决 bank conflict

### 3. GEMV（矩阵乘向量）

- 一个 warp 负责一行，可拓展到"二维矩阵按行归约"这类变形题

### 4. FlashAttention / online softmax

- 推理岗越来越常考，至少能手写 online softmax 的分块递推

### 5. Scan（前缀和）

- 知乎面经中标注出现两次

### 6. Top-K

- 堆 / 部分排序；变形：Top-P 采样、MoE Top-K 路由

### 7. Histogram

- shared memory 私有化（privatization）+ 原子操作合并，考察 atomic 冲突优化

## 四、低频但出现过

| 题目 | 说明 |
|------|------|
| elementwise（vector add / relu / sigmoid） | 百度一面考过 vector add；追问 float4 向量化（注意是 **grid 除 4** 而不是 block 除 4，否则降低 occupancy） |
| avg pooling、bbox IoU | CUDA 实现（CV 部署岗） |
| NMS、conv2d、双线性插值 | 不好用 CUDA 写，要求 C++ 实现 |
| dot product | reduce 的直接应用 |
| 量化 / 反量化 kernel | 推理优化岗 |
| RoPE | 大模型算子岗 |

（参考：[GitHub：CUDA-Learn-Note](https://github.com/hypertseng/CUDA-Learn-Note) 的大模型手撕 CUDA 清单）

## 五、LeetGPU 题目对照

对照 [leetgpu-challenges](https://github.com/AlphaGPU/leetgpu-challenges) 题目目录（编号即 LeetGPU 题目编号），本专题各题在 LeetGPU 上的对应关系如下。刷题时可直接对照<a href="/problems/gpu/">本站题解列表</a>。

### 高频题

| 本专题题目 | LeetGPU 对应题 |
|------------|----------------|
| Softmax | <a href="/problems/gpu/medium/5-softmax">#5 Softmax</a>（medium） |
| online softmax | 无独立题，最接近 <a href="/problems/gpu/medium/6-softmax-attention">#6 Softmax Attention</a> |
| Reduce（sum/max） | <a href="/problems/gpu/medium/4-reduction">#4 Reduction</a>（medium，求和归约） |
| LayerNorm | <a href="/problems/gpu/medium/115-layer-normalization">#115 Layer Normalization</a>（medium）；同类 <a href="/problems/gpu/medium/40-batch-normalization">#40 Batch Normalization</a>、<a href="/problems/gpu/medium/105-group-normalization">#105 Group Normalization</a> |
| RMSNorm | <a href="/problems/gpu/medium/50-rms-normalization">#50 RMS Normalization</a>（medium）、<a href="/problems/gpu/medium/116-fused-add-rmsnorm">#116 Fused Add RMSNorm</a>（融合残差加 + RMSNorm） |

### 中频题

| 本专题题目 | LeetGPU 对应题 |
|------------|----------------|
| SGEMM | <a href="/problems/gpu/easy/2-matrix-multiplication">#2 Matrix Multiplication</a>（easy，含 TF32 Tensor Core 版）、<a href="/problems/gpu/medium/22-gemm">#22 GEMM</a>（medium，带 alpha/beta）、<a href="/problems/gpu/medium/30-batched-matrix-multiplication">#30 Batched MatMul</a>、<a href="/problems/gpu/medium/57-fp16-batched-matmul">#57 FP16 Batched MatMul</a>；量化路径 <a href="/problems/gpu/medium/32-int8-quantized-matmul">#32 INT8 Quantized MatMul</a>、<a href="/problems/gpu/medium/81-int4-matmul">#81 INT4 MatMul</a>；Split-K 无直接对应 |
| 矩阵转置 | <a href="/problems/gpu/easy/3-matrix-transpose">#3 Matrix Transpose</a>（easy） |
| GEMV | <a href="/problems/gpu/medium/114-gemv">#114 GEMV</a>（medium）；同类 <a href="/problems/gpu/medium/17-dot-product">#17 Dot Product</a>、<a href="/problems/gpu/medium/18-sparse-matrix-vector-multiplication">#18 Sparse Matrix-Vector Multiplication</a>（SpMV）、<a href="/problems/gpu/medium/75-sparse-matrix-dense-matrix-multiplication">#75 Sparse Matrix-Dense Matrix Multiplication</a> |
| FlashAttention / attention | <a href="/problems/gpu/medium/6-softmax-attention">#6 Softmax Attention</a>、<a href="/problems/gpu/hard/109-attention">#109 Attention</a>（hard）、<a href="/problems/gpu/hard/53-casual-attention">#53 Causal Self-Attention</a>（hard）、<a href="/problems/gpu/hard/12-multi-head-attention">#12 Multi-Head Attention</a>（hard）、<a href="/problems/gpu/hard/26-multi-head-cross-attention">#26 Multi-Head Cross Attention</a>、<a href="/problems/gpu/medium/80-grouped-query-attention">#80 Grouped Query Attention</a>、<a href="/problems/gpu/hard/59-sliding-window-attn">#59 Sliding Window Attention</a>、<a href="/problems/gpu/hard/56-linear-attention">#56 Linear Attention</a>、<a href="/problems/gpu/medium/112-attention-with-sinks">#112 Attention with Sinks</a>、<a href="/problems/gpu/medium/111-softmax-attention-backward">#111 Softmax Attention Backward</a>（反向传播） |
| Scan（前缀和） | <a href="/problems/gpu/medium/16-prefix-sum">#16 Prefix Sum</a>（medium）、<a href="/problems/gpu/medium/70-segmented-prefix-sum">#70 Segmented Prefix Sum</a> |
| Top-K | <a href="/problems/gpu/medium/29-top-k-selection">#29 Top-K Selection</a>（medium）、<a href="/problems/gpu/medium/60-top-p-sampling">#60 Top-P Sampling</a>、<a href="/problems/gpu/medium/67-moe-topk-gating">#67 MoE Top-K Gating</a> |
| Histogram | <a href="/problems/gpu/medium/13-histogramming">#13 Histogramming</a>（medium） |

### 低频题

| 本专题题目 | LeetGPU 对应题 |
|------------|----------------|
| vector add | <a href="/problems/gpu/easy/1-vector-add">#1 Vector Addition</a>（easy） |
| relu / sigmoid | <a href="/problems/gpu/easy/21-relu">#21 ReLU</a>、<a href="/problems/gpu/easy/23-leaky-relu">#23 Leaky ReLU</a>、<a href="/problems/gpu/easy/68-sigmoid">#68 Sigmoid</a>；同类还有 <a href="/problems/gpu/easy/52-silu">#52 SiLU</a>、<a href="/problems/gpu/easy/54-swiglu">#54 SwiGLU</a>、<a href="/problems/gpu/easy/65-geglu">#65 GeGLU</a> |
| avg pooling | 无 avg pooling 题；只有 <a href="/problems/gpu/medium/42-2d-max-pooling">#42 2D Max Pooling</a> |
| bbox IoU | **无对应题** |
| NMS | **无对应题** |
| conv2d | <a href="/problems/gpu/medium/10-2d-convolution">#10 2D Convolution</a>（medium）；另有 <a href="/problems/gpu/easy/9-1d-convolution">#9 1D Convolution</a>、<a href="/problems/gpu/medium/11-3d-convolution">#11 3D Convolution</a> |
| 双线性插值 | **无对应题**（图像类仅有 <a href="/problems/gpu/medium/28-gaussian-blur">#28 Gaussian Blur</a>、<a href="/problems/gpu/easy/66-rgb-to-grayscale">#66 RGB to Grayscale</a>） |
| dot product | <a href="/problems/gpu/medium/17-dot-product">#17 Dot Product</a>、<a href="/problems/gpu/medium/58-fp16-dot-product">#58 FP16 Dot Product</a> |
| 量化 / 反量化 kernel | <a href="/problems/gpu/medium/64-weight-dequantization">#64 Weight Dequantization</a>、<a href="/problems/gpu/medium/32-int8-quantized-matmul">#32 INT8 Quantized MatMul</a>、<a href="/problems/gpu/medium/81-int4-matmul">#81 INT4 MatMul</a>、<a href="/problems/gpu/medium/96-int8-kv-cache-attention">#96 INT8 KV-Cache Attention</a> |
| RoPE | <a href="/problems/gpu/medium/61-rope-embedding">#61 RoPE Embedding</a>（medium）；另有 <a href="/problems/gpu/medium/55-attn-w-linear-bias">#55 Attention with Linear Bias</a>（ALiBi） |
| Argmax | <a href="/problems/gpu/medium/107-argmax">#107 Argmax</a>（medium） |
| 排序 / 选择 | <a href="/problems/gpu/hard/15-sorting">#15 Sorting</a>（hard）、<a href="/problems/gpu/hard/36-radix-sort">#36 Radix Sort</a>、<a href="/problems/gpu/medium/71-parallel-merge">#71 Parallel Merge</a>、<a href="/problems/gpu/medium/72-stream-compaction">#72 Stream Compaction</a>（filter） |
| 损失函数 | <a href="/problems/gpu/medium/25-categorical-cross-entropy-loss">#25 Categorical Cross Entropy</a>、<a href="/problems/gpu/medium/27-mean-squared-error">#27 Mean Squared Error</a> |

### 大模型推理与训练方向

以下题目在 LeetGPU 上已有题解，覆盖当前大模型推理/训练岗的高频考点，刷题时建议按方向归类练习。

| 方向 | LeetGPU 对应题 |
|------|----------------|
| Transformer block | <a href="/problems/gpu/hard/74-gpt2-block">#74 GPT-2 Block</a>（hard）、<a href="/problems/gpu/hard/93-llama-transformer-block">#93 Llama Transformer Block</a>（hard）、<a href="/problems/gpu/medium/76-adder-transformer">#76 Adder Transformer</a> |
| 算子融合 | <a href="/problems/gpu/medium/113-fused-qkv-projection">#113 Fused QKV Projection</a>、<a href="/problems/gpu/medium/116-fused-add-rmsnorm">#116 Fused Add RMSNorm</a>、<a href="/problems/gpu/medium/84-swiglu-mlp-block">#84 SwiGLU MLP Block</a>、<a href="/problems/gpu/medium/85-lora-linear">#85 LoRA Linear</a> |
| SSM / Mamba | <a href="/problems/gpu/medium/94-ssm-selective-scan">#94 SSM Selective Scan</a>、<a href="/problems/gpu/medium/82-linear-recurrence">#82 Linear Recurrence</a> |
| RLHF / RL 损失 | <a href="/problems/gpu/medium/107-ppo-clipped-surrogate-loss">#107 PPO Clipped Surrogate Loss</a>、<a href="/problems/gpu/medium/108-dpo-sequence-loss">#108 DPO Sequence Loss</a>、<a href="/problems/gpu/medium/109-grpo-surrogate-loss">#109 GRPO Surrogate Loss</a>、<a href="/problems/gpu/medium/110-gae-reverse-scan">#110 GAE Reverse Scan</a> |
| 推测解码 | <a href="/problems/gpu/medium/87-speculative-decoding-verification">#87 Speculative Decoding Verification</a> |
| Embedding | <a href="/problems/gpu/medium/106-token-embedding-layer">#106 Token Embedding Layer</a> |
| 因果卷积 | <a href="/problems/gpu/medium/90-causal-depthwise-conv1d">#90 Causal Depthwise Conv1d</a> |
| FFT | <a href="/problems/gpu/hard/39-fast-fourier-transform">#39 Fast Fourier Transform</a>（hard）、<a href="/problems/gpu/medium/78-2d-fft">#78 2D FFT</a> |
| 图算法 | <a href="/problems/gpu/hard/46-bfs-shortest-path">#46 BFS Shortest Path</a>、<a href="/problems/gpu/hard/73-all-pairs-shortest-paths">#73 All Pairs Shortest Paths</a> |
| 统计 / 归约变体 | <a href="/problems/gpu/medium/43-count-array-element">#43 Count Array Element</a>、<a href="/problems/gpu/medium/44-count-2d-array-element">#44 Count 2D</a>、<a href="/problems/gpu/medium/45-count-3d-array-element">#45 Count 3D</a>、<a href="/problems/gpu/medium/47-subarray-sum">#47 Subarray Sum</a>、<a href="/problems/gpu/medium/51-max-subarray-sum">#51 Max Subarray Sum</a> |
| 数值 / 其他 | <a href="/problems/gpu/medium/35-monte-carlo-integration">#35 Monte Carlo Integration</a>、<a href="/problems/gpu/medium/37-matrix-power">#37 Matrix Power</a>、<a href="/problems/gpu/medium/38-nearest-neighbor">#38 Nearest Neighbor</a>、<a href="/problems/gpu/hard/20-kmeans-clustering">#20 K-Means Clustering</a>、<a href="/problems/gpu/hard/14-multi-agent-sim">#14 Multi-Agent Simulation</a>、<a href="/problems/gpu/medium/69-jacobi-stencil-2d">#69 2D Jacobi Stencil</a>、<a href="/problems/gpu/medium/33-ordinary-least-squares">#33 Ordinary Least Squares</a>、<a href="/problems/gpu/medium/34-logistic-regression">#34 Logistic Regression</a> |

### 覆盖情况小结

- **完全覆盖**：softmax、reduce、LayerNorm、RMSNorm、matmul/gemm（含 Tensor Core / 量化路径）、transpose、GEMV、scan、vector add、relu/sigmoid、conv1d/2d/3d、histogram、dot product、top-k、量化/反量化、RoPE、argmax、排序、损失函数、transformer block、算子融合、SSM/Mamba、RLHF 损失、LoRA、embedding、attention 全变体（MHA / MQA / GQA / causal / sliding window / linear / cross / backward / sinks）
- **部分覆盖**：avg pooling（只有 max pooling）、online softmax（用 softmax attention 练）
- **完全缺失**：bbox IoU、NMS、双线性插值 —— 三道是 CV 部署岗的题，LeetGPU 上没有，需自己本地练

## 六、备考优先级建议

1. **第一梯队**：softmax、reduce、layernorm/rmsnorm —— 归约这一脉，warp shuffle 写法必须形成肌肉记忆
2. **第二梯队**：sgemm（含 split-K、Tensor Core TF32/FP16）、transpose、gemv
3. **第三梯队**：online softmax / flash attention 思路、float4 向量化、scan、attention 变体（GQA / causal / sliding window）
4. **新兴方向**（大模型推理/训练岗加分）：算子融合（fused QKV / fused add+norm）、transformer block 手写、SSM/Mamba selective scan、RLHF 损失（PPO/DPO/GRPO）
5. **配套八股**几乎必连带问：bank conflict、block/grid size 怎么定、occupancy、合并访存、Tensor Core（TF32/FP16/BF16）

## 七、练习资源

- [Tongkaio/CUDA_Kernel_Samples](https://github.com/Tongkaio/CUDA_Kernel_Samples)：面试高频算子从 naive 到优化版的完整代码（elementwise / reduce / softmax / transpose / sgemm / gemv）
- [hypertseng/CUDA-Learn-Note](https://github.com/hypertseng/CUDA-Learn-Note)：大模型手撕 CUDA 笔记（flash_attn、sgemm、warp/block reduce、softmax、layernorm、rmsnorm、histogram 等）
- [LeetGPU](https://leetgpu.com/)：在线 CUDA 刷题平台，本站即为配套题解

---

## 参考资料

- [牛客：CUDA算子手撕与面试](https://www.nowcoder.com/discuss/697901950464954368)
- [牛客：模型部署/推理优化/高性能计算方向社招面经总结](https://www.nowcoder.com/discuss/599177965083054080)
- [牛客：【暑期实习】百度AI Infra 一面复盘](https://www.nowcoder.com/discuss/875003802187792384)
- [知乎：AI infra 面试经验贴](https://zhuanlan.zhihu.com/p/1970722821522061231)
- [知乎：AI infra 26秋招面经](https://zhuanlan.zhihu.com/p/2017740483217081305)
- [知乎：2025 春招实习面经汇总](https://zhuanlan.zhihu.com/p/1896206045161952147)
- [知乎：大模型AI Infra方向面试会有哪些经常提问的问题](https://www.zhihu.com/question/1916645420085514580/answer/1973151683002524617)
- [美团北斗 AI Infra 校招面经](http://ningzhengsheng.cn/2026/04/16/%E9%9D%A2%E8%AF%95%E5%AE%9D%E5%85%B8/AI%20Infra/AIInfra%E9%9D%A2%E7%BB%8F/%E7%BE%8E%E5%9B%A2_%E5%8C%97%E6%96%97_AI_Infra_%E6%A0%A1%E6%8B%9B/)
