// knowledge-points.ts —— 知识点受控词表与「标签 → 知识点」规则映射。
// 独立成文件便于人工维护：新增映射时改这里即可，backfill/lint/stats 共用。
//
// 映射来源（03-data-model.md §知识点标签）：
//   - leetgpu 知识领域地图（SKILL.md §1.5，A–L 领域）→ GPU_DOMAINS + 运行时解析
//   - ai-infra-notes 10 周主题 + 专题 → WEEK_KP / TOPIC_KP
//   - leetcode 标签体系 → ALGO_TAG_MAP（覆盖高频标签，长尾走 slugify 兜底）
//
// 未命中映射的标签会 slugify 后保留，并由 backfill 输出未映射清单供人工补充进
// ALGO_TAG_MAP / GPU_TAG_MAP；lint 对词表外知识点只汇总告警（长尾标签是常态）。

// ───────────────────────────── 通用 ─────────────────────────────

/** 非知识点标签（元信息/模板残留），提取时丢弃 */
export const IGNORE_TAGS: RegExp[] = [
  /^<.*>$/, // 模板占位符残留，如 <概念标签1>
  /^LeetCode 锁题$/,
  /^第\s*\d+\s*场周赛$/,
];

/** 标签清洗：去反引号、去多余空白（保留原文用于 tags 字段展示） */
export function cleanTag(s: string): string {
  return s.replace(/`/g, "").replace(/\s+/g, " ").trim();
}

/** 标签 → 知识点 slug 的兜底转换 */
export function slugifyTag(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/\(([^)]*)\)/g, "-$1") // 堆（优先队列）→ 堆-优先队列
    .replace(/（([^）]*)）/g, "-$1")
    .replace(/[\s/、,，+]+/g, "-")
    .replace(/[^\p{L}\p{N}.-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ───────────────────────────── 算法标签映射 ─────────────────────────────

/**
 * 高频算法/SQL/JS 标签 → 知识点 slug。
 * key 为清洗后的标签原文；先精确匹配，再小写匹配（map 中附小写别名）。
 */
export const ALGO_TAG_MAP: Record<string, string> = {
  // 数据结构
  数组: "array", 字符串: "string", 哈希表: "hash-table", 哈希: "hash-table",
  哈希函数: "hash-function", 哈希集合: "hash-set", 哈希分组: "hash-grouping",
  链表: "linked-list", 双向链表: "doubly-linked-list", 反转链表: "linked-list-reversal",
  栈: "stack", 单调栈: "monotonic-stack", 队列: "queue", 单调队列: "monotonic-queue",
  双端队列: "deque", 堆: "heap", "堆（优先队列）": "heap", 优先队列: "heap",
  "堆/优先队列": "heap", 堆优先队列: "heap", 堆归约: "heap-reduction", 双堆: "two-heaps",
  树: "tree", 二叉树: "binary-tree", 二叉搜索树: "bst", BST: "bst", "二叉搜索树（BST）": "bst",
  平衡二叉树: "balanced-bst", 平衡树: "balanced-tree", "N 叉树": "n-ary-tree", N叉树: "n-ary-tree",
  字典树: "trie", "字典树（Trie）": "trie", "字典树（0-1 Trie）": "01-trie",
  线段树: "segment-tree", 树状数组: "fenwick-tree", "树状数组（BIT）": "fenwick-tree",
  李超线段树: "li-chao-tree", 并查集: "union-find", "并查集（隐式）": "union-find",
  带权并查集: "weighted-union-find", 有序集合: "ordered-set", 有序表: "ordered-set",
  稀疏表: "sparse-table", "ST 表（稀疏表）": "sparse-table", 四叉树: "quadtree",
  // 算法范式
  动态规划: "dynamic-programming", 记忆化搜索: "memoization", 记忆化: "memoization",
  状态压缩: "bitmask-dp", "状态压缩 DP": "bitmask-dp", "数位 DP": "digit-dp", 数位: "digit-dp",
  "区间 DP": "interval-dp", 区间DP: "interval-dp", "网格 DP": "grid-dp", "二维 DP": "2d-dp",
  "树形 DP": "tree-dp", 树形动态规划: "tree-dp", "状态机 DP": "state-machine-dp", 状态机: "state-machine",
  "计数 DP": "counting-dp", 计数DP: "counting-dp", "划分型 DP": "partition-dp", "分割型 DP": "partition-dp",
  切分型DP: "partition-dp", "博弈型区间 DP": "game-interval-dp", "背包": "knapsack", 背包问题: "knapsack",
  "0-1 背包": "01-knapsack", 完全背包: "unbounded-knapsack", 分组背包: "grouped-knapsack",
  多重背包: "bounded-knapsack", 换根DP: "reroot-dp", "换根 DP": "reroot-dp", 滚动数组: "rolling-array",
  "轮廓线 DP": "broken-profile-dp", "概率 DP": "probability-dp", "可达和 DP": "reachable-sum-dp",
  "环形 DP": "circular-dp", 递推: "recurrence",
  贪心: "greedy", 交换论证: "exchange-argument", 二分查找: "binary-search", 二分: "binary-search",
  二分答案: "binary-search-answer", 三分搜索: "ternary-search", "WQS 二分（带权二分）": "wqs-binary-search",
  带权二分: "wqs-binary-search",
  分治: "divide-and-conquer", 分治合并: "divide-and-conquer", 多路归并: "multiway-merge",
  归并排序: "merge-sort", 归并: "merge", 快速排序: "quicksort", 快速选择: "quickselect",
  排序: "sorting", 自定义比较器: "custom-comparator", 自定义排序: "custom-comparator",
  计数排序: "counting-sort", 桶排序: "bucket-sort", 基数排序: "radix-sort", 稳定排序: "stable-sort",
  插入排序: "insertion-sort", 双指针: "two-pointers", 三指针: "three-pointers", 快慢指针: "fast-slow-pointers",
  "快慢指针（Floyd 判圈）": "floyd-cycle-detection", "Floyd 判圈": "floyd-cycle-detection",
  滑动窗口: "sliding-window", 定长滑窗: "fixed-window", 前缀和: "prefix-sum", 二维前缀和: "2d-prefix-sum",
  差分数组: "difference-array", 差分: "difference-array", 二维差分: "2d-difference", 前缀异或: "prefix-xor",
  前后缀分解: "prefix-suffix-decomposition", 前缀积: "prefix-product", 前缀最值: "prefix-extremum",
  后缀和: "suffix-sum", 回溯: "backtracking", 剪枝: "pruning", 深度优先搜索: "dfs", DFS: "dfs",
  "深度优先搜索（DFS）": "dfs", 深度优先: "dfs", 广度优先搜索: "bfs", BFS: "bfs",
  "广度优先搜索（BFS）": "bfs", 多源BFS: "multi-source-bfs", "多源 BFS": "multi-source-bfs",
  "双向 BFS": "bidirectional-bfs", "0-1 BFS": "01-bfs",
  枚举: "enumeration", 暴力枚举: "brute-force", 暴力: "brute-force", 子集枚举: "subset-enumeration",
  二进制枚举: "bitmask-enumeration", 组合枚举: "combination-enumeration", 递归: "recursion",
  模拟: "simulation", 构造: "construction", 思维题: "constructive-thinking", 逆向思维: "reverse-thinking",
  补集转化: "complement", 分类讨论: "case-analysis", 贡献法: "contribution-technique",
  "贡献法（计数）": "contribution-technique", 贡献计数: "contribution-technique",
  扫描线: "sweep-line", 离散化: "discretization", 坐标压缩: "coordinate-compression",
  离线查询: "offline-queries", 离线处理: "offline-processing", 莫队算法: "mo-algorithm",
  "莫队算法（平方分解）": "mo-algorithm", 根号分治: "sqrt-decomposition", "根号分治（Sqrt Decomposition）": "sqrt-decomposition",
  分块: "sqrt-decomposition", 倍增: "binary-lifting", 二分提升: "binary-lifting",
  "Meet in the Middle": "meet-in-the-middle", 状态空间搜索: "state-space-search", 搜索: "search",
  // 数学
  数学: "math", 数论: "number-theory", 质因数分解: "prime-factorization", 质数判定: "primality",
  素性测试: "primality", 埃氏筛: "sieve", 埃拉托斯特尼筛: "sieve", 最大公约数: "gcd",
  GCD: "gcd", gcd: "gcd", 欧几里得算法: "euclidean-algorithm", "欧几里得算法（GCD）": "euclidean-algorithm",
  辗转相减: "euclidean-algorithm", 辗转相除法: "euclidean-algorithm", 最小公倍数: "lcm",
  快速幂: "fast-power", 矩阵快速幂: "matrix-fast-power", 组合数学: "combinatorics", 组合计数: "combinatorics",
  排列组合: "combinatorics", 排列: "permutation", 隔板法: "stars-and-bars", 插板法: "stars-and-bars",
  容斥原理: "inclusion-exclusion", 卡塔兰数: "catalan", 卡特兰数: "catalan", 康托展开: "cantor-expansion",
  "阶乘进制（康托尔展开）": "cantor-expansion", 费马小定理: "fermat-little-theorem", 模逆: "mod-inverse",
  模逆元: "mod-inverse", 中国剩余定理: "crt", 欧拉函数: "euler-totient", 同余定理: "modular-arithmetic",
  取模: "modular-arithmetic", 取模运算: "modular-arithmetic", 模运算: "modular-arithmetic",
  位运算: "bit-manipulation", 位掩码: "bitmask", 异或: "xor", 异或性质: "xor", lowbit: "lowbit",
  popcount: "popcount", 按位贡献: "bit-contribution", 几何: "geometry", 计算几何: "computational-geometry",
  凸包: "convex-hull", 叉积: "cross-product", 曼哈顿距离: "manhattan-distance",
  概率与随机: "probability", 概率: "probability", 随机化: "randomized", 拒绝采样: "rejection-sampling",
  逆变换采样: "inverse-transform-sampling", 蓄水池抽样: "reservoir-sampling", "水塘/蓄水池抽样": "reservoir-sampling",
  "Fisher-Yates 洗牌": "fisher-yates-shuffle", 期望: "expectation",
  // 字符串算法
  字符串匹配: "string-matching", KMP: "kmp", "KMP 模式匹配": "kmp", KMP自动机: "kmp-automaton",
  "KMP 自动机": "kmp-automaton", "扩展 KMP": "z-function", "Z 函数": "z-function",
  "Z 函数（扩展 KMP）": "z-function", 滚动哈希: "rolling-hash", 字符串哈希: "string-hashing",
  "Rabin-Karp": "rabin-karp", Manacher: "manacher", "Manacher 算法": "manacher", 回文: "palindrome",
  回文数: "palindrome", 中心扩展: "center-expansion", 后缀数组: "suffix-array", "AC 自动机": "ac-automaton",
  自动机: "automaton", 正则表达式: "regex", 最长公共子序列: "lcs", LCS: "lcs",
  最长递增子序列: "lis", LIS: "lis", 最长上升子序列: "lis", 最长公共前缀: "lcp",
  字典序: "lexicographic-order", 最小循环表示: "minimal-rotation", "Booth 算法": "booth-algorithm",
  // 图论
  图: "graph", 图论: "graph", 拓扑排序: "topological-sort", "拓扑排序（剥叶）": "topological-sort",
  最短路径: "shortest-path", 最短路: "shortest-path", Dijkstra: "dijkstra", "Dijkstra 变体": "dijkstra",
  多源Dijkstra: "multi-source-dijkstra", "多源 Dijkstra": "multi-source-dijkstra",
  "Bellman-Ford": "bellman-ford", "Floyd-Warshall": "floyd-warshall", 最小生成树: "mst",
  Kruskal: "kruskal", "Kruskal 算法": "kruskal", "Prim 算法": "prim", 二分图: "bipartite-graph",
  二分图匹配: "bipartite-matching", 匈牙利算法: "hungarian-algorithm", 连通分量: "connected-components",
  连通性: "connectivity", 强连通分量: "scc", "Tarjan 算法": "tarjan", 桥: "bridge", 割点: "articulation-point",
  欧拉路径: "eulerian-path", 欧拉回路: "eulerian-circuit", Hierholzer: "hierholzer",
  网络流: "network-flow", 最大流: "max-flow", 最小费用最大流: "min-cost-max-flow", 最小费用流: "min-cost-flow",
  并查集重构树: "kruskal-reconstruction-tree", "Kruskal 重构树": "kruskal-reconstruction-tree",
  最近公共祖先: "lca", LCA: "lca", "最近公共祖先 LCA": "lca", 树的直径: "tree-diameter",
  内向基环树: "functional-graph", 内向基环森林: "functional-graph", 函数图: "functional-graph",
  隐式图: "implicit-graph", 网格图: "grid-graph", 分层图: "layered-graph", 并查集隐式: "union-find",
  // 遍历
  前序遍历: "preorder-traversal", 中序遍历: "inorder-traversal", 后序遍历: "postorder-traversal",
  树遍历: "tree-traversal", 层序遍历: "level-order-traversal", "Morris 遍历": "morris-traversal",
  二叉树序列化: "tree-serialization", 序列化: "serialization", 反序列化: "deserialization",
  // 设计/杂项
  设计: "design", 数据流: "data-stream", 中位数: "median", 双堆求中位数: "two-heaps",
  脑筋急转弯: "brainteaser", 博弈: "game-theory", 博弈论: "game-theory", Minimax: "minimax",
  minimax: "minimax", 极小化极大: "minimax", "Sprague-Grundy": "sprague-grundy",
  "Kadane 算法": "kadane", Kadane: "kadane", "Kadane 变体": "kadane", "Boyer-Moore 投票算法": "boyer-moore-voting",
  消除法: "elimination", 计数: "counting", 频率统计: "frequency-counting", 预处理: "preprocessing",
  区间合并: "interval-merge", 区间调度: "interval-scheduling", 区间: "interval", 区间覆盖: "interval-covering",
  区间问题: "interval", 单调性: "monotonicity", 单调性优化: "monotonicity", 数学观察: "math-observation",
  // SQL / 数据库
  SQL: "sql", 数据库: "database", "GROUP BY": "group-by", 聚合: "aggregation", 聚合函数: "aggregate-function",
  条件聚合: "conditional-aggregation", 窗口函数: "window-function", 子查询: "subquery",
  相关子查询: "correlated-subquery", JOIN: "join", "多表 JOIN": "multi-join", 多表关联: "multi-join",
  多表连接: "multi-join", "LEFT JOIN": "left-join", 自连接: "self-join", "自连接（Self-Join）": "self-join",
  "自连接（self-join）": "self-join", "Self JOIN": "self-join", "CROSS JOIN": "cross-join",
  "INNER JOIN": "inner-join", CTE: "cte", "递归 CTE": "recursive-cte", "WITH RECURSIVE": "recursive-cte",
  HAVING: "having", COUNT: "count", SUM: "sum", AVG: "avg", MIN: "min", MAX: "max",
  "COUNT(DISTINCT)": "count-distinct", DISTINCT: "distinct", 去重: "dedup", 去重计数: "distinct-count",
  "ORDER BY": "order-by", LIMIT: "limit", "ROW_NUMBER": "row-number", RANK: "rank", DENSE_RANK: "dense-rank",
  LAG: "lag", LEAD: "lead", "PARTITION BY": "partition-by", "CASE WHEN": "case-when", "IFNULL": "ifnull",
  "COALESCE": "coalesce", "NULL 处理": "null-handling", "NOT EXISTS": "not-exists", "NOT IN": "not-in",
  EXISTS: "exists", "UNION": "union", "UNION ALL": "union-all", "GROUP_CONCAT": "group-concat",
  日期函数: "date-function", 日期处理: "date-function", "DATEDIFF": "datediff", "TIMESTAMPDIFF": "timestampdiff",
  行转列: "pivot", 列转行: "unpivot", UNPIVOT: "unpivot", 反连接: "anti-join", "反连接（anti-join）": "anti-join",
  "反连接（Anti-Join）": "anti-join", 关系除法: "relational-division", "Gaps & Islands": "gaps-and-islands",
  "Gaps and Islands": "gaps-and-islands", "gaps-and-islands": "gaps-and-islands", "islands-and-gaps": "gaps-and-islands",
  连续性问题: "gaps-and-islands", 连续区间判定: "gaps-and-islands", 留存率: "retention", 留存分析: "retention",
  存储过程: "stored-procedure", 存储函数: "stored-function", "动态 SQL": "dynamic-sql", 游标: "cursor",
  MySQL: "mysql", 索引: "indexing", SARGable: "sargable", 三值逻辑: "three-valued-logic",
  Pandas: "pandas", pandas: "pandas", DataFrame: "pandas", "DataFrame 重塑": "pandas-reshaping",
  数据重塑: "pandas-reshaping", "透视（长表转宽表）": "pandas-pivot", melt: "pandas-melt", 向量化: "vectorization",
  向量化运算: "vectorization",
  // JavaScript / 前端面试题
  JavaScript: "javascript", 闭包: "closure", "this 绑定": "this-binding", 原型链: "prototype-chain",
  原型: "prototype", "原型扩展": "prototype", Promise: "promise", "Promise.race": "promise",
  "async/await": "async-await", 异步: "async", 异步编程: "async", 事件循环: "event-loop",
  防抖: "debounce", 节流: "throttle", 定时器: "timer", 迭代器: "iterator", 生成器: "generator",
  "生成器（Generator）": "generator", 函数式编程: "functional-programming", 高阶函数: "higher-order-function",
  柯里化: "currying", 装饰器模式: "decorator-pattern", "代理（Proxy）": "proxy", Proxy: "proxy",
  深拷贝: "deep-clone", 深拷贝优化: "deep-clone", 不可变数据: "immutability", 不可变性: "immutability",
  类型转换: "type-coercion", 类型判断: "type-checking", 类型分派: "type-dispatch",
  "发布订阅": "pub-sub", "事件驱动": "event-driven", "模块模式": "module-pattern", 并发: "concurrency",
  并发控制: "concurrency-control", 多线程: "multithreading", 互斥锁: "mutex", 信号量: "semaphore",
  条件变量: "condition-variable", 死锁: "deadlock", 线程池: "thread-pool", 线程同步: "thread-synchronization",
  Shell: "shell", awk: "awk", sed: "sed", grep: "grep", "Unix 管道": "unix-pipe", 正则: "regex",
  // 补充批次（backfill 首跑后按未映射频次回填）
  矩阵: "matrix", 一次遍历: "one-pass", 两次遍历: "two-pass", ROUND: "round", "ROUND()": "round",
  交互: "interactive", "交互式 API": "interactive", "WHERE 过滤": "where-filter", WHERE: "where-filter",
  "GROUP BY + HAVING": "group-by-having", 网格: "grid", "GROUP BY 聚合": "group-by",
  JSON: "json", "IS NULL": "is-null", 累计求和: "running-sum", "ROW_NUMBER()": "row-number",
  字符串处理: "string-processing", 遍历: "traversal", 原地哈希: "in-place-hash", 原地标记: "in-place-marking",
  原地算法: "in-place", 分组求最值: "group-extremum", "分组 Top-K": "group-topk", "分组 Top-1": "group-top1",
  "Top-1 per group": "group-top1", "分组 Top-N": "group-topn", 指针操作: "pointer-manipulation",
  指针: "pointer-manipulation", "IFNULL/COALESCE": "null-coalescing", "IF/CASE": "case-when",
  聚合求和: "aggregation", 单表查询: "single-table-query", "RANK()": "rank", 不变量: "invariant",
  环形数组: "circular-array", 子序列匹配: "subsequence-matching", "SUM OVER": "window-sum",
  "SUM(IF)": "conditional-sum", "DATE_FORMAT": "date-format", "NOT IN 的 NULL 陷阱": "not-in-null-trap",
  CONCAT: "concat", 区间重叠: "interval-overlap", setTimeout: "settimeout", 对象: "object",
  "LAG()": "lag", "窗口函数 LAG": "window-lag", SUBSTRING_INDEX: "substring-index", predicate: "predicate",
  逆序对: "inversion-pair", 二进制: "binary", 等差数列: "arithmetic-sequence", 因数: "factors",
  奇偶性: "parity", 边界处理: "boundary-handling", ABS: "abs", Pivot: "pivot", 进制转换: "base-conversion",
  日期过滤: "date-filter", 日期: "date-function", "AVG 聚合": "avg", 布尔转比例: "bool-to-ratio",
  加权平均: "weighted-average", 序列生成: "sequence-generation", "LEAST/GREATEST": "least-greatest",
  枚举优化: "enumeration", 笛卡尔积: "cross-join", "YEAR()/MONTH()": "year-month", "MAX()": "max",
  索引映射: "index-mapping", 集合: "set", 字符串拼接: "string-concat", 函数: "function",
  分组聚合: "group-by", "ORDER BY 排序": "order-by", CEIL: "ceil", 双键排序: "multi-key-sort",
  "warp divergence": "warp-divergence", branchless: "branchless", normalization: "normalization",
  范围求和: "range-sum", "DAG 最长路": "dag-longest-path", 状态图: "state-graph", 重排不等式: "rearrangement-inequality",
  单点更新: "point-update", 分段处理: "segmented-processing", 翻转: "reversal", "LIMIT/OFFSET": "limit-offset",
  矩阵转置: "matrix-transpose", 哑节点: "dummy-node", 按位计数: "bit-counting", 单遍扫描: "one-pass",
  对数: "logarithm",
  // GPU（出现在 algo 标签里的少量交叉标签）
  CUDA: "cuda", "memory-bound": "memory-bound", "compute-bound": "compute-bound",
  "warp shuffle": "warp-shuffle", "shared memory": "shared-memory", "Shared Memory": "shared-memory",
  "shared memory tiling": "shared-memory-tiling", "Shared Memory Tiling": "shared-memory-tiling",
  "Shared Memory Halo": "shared-memory-halo", "shared memory halo": "shared-memory-halo",
  "coalesced access": "coalesced-access", GEMM: "gemm", "kernel fusion": "kernel-fusion",
  "Kernel Fusion": "kernel-fusion", "kernel 融合": "kernel-fusion", "融合 kernel": "kernel-fusion",
  "融合 attention": "fused-attention", Attention: "attention", FlashAttention: "flash-attention",
  "Multi-Head Attention": "multi-head-attention", "online softmax": "online-softmax",
  "Online Softmax": "online-softmax", reduction: "reduction", Reduction: "reduction",
  归约: "reduction", "归约（reduction）": "reduction", "block 归约": "block-reduction",
  "Tensor Core": "tensor-core", WMMA: "wmma", "element-wise": "elementwise",
  elementwise: "elementwise", "elementwise kernel": "elementwise-kernel",
  "grid-stride": "grid-stride-loop", "grid-stride loop": "grid-stride-loop",
  "prefix sum": "prefix-sum-gpu", "Prefix Sum": "prefix-sum-gpu", Scan: "scan",
  softmax: "softmax", Softmax: "softmax", LayerNorm: "layernorm", RMSNorm: "rmsnorm",
  GroupNorm: "groupnorm", Normalization: "normalization", RoPE: "rope", GQA: "gqa",
  Transformer: "transformer", Mamba: "mamba", "State Space Model": "state-space-model",
  "Linear Attention": "linear-attention", "KV Cache": "kv-cache", "INT8 量化": "int8-quantization",
  "INT4 量化": "int4-quantization", FP16: "fp16", TF32: "tf32", "half 精度": "fp16",
  "bank conflict": "bank-conflict", tiling: "tiling", "register tiling": "register-tiling",
  "register blocking": "register-blocking", "atomicAdd": "atomic-add", "`atomicAdd`": "atomic-add",
  atomicCAS: "atomic-cas", histogram: "histogram", Histogram: "histogram", "bitonic sort": "bitonic-sort",
  "Bitonic Sort": "bitonic-sort", "Radix Sort": "radix-sort", FFT: "fft", SpMV: "spmv", SpMM: "spmm",
  CSR: "csr", 稀疏矩阵: "sparse-matrix", "Convolution": "convolution", "1D Convolution": "conv1d",
  "2D Convolution": "conv2d", "3D Convolution": "conv3d", Pooling: "pooling", GEMV: "gemv",
  "Cross Entropy": "cross-entropy", "Loss Function": "loss-function", RL: "rl", PPO: "ppo", GRPO: "grpo",
  GAE: "gae", "MoE 路由": "moe-routing", "投机解码": "speculative-decoding", "推理系统": "inference-system",
  "LLM 推理": "llm-inference", vLLM: "vllm", "PyTorch": "pytorch", SiLU: "silu", SwiGLU: "swiglu",
  GELU: "gelu", activation: "activation", 量化: "quantization", 量化推理: "quantized-inference",
  Roofline: "roofline", roofline: "roofline", "fast math": "fast-math", 数值稳定性: "numerical-stability",
  "Numerical Stability": "numerical-stability", 数值稳定: "numerical-stability",
};

// ───────────────────────────── GPU 知识领域地图 ─────────────────────────────

/**
 * leetgpu SKILL.md §1.5 的领域定义（A–L）。每道 GPU 题的归属领域由
 * gpu-skill-map.ts 在运行时解析 SKILL.md 表格得到（编号匹配为主、题名匹配兜底），
 * 本表只维护领域元数据。
 */
export const GPU_DOMAINS: Record<string, { slug: string; name: string }> = {
  A: { slug: "parallel-patterns", name: "基础并行模式（Element-wise / Memory-bound）" },
  B: { slug: "convolution-pooling", name: "卷积与池化（Convolution & Pooling）" },
  C: { slug: "reduction-scan", name: "归约与扫描（Reduction & Scan）" },
  D: { slug: "gemm", name: "矩阵乘法与 GEMM（GEMM & Matmul）" },
  E: { slug: "attention", name: "注意力机制（Attention）" },
  F: { slug: "normalization-embedding", name: "归一化与嵌入（Normalization & Embedding）" },
  G: { slug: "transformer-inference", name: "Transformer 组件与推理优化" },
  H: { slug: "quantization", name: "量化与低精度（Quantization）" },
  I: { slug: "sampling-sorting-search", name: "采样、排序与搜索" },
  J: { slug: "advanced-algorithms-math", name: "高级算法与数学" },
  K: { slug: "losses-basic-ml", name: "损失函数与基础 ML" },
  L: { slug: "simulation-misc", name: "其他综合与模拟" },
};

// ───────────────────────────── 10 周主题 / 专题 ─────────────────────────────

/**
 * GPU 领域补充表：SKILL.md §1.5 只覆盖 96 道老题，其后新增的题在这里人工补领域。
 * key 为 `${difficulty}:${目录名}`（目录序号冲突时用目录名消歧更稳）。
 */
export const GPU_DOMAIN_SUPPLEMENT: Record<string, string> = {
  "easy:vector-reversal": "A",
  "easy:scalar-multiply": "A",
  "easy:element-reversal": "A",
  "medium:argmax": "C",
  "medium:ppo-clipped-surrogate-loss": "K",
  "medium:dpo-sequence-loss": "K",
  "medium:grpo-surrogate-loss": "K",
  "medium:gae-reverse-scan": "C",
  "medium:softmax-attention-backward": "E",
  "medium:fused-qkv-projection": "E",
  "medium:layer-normalization": "F",
  "hard:multi-head-cross-attention": "E",
  "hard:attention": "E",
};

/** 每日教程每周主题 → 知识点（来自 learn/daily/weekN/README.md 的周标题） */
export const WEEK_KP: Record<number, string[]> = {
  1: ["gpu-execution-model", "memory-hierarchy"],
  2: ["kernel-optimization", "profiling"],
  3: ["tensor-core", "cutlass"],
  4: ["transformer", "triton"],
  5: ["attention", "flash-attention"],
  6: ["inference-system", "kv-cache"],
  7: ["batching", "scheduling"],
  8: ["inference-optimization", "quantization"],
  9: ["distributed-parallelism", "multi-hardware"],
  10: ["project-integration", "interview-prep"],
};

/** 每周展示用 tags */
export const WEEK_TAGS: Record<number, string[]> = {
  1: ["cuda", "gpu-execution-model", "memory-hierarchy"],
  2: ["cuda", "kernel-optimization", "nsight"],
  3: ["tensor-core", "cutlass", "wgmma"],
  4: ["transformer", "triton"],
  5: ["flash-attention", "attention"],
  6: ["inference-system", "kv-cache", "vllm"],
  7: ["batching", "scheduling"],
  8: ["quantization", "speculative-decoding"],
  9: ["distributed-parallelism", "multi-hardware"],
  10: ["project", "interview"],
};

/** 专题 slug → 知识点（默认即 slug 本身，此处只列需要纠偏的） */
export const TOPIC_KP: Record<string, string[]> = {
  "cuda-graph": ["cuda-graphs"],
  llm: ["llm"],
  deeplearning: ["deep-learning"],
  shengteng: ["ascend-npu"],
  interview: ["interview"],
  misc: [],
  cpp: ["cpp"],
  deepgemm: ["deepgemm", "gemm"],
  harness: ["evaluation-harness"],
};

// ───────────────────────────── 受控词表 ─────────────────────────────

function buildVocab(): Set<string> {
  const v = new Set<string>();
  for (const kp of Object.values(ALGO_TAG_MAP)) v.add(kp);
  for (const d of Object.values(GPU_DOMAINS)) v.add(d.slug);
  for (const kps of Object.values(WEEK_KP)) for (const kp of kps) v.add(kp);
  for (const kps of Object.values(TOPIC_KP)) for (const kp of kps) v.add(kp);
  for (const extra of [
    "profiling", "ncu", "nsys", "cuda-course", "interview-prep",
  ])
    v.add(extra);
  return v;
}

export const VOCAB: Set<string> = buildVocab();

export interface KpResult {
  kps: string[];
  /** 未命中映射、走 slugify 兜底的原始标签（供人工补充映射表） */
  unmapped: string[];
}

/** 算法/通用标签 → 知识点：先 ALGO_TAG_MAP（精确 + 小写），未命中 slugify 兜底 */
export function mapTagsToKps(tags: string[]): KpResult {
  const kps = new Set<string>();
  const unmapped: string[] = [];
  for (const raw of tags) {
    const t = cleanTag(raw);
    if (!t || IGNORE_TAGS.some((re) => re.test(t))) continue;
    const hit = ALGO_TAG_MAP[t] ?? ALGO_TAG_MAP[t.toLowerCase()];
    if (hit) kps.add(hit);
    else {
      const slug = slugifyTag(t);
      if (slug) {
        kps.add(slug);
        unmapped.push(t);
      }
    }
  }
  return { kps: [...kps].sort(), unmapped };
}
