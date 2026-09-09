# 🔥 高频算法面试题汇总

汇总各平台公认的算法面试高频题，覆盖 **LeetCode 热题 HOT 100**、**面试经典 150 题**、**CodeTop（牛客网面经题目频率统计）** 和 **剑指 Offer**。知乎、小红书上流传的「大厂高频算法题」笔记内容基本与这几份榜单一致，均已被下面的清单覆盖。

使用说明：

- 题目列链接到力扣原题；「题解」列链接到本站的详细中文题解（含思路讲解、复杂度分析、面试 Q&A）。
- 建议按 Hot 100 → CodeTop 高频补充 → 剑指 Offer 的顺序刷；也可以直接按 [10 周刷题计划](10-week-plan.md) 执行。

## 一、LeetCode 热题 HOT 100

官方榜单：[leetcode.cn/studyplan/top-100-liked](https://leetcode.cn/studyplan/top-100-liked/)。几乎每篇知乎 / 小红书 / 牛客的「面试刷题攻略」都以它为骨架，也是国内大厂面试出题的最大来源。

### 哈希

| 题目 | 难度 | 题解 |
|---|---|---|
| [1. 两数之和](https://leetcode.cn/problems/two-sum/) | 简单 | [站内题解](solution/0001-0100/1_两数之和.md) |
| [49. 字母异位词分组](https://leetcode.cn/problems/group-anagrams/) | 中等 | [站内题解](solution/0001-0100/49_字母异位词分组.md) |
| [128. 最长连续序列](https://leetcode.cn/problems/longest-consecutive-sequence/) | 中等 | [站内题解](solution/0101-0200/128_最长连续序列.md) |

### 双指针

| 题目 | 难度 | 题解 |
|---|---|---|
| [283. 移动零](https://leetcode.cn/problems/move-zeroes/) | 简单 | [站内题解](solution/0201-0300/283_移动零.md) |
| [11. 盛最多水的容器](https://leetcode.cn/problems/container-with-most-water/) | 中等 | [站内题解](solution/0001-0100/11_盛最多水的容器.md) |
| [15. 三数之和](https://leetcode.cn/problems/3sum/) | 中等 | [站内题解](solution/0001-0100/15_三数之和.md) |
| [18. 四数之和](https://leetcode.cn/problems/4sum/) | 中等 | [站内题解](solution/0001-0100/18_四数之和.md) |
| [42. 接雨水](https://leetcode.cn/problems/trapping-rain-water/) | 困难 | [站内题解](solution/0001-0100/42_接雨水.md) |
| [977. 有序数组的平方](https://leetcode.cn/problems/squares-of-a-sorted-array/) | 简单 | [站内题解](solution/0901-1000/977_有序数组的平方.md) |

### 滑动窗口

| 题目 | 难度 | 题解 |
|---|---|---|
| [3. 无重复字符的最长子串](https://leetcode.cn/problems/longest-substring-without-repeating-characters/) | 中等 | [站内题解](solution/0001-0100/3_无重复字符的最长子串.md) |
| [438. 找到字符串中所有字母异位词](https://leetcode.cn/problems/find-all-anagrams-in-a-string/) | 中等 | [站内题解](solution/0401-0500/438_找到字符串中所有字母异位词.md) |

### 子串

| 题目 | 难度 | 题解 |
|---|---|---|
| [560. 和为 K 的子数组](https://leetcode.cn/problems/subarray-sum-equals-k/) | 中等 | [站内题解](solution/0501-0600/560_和为K的子数组.md) |
| [239. 滑动窗口最大值](https://leetcode.cn/problems/sliding-window-maximum/) | 困难 | [站内题解](solution/0201-0300/239_滑动窗口最大值.md) |
| [76. 最小覆盖子串](https://leetcode.cn/problems/minimum-window-substring/) | 困难 | [站内题解](solution/0001-0100/76_最小覆盖子串.md) |

### 普通数组

| 题目 | 难度 | 题解 |
|---|---|---|
| [53. 最大子数组和](https://leetcode.cn/problems/maximum-subarray/) | 中等 | [站内题解](solution/0001-0100/53_最大子数组和.md) |
| [56. 合并区间](https://leetcode.cn/problems/merge-intervals/) | 中等 | [站内题解](solution/0001-0100/56_合并区间.md) |
| [189. 轮转数组](https://leetcode.cn/problems/rotate-array/) | 中等 | [站内题解](solution/0101-0200/189_轮转数组.md) |
| [238. 除自身以外数组的乘积](https://leetcode.cn/problems/product-of-array-except-self/) | 中等 | [站内题解](solution/0201-0300/238_除自身以外数组的乘积.md) |
| [41. 缺失的第一个正数](https://leetcode.cn/problems/first-missing-positive/) | 困难 | [站内题解](solution/0001-0100/41_缺失的第一个正数.md) |

### 矩阵

| 题目 | 难度 | 题解 |
|---|---|---|
| [73. 矩阵置零](https://leetcode.cn/problems/set-matrix-zeroes/) | 中等 | [站内题解](solution/0001-0100/73_矩阵置零.md) |
| [36. 有效的数独](https://leetcode.cn/problems/valid-sudoku/) | 中等 | [站内题解](solution/0001-0100/36_有效的数独.md) |
| [54. 螺旋矩阵](https://leetcode.cn/problems/spiral-matrix/) | 中等 | [站内题解](solution/0001-0100/54_螺旋矩阵.md) |
| [59. 螺旋矩阵 II](https://leetcode.cn/problems/spiral-matrix-ii/) | 中等 | [站内题解](solution/0001-0100/59_螺旋矩阵II.md) |
| [48. 旋转图像](https://leetcode.cn/problems/rotate-image/) | 中等 | [站内题解](solution/0001-0100/48_旋转图像.md) |
| [240. 搜索二维矩阵 II](https://leetcode.cn/problems/search-a-2d-matrix-ii/) | 中等 | [站内题解](solution/0201-0300/240_搜索二维矩阵II.md) |
| [304. 二维区域和检索 - 数组不可变](https://leetcode.cn/problems/range-sum-query-2d-immutable/) | 中等 | [站内题解](solution/0301-0400/304_二维区域和检索%20-%20数组不可变.md) |

### 链表

| 题目 | 难度 | 题解 |
|---|---|---|
| [160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/) | 简单 | [站内题解](solution/0101-0200/160_相交链表.md) |
| [206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/) | 简单 | [站内题解](solution/0201-0300/206_反转链表.md) |
| [234. 回文链表](https://leetcode.cn/problems/palindrome-linked-list/) | 简单 | [站内题解](solution/0201-0300/234_回文链表.md) |
| [141. 环形链表](https://leetcode.cn/problems/linked-list-cycle/) | 简单 | [站内题解](solution/0101-0200/141_环形链表.md) |
| [142. 环形链表 II](https://leetcode.cn/problems/linked-list-cycle-ii/) | 中等 | [站内题解](solution/0101-0200/142_环形链表%20II.md) |
| [21. 合并两个有序链表](https://leetcode.cn/problems/merge-two-sorted-lists/) | 简单 | [站内题解](solution/0001-0100/21_合并两个有序链表.md) |
| [2. 两数相加](https://leetcode.cn/problems/add-two-numbers/) | 中等 | [站内题解](solution/0001-0100/2_两数相加.md) |
| [19. 删除链表的倒数第 N 个结点](https://leetcode.cn/problems/remove-nth-node-from-end-of-list/) | 中等 | [站内题解](solution/0001-0100/19_删除链表的倒数第N个节点.md) |
| [24. 两两交换链表中的节点](https://leetcode.cn/problems/swap-nodes-in-pairs/) | 中等 | [站内题解](solution/0001-0100/24_两两交换链表中的节点.md) |
| [25. K 个一组翻转链表](https://leetcode.cn/problems/reverse-nodes-in-k-group/) | 困难 | [站内题解](solution/0001-0100/25_K个一组翻转链表.md) |
| [138. 随机链表的复制](https://leetcode.cn/problems/copy-list-with-random-pointer/) | 中等 | [站内题解](solution/0101-0200/138_复制带随机指针的链表.md) |
| [148. 排序链表](https://leetcode.cn/problems/sort-list/) | 中等 | [站内题解](solution/0101-0200/148_排序链表.md) |
| [23. 合并 K 个升序链表](https://leetcode.cn/problems/merge-k-sorted-lists/) | 困难 | [站内题解](solution/0001-0100/23_合并K个升序链表.md) |
| [146. LRU 缓存](https://leetcode.cn/problems/lru-cache/) | 中等 | [站内题解](solution/0101-0200/146_LRU缓存.md) |

### 二叉树

| 题目 | 难度 | 题解 |
|---|---|---|
| [94. 二叉树的中序遍历](https://leetcode.cn/problems/binary-tree-inorder-traversal/) | 简单 | [站内题解](solution/0001-0100/94_二叉树的中序遍历.md) |
| [104. 二叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-binary-tree/) | 简单 | [站内题解](solution/0101-0200/104_二叉树的最大深度.md) |
| [226. 翻转二叉树](https://leetcode.cn/problems/invert-binary-tree/) | 简单 | [站内题解](solution/0201-0300/226_翻转二叉树.md) |
| [101. 对称二叉树](https://leetcode.cn/problems/symmetric-tree/) | 简单 | [站内题解](solution/0101-0200/101_对称二叉树.md) |
| [543. 二叉树的直径](https://leetcode.cn/problems/diameter-of-binary-tree/) | 简单 | [站内题解](solution/0501-0600/543_二叉树的直径.md) |
| [102. 二叉树的层序遍历](https://leetcode.cn/problems/binary-tree-level-order-traversal/) | 中等 | [站内题解](solution/0101-0200/102_二叉树的层序遍历.md) |
| [108. 将有序数组转换为二叉搜索树](https://leetcode.cn/problems/convert-sorted-array-to-binary-search-tree/) | 简单 | [站内题解](solution/0101-0200/108_将有序数组转换为二叉搜索树.md) |
| [98. 验证二叉搜索树](https://leetcode.cn/problems/validate-binary-search-tree/) | 中等 | [站内题解](solution/0001-0100/98_验证二叉搜索树.md) |
| [230. 二叉搜索树中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/) | 中等 | [站内题解](solution/0201-0300/230_二叉搜索树中第K小的元素.md) |
| [199. 二叉树的右视图](https://leetcode.cn/problems/binary-tree-right-side-view/) | 中等 | [站内题解](solution/0101-0200/199_二叉树的右视图.md) |
| [114. 二叉树展开为链表](https://leetcode.cn/problems/flatten-binary-tree-to-linked-list/) | 中等 | [站内题解](solution/0101-0200/114_二叉树展开为链表.md) |
| [105. 从前序与中序遍历序列构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/) | 中等 | [站内题解](solution/0101-0200/105_从前序与中序遍历序列构造二叉树.md) |
| [236. 二叉树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/) | 中等 | [站内题解](solution/0201-0300/236_二叉树的最近公共祖先.md) |
| [124. 二叉树中的最大路径和](https://leetcode.cn/problems/binary-tree-maximum-path-sum/) | 困难 | [站内题解](solution/0101-0200/124_二叉树中的最大路径和.md) |
| [437. 路径总和 III](https://leetcode.cn/problems/path-sum-iii/) | 中等 | [站内题解](solution/0401-0500/437_路径总和III.md) |

### 图论

| 题目 | 难度 | 题解 |
|---|---|---|
| [200. 岛屿数量](https://leetcode.cn/problems/number-of-islands/) | 中等 | [站内题解](solution/0101-0200/200_岛屿数量.md) |
| [994. 腐烂的橘子](https://leetcode.cn/problems/rotting-oranges/) | 中等 | [站内题解](solution/0901-1000/994_腐烂的橘子.md) |
| [207. 课程表](https://leetcode.cn/problems/course-schedule/) | 中等 | [站内题解](solution/0201-0300/207_课程表.md) |
| [332. 重新安排行程](https://leetcode.cn/problems/reconstruct-itinerary/) | 困难 | [站内题解](solution/0301-0400/332_重新安排行程.md) |
| [208. 实现 Trie（前缀树）](https://leetcode.cn/problems/implement-trie-prefix-tree/) | 中等 | [站内题解](solution/0201-0300/208_实现Trie.md) |

### 回溯

| 题目 | 难度 | 题解 |
|---|---|---|
| [46. 全排列](https://leetcode.cn/problems/permutations/) | 中等 | [站内题解](solution/0001-0100/46_全排列.md) |
| [47. 全排列 II](https://leetcode.cn/problems/permutations-ii/) | 中等 | [站内题解](solution/0001-0100/47_全排列II.md) |
| [77. 组合](https://leetcode.cn/problems/combinations/) | 中等 | [站内题解](solution/0001-0100/77_组合.md) |
| [78. 子集](https://leetcode.cn/problems/subsets/) | 中等 | [站内题解](solution/0001-0100/78_子集.md) |
| [17. 电话号码的字母组合](https://leetcode.cn/problems/letter-combinations-of-a-phone-number/) | 中等 | [站内题解](solution/0001-0100/17_电话号码的字母组合.md) |
| [39. 组合总和](https://leetcode.cn/problems/combination-sum/) | 中等 | [站内题解](solution/0001-0100/39_组合总和.md) |
| [22. 括号生成](https://leetcode.cn/problems/generate-parentheses/) | 中等 | [站内题解](solution/0001-0100/22_括号生成.md) |
| [79. 单词搜索](https://leetcode.cn/problems/word-search/) | 中等 | [站内题解](solution/0001-0100/79_单词搜索.md) |
| [131. 分割回文串](https://leetcode.cn/problems/palindrome-partitioning/) | 中等 | [站内题解](solution/0101-0200/131_分割回文串.md) |
| [51. N 皇后](https://leetcode.cn/problems/n-queens/) | 困难 | [站内题解](solution/0001-0100/51_N皇后.md) |
| [37. 解数独](https://leetcode.cn/problems/sudoku-solver/) | 困难 | [站内题解](solution/0001-0100/37_解数独.md) |

### 二分查找

| 题目 | 难度 | 题解 |
|---|---|---|
| [35. 搜索插入位置](https://leetcode.cn/problems/search-insert-position/) | 简单 | [站内题解](solution/0001-0100/35_搜索插入位置.md) |
| [74. 搜索二维矩阵](https://leetcode.cn/problems/search-a-2d-matrix/) | 中等 | [站内题解](solution/0001-0100/74_搜索二维矩阵.md) |
| [34. 在排序数组中查找元素的第一个和最后一个位置](https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/) | 中等 | [站内题解](solution/0001-0100/34_在排序数组中查找元素的第一个和最后一个位置.md) |
| [33. 搜索旋转排序数组](https://leetcode.cn/problems/search-in-rotated-sorted-array/) | 中等 | [站内题解](solution/0001-0100/33_搜索旋转排序数组.md) |
| [153. 寻找旋转排序数组中的最小值](https://leetcode.cn/problems/find-minimum-in-rotated-sorted-array/) | 中等 | [站内题解](solution/0101-0200/153_寻找旋转排序数组中的最小值.md) |
| [4. 寻找两个正序数组的中位数](https://leetcode.cn/problems/median-of-two-sorted-arrays/) | 困难 | [站内题解](solution/0001-0100/4_寻找两个正序数组的中位数.md) |

### 栈

| 题目 | 难度 | 题解 |
|---|---|---|
| [20. 有效的括号](https://leetcode.cn/problems/valid-parentheses/) | 简单 | [站内题解](solution/0001-0100/20_有效括号.md) |
| [155. 最小栈](https://leetcode.cn/problems/min-stack/) | 中等 | [站内题解](solution/0101-0200/155_最小栈.md) |
| [394. 字符串解码](https://leetcode.cn/problems/decode-string/) | 中等 | [站内题解](solution/0301-0400/394_字符串解码.md) |
| [739. 每日温度](https://leetcode.cn/problems/daily-temperatures/) | 中等 | [站内题解](solution/0701-0800/739_每日温度.md) |
| [84. 柱状图中最大的矩形](https://leetcode.cn/problems/largest-rectangle-in-histogram/) | 困难 | [站内题解](solution/0001-0100/84_柱状图中最大的矩形.md) |

### 堆

| 题目 | 难度 | 题解 |
|---|---|---|
| [215. 数组中的第 K 个最大元素](https://leetcode.cn/problems/kth-largest-element-in-an-array/) | 中等 | [站内题解](solution/0201-0300/215_数组中的第K个最大元素.md) |
| [347. 前 K 个高频元素](https://leetcode.cn/problems/top-k-frequent-elements/) | 中等 | [站内题解](solution/0301-0400/347_前K个高频元素.md) |
| [692. 前 K 个高频单词](https://leetcode.cn/problems/top-k-frequent-words/) | 中等 | [站内题解](solution/0601-0700/692_前K个高频单词.md) |
| [295. 数据流的中位数](https://leetcode.cn/problems/find-median-from-data-stream/) | 困难 | [站内题解](solution/0201-0300/295_数据流的中位数.md) |

### 贪心算法

| 题目 | 难度 | 题解 |
|---|---|---|
| [121. 买卖股票的最佳时机](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock/) | 简单 | [站内题解](solution/0101-0200/121_买卖股票的最佳时机.md) |
| [55. 跳跃游戏](https://leetcode.cn/problems/jump-game/) | 中等 | [站内题解](solution/0001-0100/55_跳跃游戏.md) |
| [45. 跳跃游戏 II](https://leetcode.cn/problems/jump-game-ii/) | 中等 | [站内题解](solution/0001-0100/45_跳跃游戏%20II.md) |
| [763. 划分字母区间](https://leetcode.cn/problems/partition-labels/) | 中等 | [站内题解](solution/0701-0800/763_划分字母区间.md) |

### 动态规划

| 题目 | 难度 | 题解 |
|---|---|---|
| [70. 爬楼梯](https://leetcode.cn/problems/climbing-stairs/) | 简单 | [站内题解](solution/0001-0100/70_爬楼梯.md) |
| [118. 杨辉三角](https://leetcode.cn/problems/pascals-triangle/) | 简单 | [站内题解](solution/0001-0100/118_杨辉三角.md) |
| [198. 打家劫舍](https://leetcode.cn/problems/house-robber/) | 中等 | [站内题解](solution/0101-0200/198_打家劫舍.md) |
| [740. 删除并获得点数](https://leetcode.cn/problems/delete-and-earn/) | 中等 | [站内题解](solution/0701-0800/740_删除并获得点数.md) |
| [279. 完全平方数](https://leetcode.cn/problems/perfect-squares/) | 中等 | [站内题解](solution/0201-0300/279_完全平方数.md) |
| [322. 零钱兑换](https://leetcode.cn/problems/coin-change/) | 中等 | [站内题解](solution/0301-0400/322_零钱兑换.md) |
| [139. 单词拆分](https://leetcode.cn/problems/word-break/) | 中等 | [站内题解](solution/0101-0200/139_单词拆分.md) |
| [300. 最长递增子序列](https://leetcode.cn/problems/longest-increasing-subsequence/) | 中等 | [站内题解](solution/0201-0300/300_最长递增子序列.md) |
| [152. 乘积最大子数组](https://leetcode.cn/problems/maximum-product-subarray/) | 中等 | [站内题解](solution/0101-0200/152_乘积最大子数组.md) |
| [416. 分割等和子集](https://leetcode.cn/problems/partition-equal-subset-sum/) | 中等 | [站内题解](solution/0401-0500/416_分割等和子集.md) |
| [32. 最长有效括号](https://leetcode.cn/problems/longest-valid-parentheses/) | 困难 | [站内题解](solution/0001-0100/32_最长有效括号.md) |

### 多维动态规划

| 题目 | 难度 | 题解 |
|---|---|---|
| [62. 不同路径](https://leetcode.cn/problems/unique-paths/) | 中等 | [站内题解](solution/0001-0100/62_不同路径.md) |
| [64. 最小路径和](https://leetcode.cn/problems/minimum-path-sum/) | 中等 | [站内题解](solution/0001-0100/64_最小路径和.md) |
| [120. 三角形最小路径和](https://leetcode.cn/problems/triangle/) | 中等 | [站内题解](solution/0101-0200/120_三角形最小路径和.md) |
| [5. 最长回文子串](https://leetcode.cn/problems/longest-palindromic-substring/) | 中等 | [站内题解](solution/0001-0100/5_最长回文子串.md) |
| [1143. 最长公共子序列](https://leetcode.cn/problems/longest-common-subsequence/) | 中等 | [站内题解](solution/1101-1200/1143_最长公共子序列.md) |
| [97. 交错字符串](https://leetcode.cn/problems/interleaving-string/) | 中等 | [站内题解](solution/0001-0100/97_交错字符串.md) |
| [877. 石子游戏](https://leetcode.cn/problems/stone-game/) | 中等 | [站内题解](solution/0801-0900/877_石子游戏.md) |
| [72. 编辑距离](https://leetcode.cn/problems/edit-distance/) | 困难 | [站内题解](solution/0001-0100/72_编辑距离.md) |

### 技巧

| 题目 | 难度 | 题解 |
|---|---|---|
| [136. 只出现一次的数字](https://leetcode.cn/problems/single-number/) | 简单 | [站内题解](solution/0101-0200/136_只出现一次的数字.md) |
| [169. 多数元素](https://leetcode.cn/problems/majority-element/) | 简单 | [站内题解](solution/0101-0200/169_多数元素.md) |
| [75. 颜色分类](https://leetcode.cn/problems/sort-colors/) | 中等 | [站内题解](solution/0001-0100/75_颜色分类.md) |
| [31. 下一个排列](https://leetcode.cn/problems/next-permutation/) | 中等 | [站内题解](solution/0001-0100/31_下一个排列.md) |
| [287. 寻找重复数](https://leetcode.cn/problems/find-the-duplicate-number/) | 中等 | [站内题解](solution/0201-0300/287_寻找重复数.md) |

## 二、CodeTop / 面试经典 150 高频补充（Hot 100 之外）

以下题目不在 Hot 100 中，但在 [CodeTop](https://codetop.cc/home)（基于牛客网数千篇面经的题目频率统计，开源数据见 [afatcoder/LeetcodeTop](https://github.com/afatcoder/LeetcodeTop)）和 [面试经典 150 题](https://leetcode.cn/studyplan/top-interview-150/) 中出现频率很高，尤其受字节、腾讯、美团等公司青睐。

### 排序与手撕代码

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [912. 排序数组](https://leetcode.cn/problems/sort-an-array/) | 中等 | [站内题解](solution/0901-1000/912_排序数组.md) | CodeTop 超高频，常要求手撕快排 / 归并 / 堆排 |
| [88. 合并两个有序数组](https://leetcode.cn/problems/merge-sorted-array/) | 简单 | [站内题解](solution/0001-0100/88_合并两个有序数组.md) | 面试经典 150 |
| [80. 删除有序数组中的重复项 II](https://leetcode.cn/problems/remove-duplicates-from-sorted-array-ii/) | 中等 | [站内题解](solution/0001-0100/80_删除有序数组中的重复项II.md) | 面试经典 150，快慢双指针原地覆写 |
| [179. 最大数](https://leetcode.cn/problems/largest-number/) | 中等 | [站内题解](solution/0101-0200/179_最大数.md) | 自定义排序，腾讯 / 华为高频 |
| [274. H 指数](https://leetcode.cn/problems/h-index/) | 中等 | [站内题解](solution/0201-0300/274_H指数.md) | 面试经典 150，计数排序 |
| [315. 计算右侧小于当前元素的个数](https://leetcode.cn/problems/count-of-smaller-numbers-after-self/) | 困难 | [站内题解](solution/0301-0400/315_计算右侧小于当前元素的个数.md) | 归并排序 + 索引数组，字节 / Google 高频，逆序对进阶 |
| [611. 有效三角形的个数](https://leetcode.cn/problems/valid-triangle-number/) | 中等 | [站内题解](solution/0601-0700/611_有效三角形的个数.md) | 面试经典 150，排序 + 双指针计数（a+b&gt;c 区间计数，计数型双指针招牌题） |

### 字符串

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [415. 字符串相加](https://leetcode.cn/problems/add-strings/) | 简单 | [站内题解](solution/0401-0500/415_字符串相加.md) | CodeTop 超高频，大数加法模板 |
| [43. 字符串相乘](https://leetcode.cn/problems/multiply-strings/) | 中等 | [站内题解](solution/0001-0100/43_字符串相乘.md) | 字节 / 腾讯高频，大数乘法 |
| [165. 比较版本号](https://leetcode.cn/problems/compare-version-numbers/) | 中等 | [站内题解](solution/0101-0200/165_比较版本号.md) | CodeTop 高频，字符串切分 |
| [151. 反转字符串中的单词](https://leetcode.cn/problems/reverse-words-in-a-string/) | 中等 | [站内题解](solution/0101-0200/151_反转字符串中的单词.md) | 剑指 Offer 58 |
| [8. 字符串转换整数（atoi）](https://leetcode.cn/problems/string-to-integer-atoi/) | 中等 | [站内题解](solution/0001-0100/8_字符串转换整数atoi.md) | 边界处理考察 |
| [14. 最长公共前缀](https://leetcode.cn/problems/longest-common-prefix/) | 简单 | [站内题解](solution/0001-0100/14_最长公共前缀.md) | 面试经典 150 |
| [13. 罗马数字转整数](https://leetcode.cn/problems/roman-to-integer/) | 简单 | [站内题解](solution/0001-0100/13_罗马数字转整数.md) | 面试经典 150，哈希 + 贪心 |
| [12. 整数转罗马数字](https://leetcode.cn/problems/integer-to-roman/) | 中等 | [站内题解](solution/0001-0100/12_整数转罗马数字.md) | 面试经典 150，贪心配面值 |
| [28. 找出字符串中第一个匹配项的下标](https://leetcode.cn/problems/find-the-index-of-the-first-occurrence-in-a-string/) | 简单 | [站内题解](solution/0001-0100/28_找出字符串中第一个匹配项的下标.md) | KMP 模板题 |
| [468. 验证 IP 地址](https://leetcode.cn/problems/validate-ip-address/) | 中等 | [站内题解](solution/0401-0500/468_验证IP地址.md) | 字节高频 |
| [93. 复原 IP 地址](https://leetcode.cn/problems/restore-ip-addresses/) | 中等 | [站内题解](solution/0001-0100/93_复原IP地址.md) | 回溯 + 剪枝 |
| [392. 判断子序列](https://leetcode.cn/problems/is-subsequence/) | 简单 | [站内题解](solution/0301-0400/392_判断子序列.md) | 面试经典 150，双指针贪心 + 进阶二分预处理 |

### 链表

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [92. 反转链表 II](https://leetcode.cn/problems/reverse-linked-list-ii/) | 中等 | [站内题解](solution/0001-0100/92_反转链表%20II.md) | 指定区间反转，高频 |
| [143. 重排链表](https://leetcode.cn/problems/reorder-list/) | 中等 | [站内题解](solution/0101-0200/143_重排链表.md) | 找中点 + 反转 + 合并 |
| [83. 删除排序链表中的重复元素](https://leetcode.cn/problems/remove-duplicates-from-sorted-list/) | 简单 | [站内题解](solution/0001-0100/83_删除排序链表中的重复元素.md) |  |
| [328. 奇偶链表](https://leetcode.cn/problems/odd-even-linked-list/) | 中等 | [站内题解](solution/0301-0400/328_奇偶链表.md) |  |
| [445. 两数相加 II](https://leetcode.cn/problems/add-two-numbers-ii/) | 中等 | [站内题解](solution/0401-0500/445_两数相加%20II.md) | 栈的应用 |
| [876. 链表的中间结点](https://leetcode.cn/problems/middle-of-the-linked-list/) | 简单 | [站内题解](solution/0801-0900/876_链表的中间结点.md) | 快慢指针 |
| [61. 旋转链表](https://leetcode.cn/problems/rotate-list/) | 中等 | [站内题解](solution/0001-0100/61_旋转链表.md) | 成环再断开，链表接线招牌题 |
| [430. 扁平化多级双向链表](https://leetcode.cn/problems/flatten-a-multilevel-doubly-linked-list/) | 中等 | [站内题解](solution/0401-0500/430_扁平化多级双向链表.md) |  |

### 二叉树

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [103. 二叉树的锯齿形层序遍历](https://leetcode.cn/problems/binary-tree-zigzag-level-order-traversal/) | 中等 | [站内题解](solution/0101-0200/103_二叉树的锯齿形层序遍历.md) | CodeTop 超高频 |
| [144. 二叉树的前序遍历](https://leetcode.cn/problems/binary-tree-preorder-traversal/) | 简单 | [站内题解](solution/0101-0200/144_二叉树的前序遍历.md) | 迭代 / Morris 写法常被追问 |
| [145. 二叉树的后序遍历](https://leetcode.cn/problems/binary-tree-postorder-traversal/) | 简单 | [站内题解](solution/0101-0200/145_二叉树的后序遍历.md) |  |
| [110. 平衡二叉树](https://leetcode.cn/problems/balanced-binary-tree/) | 简单 | [站内题解](solution/0101-0200/110_平衡二叉树.md) | 剑指 Offer 55-II |
| [111. 二叉树的最小深度](https://leetcode.cn/problems/minimum-depth-of-binary-tree/) | 简单 | [站内题解](solution/0101-0200/111_二叉树的最小深度.md) |  |
| [112. 路径总和](https://leetcode.cn/problems/path-sum/) | 简单 | [站内题解](solution/0101-0200/112_路径总和.md) |  |
| [113. 路径总和 II](https://leetcode.cn/problems/path-sum-ii/) | 中等 | [站内题解](solution/0101-0200/113_路径总和II.md) | 剑指 Offer 34 |
| [129. 求根节点到叶节点数字之和](https://leetcode.cn/problems/sum-root-to-leaf-numbers/) | 中等 | [站内题解](solution/0101-0200/129_求根节点到叶节点数字之和.md) |  |
| [222. 完全二叉树的节点个数](https://leetcode.cn/problems/count-complete-tree-nodes/) | 简单 | [站内题解](solution/0201-0300/222_完全二叉树的节点个数.md) |  |
| [235. 二叉搜索树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-search-tree/) | 中等 | [站内题解](solution/0201-0300/235_二叉搜索树的最近公共祖先.md) | 剑指 Offer 68-I |
| [297. 二叉树的序列化与反序列化](https://leetcode.cn/problems/serialize-and-deserialize-binary-tree/) | 困难 | [站内题解](solution/0201-0300/297_二叉树的序列化与反序列化.md) | CodeTop 高频 |
| [662. 二叉树最大宽度](https://leetcode.cn/problems/maximum-width-of-binary-tree/) | 中等 | [站内题解](solution/0601-0700/662_二叉树最大宽度.md) | 字节高频 |
| [958. 二叉树的完全性检验](https://leetcode.cn/problems/check-completeness-of-a-binary-tree/) | 中等 | [站内题解](solution/0901-1000/958_二叉树的完全性检验.md) | 字节 / 腾讯高频 |
| [173. 二叉搜索树迭代器](https://leetcode.cn/problems/binary-search-tree-iterator/) | 中等 | [站内题解](solution/0101-0200/173_二叉搜索树迭代器.md) |  |
| [559. N 叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-n-ary-tree/) | 简单 | [站内题解](solution/0501-0600/559_N叉树的最大深度.md) |  |
| [889. 根据前序与后序遍历构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-postorder-traversal/) | 中等 | [站内题解](solution/0801-0900/889_根据前序与后序遍历构造二叉树.md) |  |
| [1008. 前序遍历构造二叉搜索树](https://leetcode.cn/problems/construct-binary-search-tree-from-preorder-traversal/) | 中等 | [站内题解](solution/1001-1100/1008_前序遍历构造二叉搜索树.md) |  |
| [117. 填充每个节点的下一个右侧节点指针 II](https://leetcode.cn/problems/populating-next-right-pointers-in-each-node-ii/) | 中等 | [站内题解](solution/0101-0200/117_填充每个节点的下一个右侧节点指针%20II.md) | 面试经典 150，116 进阶版，O(1) 空间层序 |
| [450. 删除二叉搜索树中的节点](https://leetcode.cn/problems/delete-node-in-a-bst/) | 中等 | [站内题解](solution/0401-0500/450_删除二叉搜索树中的节点.md) | BST CRUD 必备，三种情况分类处理 |

### 栈与队列

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [232. 用栈实现队列](https://leetcode.cn/problems/implement-queue-using-stacks/) | 简单 | [站内题解](solution/0201-0300/232_用栈实现队列.md) | 剑指 Offer 09，CodeTop 高频 |
| [150. 逆波兰表达式求值](https://leetcode.cn/problems/evaluate-reverse-polish-notation/) | 中等 | [站内题解](solution/0101-0200/150_逆波兰表达式求值.md) | 面试经典 150 |
| [224. 基本计算器](https://leetcode.cn/problems/basic-calculator/) | 困难 | [站内题解](solution/0201-0300/224_基本计算器.md) | CodeTop 高频 |
| [227. 基本计算器 II](https://leetcode.cn/problems/basic-calculator-ii/) | 中等 | [站内题解](solution/0201-0300/227_基本计算器II.md) | CodeTop 高频 |
| [402. 移掉 K 位数字](https://leetcode.cn/problems/remove-k-digits/) | 中等 | [站内题解](solution/0401-0500/402_移掉K位数字.md) | 单调栈 |
| [496. 下一个更大元素 I](https://leetcode.cn/problems/next-greater-element-i/) | 简单 | [站内题解](solution/0401-0500/496_下一个更大元素%20I.md) | 单调栈 |
| [503. 下一个更大元素 II](https://leetcode.cn/problems/next-greater-element-ii/) | 中等 | [站内题解](solution/0501-0600/503_下一个更大元素%20II.md) | 单调栈 + 循环数组 |
| [901. 股票价格跨度](https://leetcode.cn/problems/online-stock-span/) | 中等 | [站内题解](solution/0901-1000/901_股票价格跨度.md) | 单调栈 |
| [316. 去除重复字母](https://leetcode.cn/problems/remove-duplicate-letters/) | 中等 | [站内题解](solution/0301-0400/316_去除重复字母.md) | 单调栈 + 贪心 |
| [735. 行星碰撞](https://leetcode.cn/problems/asteroid-collision/) | 中等 | [站内题解](solution/0701-0800/735_行星碰撞.md) | 面试经典 150，栈模拟碰撞 |
| [946. 验证栈序列](https://leetcode.cn/problems/validate-stack-sequences/) | 中等 | [站内题解](solution/0901-1000/946_验证栈序列.md) | 剑指 Offer 31，栈模拟判定（能弹就弹贪心） |
| [71. 简化路径](https://leetcode.cn/problems/simplify-path/) | 中等 | [站内题解](solution/0001-0100/71_简化路径.md) | 面试经典 150，栈模拟路径压缩（切分 + 压栈/弹栈） |

### 二分查找

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [704. 二分查找](https://leetcode.cn/problems/binary-search/) | 简单 | [站内题解](solution/0701-0800/704_二分查找.md) | 基础模板，必考 |
| [69. x 的平方根](https://leetcode.cn/problems/sqrtx/) | 简单 | [站内题解](solution/0001-0100/69_x的平方根.md) | 二分答案 |
| [162. 寻找峰值](https://leetcode.cn/problems/find-peak-element/) | 中等 | [站内题解](solution/0101-0200/162_寻找峰值.md) |  |
| [540. 有序数组中的单一元素](https://leetcode.cn/problems/single-element-in-a-sorted-array/) | 中等 | [站内题解](solution/0501-0600/540_有序数组中的单一元素.md) |  |
| [378. 有序矩阵中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-sorted-matrix/) | 中等 | [站内题解](solution/0301-0400/378_有序矩阵中第K小的元素.md) |  |
| [875. 爱吃香蕉的珂珂](https://leetcode.cn/problems/koko-eating-bananas/) | 中等 | [站内题解](solution/0801-0900/875_爱吃香蕉的珂珂.md) | 二分答案套路 |
| [1011. 在 D 天内送达包裹的能力](https://leetcode.cn/problems/capacity-to-ship-packages-within-d-days/) | 中等 | [站内题解](solution/1001-1100/1011_在D天内送达包裹的能力.md) | 二分答案套路 |
| [410. 分割数组的最大值](https://leetcode.cn/problems/split-array-largest-sum/) | 困难 | [站内题解](solution/0401-0500/410_分割数组的最大值.md) | 二分答案 / 动态规划 |
| [719. 找出第 K 小的数对距离](https://leetcode.cn/problems/find-k-th-smallest-pair-distance/) | 困难 | [站内题解](solution/0701-0800/719_找出第K小的数对距离.md) | 二分 + 双指针 |

### 数学、位运算与技巧

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [50. Pow(x, n)](https://leetcode.cn/problems/powx-n/) | 中等 | [站内题解](solution/0001-0100/50_Powx_n.md) | 剑指 Offer 16，快速幂 |
| [29. 两数相除](https://leetcode.cn/problems/divide-two-integers/) | 中等 | [站内题解](solution/0001-0100/29_两数相除.md) | 面试经典 150，位运算模拟除法（位移加速，承接 371 加法 / 50 快速幂） |
| [470. 用 Rand7() 实现 Rand10()](https://leetcode.cn/problems/implement-rand10-using-rand7/) | 中等 | [站内题解](solution/0401-0500/470_用Rand7实现Rand10.md) | CodeTop 超高频 |
| [398. 随机数索引](https://leetcode.cn/problems/random-pick-index/) | 中等 | [站内题解](solution/0301-0400/398_随机数索引.md) | 面试经典 150，蓄水池抽样招牌题 |
| [528. 按权重随机选择](https://leetcode.cn/problems/random-pick-with-weight/) | 中等 | [站内题解](solution/0501-0600/528_按权重随机选择.md) | 面试经典 150，前缀和 + 二分加权随机采样 |
| [166. 分数到小数](https://leetcode.cn/problems/fraction-to-recurring-decimal/) | 中等 | [站内题解](solution/0101-0200/166_分数到小数.md) | 面试经典 150，长除法模拟 + 哈希检测循环节 |
| [289. 生命游戏](https://leetcode.cn/problems/game-of-life/) | 中等 | [站内题解](solution/0201-0300/289_生命游戏.md) | 原地标记技巧 |
| [137. 只出现一次的数字 II](https://leetcode.cn/problems/single-number-ii/) | 中等 | [站内题解](solution/0101-0200/137_只出现一次的数字II.md) | 位运算 |
| [260. 只出现一次的数字 III](https://leetcode.cn/problems/single-number-iii/) | 中等 | [站内题解](solution/0201-0300/260_只出现一次的数字III.md) | 剑指 Offer 56-I |
| [338. 比特位计数](https://leetcode.cn/problems/counting-bits/) | 简单 | [站内题解](solution/0301-0400/338_比特位计数.md) |  |
| [349. 两个数组的交集](https://leetcode.cn/problems/intersection-of-two-arrays/) | 简单 | [站内题解](solution/0301-0400/349_两个数组的交集.md) |  |
| [581. 最短无序连续子数组](https://leetcode.cn/problems/shortest-unsorted-continuous-subarray/) | 中等 | [站内题解](solution/0501-0600/581_最短无序连续子数组.md) |  |
| [229. 多数元素 II](https://leetcode.cn/problems/majority-element-ii/) | 中等 | [站内题解](solution/0201-0300/229_多数元素II.md) | 面试经典 150，Boyer-Moore k=3 推广 |
| [168. Excel表列名称](https://leetcode.cn/problems/excel-sheet-column-title/) | 中等 | [站内题解](solution/0001-0100/168_Excel表列名称.md) | 面试经典 150，1-indexed 进制转换母题 |
| [204. 计数质数](https://leetcode.cn/problems/count-primes/) | 中等 | [站内题解](solution/0201-0300/204_计数质数.md) | 埃氏筛模板，数论筛法基础 |
| [149. 直线上最多的点数](https://leetcode.cn/problems/max-points-on-a-line/) | 困难 | [站内题解](solution/0101-0200/149_直线上最多的点数.md) | 旧 Hot 100，哈希 + GCD 化简分数表示斜率 |
| [202. 快乐数](https://leetcode.cn/problems/happy-number/) | 简单 | [站内题解](solution/0201-0300/202_快乐数.md) | 面试经典 150，数位平方和序列 + Floyd 判圈（承接 141/287 判环三件套） |
| [89. 格雷编码](https://leetcode.cn/problems/gray-code/) | 中等 | [站内题解](solution/0001-0100/89_格雷编码.md) | 旧 Hot 100，镜像反射 + 公式 G(i)=i^(i&gt;&gt;1)（构造而非搜索） |

### 区间、贪心与差分

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [253. 会议室 II](https://leetcode.cn/problems/meeting-rooms-ii/) | 中等 | [站内题解](solution/0201-0300/253_会议室II.md) | 扫描线 / 堆，外企高频 |
| [57. 插入区间](https://leetcode.cn/problems/insert-interval/) | 中等 | [站内题解](solution/0001-0100/57_插入区间.md) | 面试经典 150，三阶段线性扫描 |
| [228. 汇总区间](https://leetcode.cn/problems/summary-ranges/) | 中等 | [站内题解](solution/0201-0300/228_汇总区间.md) | 面试经典 150，连续区间扫描与格式化 |
| [986. 区间列表的交集](https://leetcode.cn/problems/interval-list-intersections/) | 中等 | [站内题解](solution/0901-1000/986_区间列表的交集.md) | 面试经典 150，双指针归并取交集 |
| [435. 无重叠区间](https://leetcode.cn/problems/non-overlapping-intervals/) | 中等 | [站内题解](solution/0401-0500/435_无重叠区间.md) | 区间贪心 |
| [452. 用最少数量的箭引爆气球](https://leetcode.cn/problems/minimum-number-of-arrows-to-burst-balloons/) | 中等 | [站内题解](solution/0401-0500/452_用最少数量的箭引爆气球.md) | 区间贪心 |
| [621. 任务调度器](https://leetcode.cn/problems/task-scheduler/) | 中等 | [站内题解](solution/0601-0700/621_任务调度器.md) | 字节高频 |
| [406. 根据身高重建队列](https://leetcode.cn/problems/queue-reconstruction-by-height/) | 中等 | [站内题解](solution/0401-0500/406_根据身高重建队列.md) | 排序 + 插队 |
| [1109. 航班预订统计](https://leetcode.cn/problems/corporate-flight-bookings/) | 中等 | [站内题解](solution/1101-1200/1109_航班预订统计.md) | 差分数组模板 |
| [767. 重构字符串](https://leetcode.cn/problems/reorganize-string/) | 中等 | [站内题解](solution/0701-0800/767_重构字符串.md) | 贪心 + 大根堆，面试经典 150 |
| [502. IPO](https://leetcode.cn/problems/ipo/) | 中等 | [站内题解](solution/0501-0600/502_IPO.md) | 面试经典 150，贪心 + 大顶堆（排序解锁 + 每轮取最大利润） |
| [334. 递增的三元子序列](https://leetcode.cn/problems/increasing-triplet-subsequence/) | 中等 | [站内题解](solution/0301-0400/334_递增的三元子序列.md) | 面试经典 150，贪心双阈值 O(n)/O(1)，LIS k=3 特例 |
| [870. 优势洗牌](https://leetcode.cn/problems/advantage-shuffle/) | 中等 | [站内题解](solution/0801-0900/870_优势洗牌.md) | 田忌赛马贪心，排序 + 双端双指针，最大化取胜数 |
| [659. 分割数组为连续子序列](https://leetcode.cn/problems/split-array-into-consecutive-subsequences/) | 中等 | [站内题解](solution/0601-0700/659_分割数组为连续子序列.md) | 字节 / 腾讯高频，贪心 + 哈希计数（freq/tails 双表，续接优先 + 交换论证，最小堆通用版） |

### 滑动窗口与子数组

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [209. 长度最小的子数组](https://leetcode.cn/problems/minimum-size-subarray-sum/) | 中等 | [站内题解](solution/0201-0300/209_长度最小的子数组.md) | 面试经典 150 |
| [424. 替换后的最长重复字符](https://leetcode.cn/problems/longest-repeating-character-replacement/) | 中等 | [站内题解](solution/0401-0500/424_替换后的最长重复字符.md) |  |
| [713. 乘积小于 K 的子数组](https://leetcode.cn/problems/subarray-product-less-than-k/) | 中等 | [站内题解](solution/0701-0800/713_乘积小于K的子数组.md) |  |
| [1248. 统计「优美子数组」](https://leetcode.cn/problems/count-number-of-nice-subarrays/) | 中等 | [站内题解](solution/1201-1300/1248_统计优美子数组.md) | 「至多 K」转化技巧 + 前缀和哈希双解法 |
| [974. 和可被 K 整除的子数组](https://leetcode.cn/problems/subarray-sums-divisible-by-k/) | 中等 | [站内题解](solution/0901-1000/974_和可被K整除的子数组.md) | 前缀和 + 同余定理 |
| [525. 连续数组](https://leetcode.cn/problems/contiguous-array/) | 中等 | [站内题解](solution/0501-0600/525_连续数组.md) | 前缀和 + 哈希，0 当 −1 转换 |

### 动态规划补充

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [122. 买卖股票的最佳时机 II](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-ii/) | 中等 | [站内题解](solution/0101-0200/122_买卖股票的最佳时机II.md) | 股票系列 |
| [123. 买卖股票的最佳时机 III](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iii/) | 困难 | [站内题解](solution/0101-0200/123_买卖股票的最佳时机III.md) | 股票系列，至多 2 笔，四状态机 |
| [188. 买卖股票的最佳时机 IV](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iv/) | 困难 | [站内题解](solution/0101-0200/188_买卖股票的最佳时机IV.md) | 股票系列 |
| [309. 买卖股票的最佳时机含冷冻期](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-with-cooldown/) | 中等 | [站内题解](solution/0301-0400/309_买卖股票的最佳时机含冷冻期.md) | 股票系列 |
| [714. 买卖股票的最佳时机含手续费](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-with-transaction-fee/) | 中等 | [站内题解](solution/0701-0800/714_买卖股票的最佳时机含手续费.md) | 股票系列 |
| [213. 打家劫舍 II](https://leetcode.cn/problems/house-robber-ii/) | 中等 | [站内题解](solution/0201-0300/213_打家劫舍II.md) | 环形 DP |
| [337. 打家劫舍 III](https://leetcode.cn/problems/house-robber-iii/) | 中等 | [站内题解](solution/0301-0400/337_打家劫舍III.md) | 树形 DP |
| [221. 最大正方形](https://leetcode.cn/problems/maximal-square/) | 中等 | [站内题解](solution/0201-0300/221_最大正方形.md) | 二维 DP |
| [174. 地下城游戏](https://leetcode.cn/problems/dungeon-game/) | 困难 | [站内题解](solution/0101-0200/174_地下城游戏.md) | 面试经典 150，反向网格 DP（状态定义决定子结构，从终点倒推 + 哨兵） |
| [518. 零钱兑换 II](https://leetcode.cn/problems/coin-change-ii/) | 中等 | [站内题解](solution/0501-0600/518_零钱兑换II.md) | 完全背包求方案数 |
| [494. 目标和](https://leetcode.cn/problems/target-sum/) | 中等 | [站内题解](solution/0401-0500/494_目标和.md) | 01 背包转化 |
| [1049. 最后一块石头的重量 II](https://leetcode.cn/problems/last-stone-weight-ii/) | 中等 | [站内题解](solution/1001-1100/1049_最后一块石头的重量II.md) | 0-1 背包求最值（相撞⇔赋±号，最小化两组差） |
| [474. 一和零](https://leetcode.cn/problems/ones-and-zeroes/) | 中等 | [站内题解](solution/0401-0500/474_一和零.md) | 面试经典 150，二维费用 0-1 背包 |
| [312. 戳气球](https://leetcode.cn/problems/burst-balloons/) | 困难 | [站内题解](solution/0301-0400/312_戳气球.md) | 区间 DP |
| [354. 俄罗斯套娃信封问题](https://leetcode.cn/problems/russian-doll-envelopes/) | 困难 | [站内题解](solution/0301-0400/354_俄罗斯套娃信封问题.md) | LIS 变形 |
| [516. 最长回文子序列](https://leetcode.cn/problems/longest-palindromic-subsequence/) | 中等 | [站内题解](solution/0501-0600/516_最长回文子序列.md) |  |
| [647. 回文子串](https://leetcode.cn/problems/palindromic-substrings/) | 中等 | [站内题解](solution/0601-0700/647_回文子串.md) | 中心扩展 |
| [718. 最长重复子数组](https://leetcode.cn/problems/maximum-length-of-repeated-subarray/) | 中等 | [站内题解](solution/0601-0700/718_最长重复子数组.md) | 面试经典 150，公共子串 DP（1143 子序列版的连续变体，不匹配归零） |
| [698. 划分为 K 个相等的子集](https://leetcode.cn/problems/partition-to-k-equal-sum-subsets/) | 中等 | [站内题解](solution/0601-0700/698_划分为K个相等的子集.md) | 回溯 + 剪枝 |
| [96. 不同的二叉搜索树](https://leetcode.cn/problems/unique-binary-search-trees/) | 中等 | [站内题解](solution/0001-0100/96_不同的二叉搜索树.md) | 卡塔兰数计数 DP |
| [918. 环形子数组的最大和](https://leetcode.cn/problems/maximum-sum-circular-subarray/) | 中等 | [站内题解](solution/0901-1000/918_最大环形子数组和.md) | 面试经典 150，Kadane 环形变体（total − min_sum） |
| [343. 整数拆分](https://leetcode.cn/problems/integer-break/) | 中等 | [站内题解](solution/0301-0400/343_整数拆分.md) | 剑指 Offer 14，切分型 DP + 数学贪心（切成 3 最优） |
| [377. 组合总和 IV](https://leetcode.cn/problems/combination-sum-iv/) | 中等 | [站内题解](solution/0301-0400/377_组合总和IV.md) | 完全背包求排列数，与 518 镜像对比循环顺序 |

### 回溯与枚举

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [90. 子集 II](https://leetcode.cn/problems/subsets-ii/) | 中等 | [站内题解](solution/0001-0100/90_子集II.md) | 面试经典 150，含重复元素的子集（78 收集框架 + 40 同层剪枝去重，`i > start` 区分同层/纵深） |

### 图与 BFS

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [127. 单词接龙](https://leetcode.cn/problems/word-ladder/) | 困难 | [站内题解](solution/0101-0200/127_单词接龙.md) | BFS 最短路径 |
| [130. 被围绕的区域](https://leetcode.cn/problems/surrounded-regions/) | 中等 | [站内题解](solution/0101-0200/130_被围绕的区域.md) |  |
| [417. 太平洋大西洋水流问题](https://leetcode.cn/problems/pacific-atlantic-water-flow/) | 中等 | [站内题解](solution/0401-0500/417_太平洋大西洋水流问题.md) | 从海洋边界反向 BFS/DFS，130 的姊妹题 |
| [133. 克隆图](https://leetcode.cn/problems/clone-graph/) | 中等 | [站内题解](solution/0101-0200/133_克隆图.md) |  |
| [695. 岛屿的最大面积](https://leetcode.cn/problems/max-area-of-island/) | 中等 | [站内题解](solution/0601-0700/695_岛屿的最大面积.md) |  |
| [547. 省份数量](https://leetcode.cn/problems/number-of-provinces/) | 中等 | [站内题解](solution/0501-0600/547_省份数量.md) | 并查集 |
| [684. 冗余连接](https://leetcode.cn/problems/redundant-connection/) | 中等 | [站内题解](solution/0601-0700/684_冗余连接.md) | 面试经典 150，并查集判环 |
| [785. 判断二分图](https://leetcode.cn/problems/is-graph-bipartite/) | 中等 | [站内题解](solution/0701-0800/785_判断二分图.md) | 染色法 |
| [399. 除法求值](https://leetcode.cn/problems/evaluate-division/) | 中等 | [站内题解](solution/0301-0400/399_除法求值.md) | 带权并查集 / 图搜索 |
| [743. 网络延迟时间](https://leetcode.cn/problems/network-delay-time/) | 中等 | [站内题解](solution/0701-0800/743_网络延迟时间.md) | Dijkstra 模板 |
| [787. K 站中转内最便宜的航班](https://leetcode.cn/problems/cheapest-flights-within-k-stops/) | 中等 | [站内题解](solution/0701-0800/787_K站中转内最便宜的航班.md) | Bellman-Ford 限制松弛 |
| [752. 打开转盘锁](https://leetcode.cn/problems/open-the-lock/) | 中等 | [站内题解](solution/0701-0800/752_打开转盘锁.md) | BFS |
| [329. 矩阵中的最长递增路径](https://leetcode.cn/problems/longest-increasing-path-in-a-matrix/) | 困难 | [站内题解](solution/0301-0400/329_矩阵中的最长递增路径.md) | 记忆化搜索 |
| [212. 单词搜索 II](https://leetcode.cn/problems/word-search-ii/) | 困难 | [站内题解](solution/0201-0300/212_单词搜索II.md) | Trie + DFS 回溯，字节 / Google 高频 |
| [1584. 连接所有点的最小费用](https://leetcode.cn/problems/min-cost-to-connect-all-points/) | 中等 | [站内题解](solution/1501-1600/1584_连接所有点的最小费用.md) | 面试经典 150，Prim 最小生成树 |

### 设计题

| 题目 | 难度 | 题解 | 备注 |
|---|---|---|---|
| [380. O(1) 时间插入、删除和获取随机元素](https://leetcode.cn/problems/insert-delete-getrandom-o1/) | 中等 | [站内题解](solution/0301-0400/380_O1时间插入删除和获取随机元素.md) | 面试经典 150 |
| [355. 设计推特](https://leetcode.cn/problems/design-twitter/) | 中等 | [站内题解](solution/0301-0400/355_设计推特.md) | 面试经典 150，最大堆 K 路归并取 Top-10 |
| [460. LFU 缓存](https://leetcode.cn/problems/lfu-cache/) | 困难 | [站内题解](solution/0401-0500/460_LFU缓存.md) | LRU 姐妹题，频率桶 + 双向链表 |
| [981. 基于时间的键值存储](https://leetcode.cn/problems/time-based-key-value-store/) | 中等 | [站内题解](solution/0901-1000/981_基于时间的键值存储.md) | 面试经典 150，HashMap + 有序数组二分找右界 |
| [264. 丑数 II](https://leetcode.cn/problems/ugly-number-ii/) | 中等 | [站内题解](solution/0201-0300/264_丑数II.md) | 剑指 Offer 49，多路归并 |

## 三、剑指 Offer 高频题

[剑指 Offer](https://leetcode.cn/studyplan/lcof/) 是牛客网、知乎面经中出现最多的题单之一，多数题目在力扣主站有对应题（下表已给出对应关系与题解链接）。个别题目（如逆序对、约瑟夫环）只在剑指 Offer 题库中，直接链接到原题。

| 剑指 Offer | 题目 | 对应题与题解 |
|---|---|---|
| 剑指 Offer 03 | 数组中重复的数字 | [287. 寻找重复数](https://leetcode.cn/problems/find-the-duplicate-number/) ｜ [站内题解](solution/0201-0300/287_寻找重复数.md) |
| 剑指 Offer 04 | 二维数组中的查找 | [240. 搜索二维矩阵 II](https://leetcode.cn/problems/search-a-2d-matrix-ii/) ｜ [站内题解](solution/0201-0300/240_搜索二维矩阵II.md) |
| 剑指 Offer 07 | 重建二叉树 | [105. 从前序与中序遍历序列构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/) ｜ [站内题解](solution/0101-0200/105_从前序与中序遍历序列构造二叉树.md) |
| 剑指 Offer 09 | 用两个栈实现队列 | [232. 用栈实现队列](https://leetcode.cn/problems/implement-queue-using-stacks/) ｜ [站内题解](solution/0201-0300/232_用栈实现队列.md) |
| 剑指 Offer 10 | 斐波那契数列 | [509](https://leetcode.cn/problems/fibonacci-number/) ｜ [站内题解](solution/0501-0600/509_斐波那契数.md) |
| 剑指 Offer 11 | 旋转数组的最小数字 | [153. 寻找旋转排序数组中的最小值](https://leetcode.cn/problems/find-minimum-in-rotated-sorted-array/) ｜ [站内题解](solution/0101-0200/153_寻找旋转排序数组中的最小值.md) |
| 剑指 Offer 12 | 矩阵中的路径 | [79. 单词搜索](https://leetcode.cn/problems/word-search/) ｜ [站内题解](solution/0001-0100/79_单词搜索.md) |
| 剑指 Offer 15 | 二进制中 1 的个数 | [191](https://leetcode.cn/problems/number-of-1-bits/) ｜ [站内题解](solution/0001-0100/191_位1的个数.md) |
| 剑指 Offer 16 | 数值的整数次方 | [50. Pow(x, n)](https://leetcode.cn/problems/powx-n/) ｜ [站内题解](solution/0001-0100/50_Powx_n.md) |
| 剑指 Offer 22 | 链表中倒数第 k 个节点 | [19. 删除链表的倒数第 N 个结点](https://leetcode.cn/problems/remove-nth-node-from-end-of-list/) ｜ [站内题解](solution/0001-0100/19_删除链表的倒数第N个节点.md) |
| 剑指 Offer 24 | 反转链表 | [206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/) ｜ [站内题解](solution/0201-0300/206_反转链表.md) |
| 剑指 Offer 25 | 合并两个排序的链表 | [21. 合并两个有序链表](https://leetcode.cn/problems/merge-two-sorted-lists/) ｜ [站内题解](solution/0001-0100/21_合并两个有序链表.md) |
| 剑指 Offer 27 | 二叉树的镜像 | [226. 翻转二叉树](https://leetcode.cn/problems/invert-binary-tree/) ｜ [站内题解](solution/0201-0300/226_翻转二叉树.md) |
| 剑指 Offer 28 | 对称的二叉树 | [101. 对称二叉树](https://leetcode.cn/problems/symmetric-tree/) ｜ [站内题解](solution/0101-0200/101_对称二叉树.md) |
| 剑指 Offer 29 | 顺时针打印矩阵 | [54. 螺旋矩阵](https://leetcode.cn/problems/spiral-matrix/) ｜ [站内题解](solution/0001-0100/54_螺旋矩阵.md) |
| 剑指 Offer 30 | 包含 min 函数的栈 | [155. 最小栈](https://leetcode.cn/problems/min-stack/) ｜ [站内题解](solution/0101-0200/155_最小栈.md) |
| 剑指 Offer 31 | 栈的压入、弹出序列 | [946. 验证栈序列](https://leetcode.cn/problems/validate-stack-sequences/) ｜ [站内题解](solution/0901-1000/946_验证栈序列.md) |
| 剑指 Offer 34 | 二叉树中和为某一值的路径 | [113. 路径总和 II](https://leetcode.cn/problems/path-sum-ii/) ｜ [站内题解](solution/0101-0200/113_路径总和II.md) |
| 剑指 Offer 35 | 复杂链表的复制 | [138. 随机链表的复制](https://leetcode.cn/problems/copy-list-with-random-pointer/) ｜ [站内题解](solution/0101-0200/138_复制带随机指针的链表.md) |
| 剑指 Offer 39 | 数组中出现次数超过一半的数字 | [169. 多数元素](https://leetcode.cn/problems/majority-element/) ｜ [站内题解](solution/0101-0200/169_多数元素.md) |
| 剑指 Offer 40 | 最小的 k 个数 | [215. 数组中的第 K 个最大元素](https://leetcode.cn/problems/kth-largest-element-in-an-array/) ｜ [站内题解](solution/0201-0300/215_数组中的第K个最大元素.md) |
| 剑指 Offer 41 | 数据流中的中位数 | [295. 数据流的中位数](https://leetcode.cn/problems/find-median-from-data-stream/) ｜ [站内题解](solution/0201-0300/295_数据流的中位数.md) |
| 剑指 Offer 42 | 连续子数组的最大和 | [53. 最大子数组和](https://leetcode.cn/problems/maximum-subarray/) ｜ [站内题解](solution/0001-0100/53_最大子数组和.md) |
| 剑指 Offer 45 | 把数组排成最小的数 | [179. 最大数](https://leetcode.cn/problems/largest-number/) ｜ [站内题解](solution/0101-0200/179_最大数.md) |
| 剑指 Offer 46 | 把数字翻译成字符串 | [91. 解码方法](https://leetcode.cn/problems/decode-ways/) ｜ [站内题解](solution/0001-0100/91_解码方法.md) |
| 剑指 Offer 48 | 最长不含重复字符的子字符串 | [3. 无重复字符的最长子串](https://leetcode.cn/problems/longest-substring-without-repeating-characters/) ｜ [站内题解](solution/0001-0100/3_无重复字符的最长子串.md) |
| 剑指 Offer 49 | 丑数 | [264. 丑数 II](https://leetcode.cn/problems/ugly-number-ii/) ｜ [站内题解](solution/0201-0300/264_丑数II.md) |
| 剑指 Offer 51 | 数组中的逆序对 | [力扣剑指 Offer 题库](https://leetcode.cn/problems/shu-zu-zhong-de-ni-xu-dui-lcof/) ｜ [站内题解](solution/0101-0200/LCOF51_数组中的逆序对.md) |
| 剑指 Offer 52 | 两个链表的第一个公共节点 | [160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/) ｜ [站内题解](solution/0101-0200/160_相交链表.md) |
| 剑指 Offer 53 | 在排序数组中查找数字 | [34. 在排序数组中查找元素的第一个和最后一个位置](https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/) ｜ [站内题解](solution/0001-0100/34_在排序数组中查找元素的第一个和最后一个位置.md) |
| 剑指 Offer 54 | 二叉搜索树的第 k 大节点 | [230. 二叉搜索树中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/) ｜ [站内题解](solution/0201-0300/230_二叉搜索树中第K小的元素.md) |
| 剑指 Offer 55 | 二叉树的深度 / 平衡二叉树 | [110. 平衡二叉树](https://leetcode.cn/problems/balanced-binary-tree/) ｜ [站内题解](solution/0101-0200/110_平衡二叉树.md) |
| 剑指 Offer 56 | 数组中数字出现的次数 | [260. 只出现一次的数字 III](https://leetcode.cn/problems/single-number-iii/) ｜ [站内题解](solution/0201-0300/260_只出现一次的数字III.md) |
| 剑指 Offer 57 | 和为 s 的两个数字 | [167. 两数之和 II - 输入有序数组](https://leetcode.cn/problems/two-sum-ii-input-array-is-sorted/) ｜ [站内题解](solution/0101-0200/167_两数之和%20II%20-%20输入有序数组.md) |
| 剑指 Offer 58 | 翻转单词顺序 | [151. 反转字符串中的单词](https://leetcode.cn/problems/reverse-words-in-a-string/) ｜ [站内题解](solution/0101-0200/151_反转字符串中的单词.md) |
| 剑指 Offer 59 | 滑动窗口的最大值 | [239. 滑动窗口最大值](https://leetcode.cn/problems/sliding-window-maximum/) ｜ [站内题解](solution/0201-0300/239_滑动窗口最大值.md) |
| 剑指 Offer 62 | 圆圈中最后剩下的数字（约瑟夫环） | [力扣剑指 Offer 题库](https://leetcode.cn/problems/yuan-quan-zhong-zui-hou-sheng-xia-de-shu-zi-lcof/) ｜ [站内题解](solution/0101-0200/LCOF62_圆圈中最后剩下的数字.md) |
| 剑指 Offer 65 | 不用加减乘除做加法 | [371](https://leetcode.cn/problems/sum-of-two-integers/) ｜ [站内题解](solution/0301-0400/371_两整数之和.md) |
| 剑指 Offer 66 | 构建乘积数组 | [238. 除自身以外数组的乘积](https://leetcode.cn/problems/product-of-array-except-self/) ｜ [站内题解](solution/0201-0300/238_除自身以外数组的乘积.md) |
| 剑指 Offer 68 | 树中两个节点的最近公共祖先 | [236. 二叉树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/) ｜ [站内题解](solution/0201-0300/236_二叉树的最近公共祖先.md) |

## 四、10 周刷题计划（按类别组织）

已单独成文：[📅 10 周算法面试刷题计划](10-week-plan.md)——把本页 198 题按类别编排为 10 周，每周 3-6 天刷题 + 1 天复盘。

## 四、数据来源与参考

- [LeetCode 热题 HOT 100](https://leetcode.cn/studyplan/top-100-liked/) — 力扣官方热度榜单
- [LeetCode 面试经典 150 题](https://leetcode.cn/studyplan/top-interview-150/) — 力扣官方面试题单
- [CodeTop](https://codetop.cc/home) / [afatcoder/LeetcodeTop](https://github.com/afatcoder/LeetcodeTop) — 基于牛客网面经的分公司、分岗位题目频率统计
- [剑指 Offer 学习计划](https://leetcode.cn/studyplan/lcof/) — 力扣官方剑指 Offer 题单
- 知乎：[字节跳动面试高频算法题汇总（389 篇牛客面经统计）](https://zhuanlan.zhihu.com/p/336117700)
- 牛客网：[高频知识总结｜算法题如何刷？我的高效刷题方法](https://www.nowcoder.com/discuss/353159068472778752)
- 力扣讨论区：[【分类整理】面试最常考的 100 道算法题](https://leetcode.cn/discuss/post/3283931/)

---

本页共收录 **241** 道高频题（不含剑指 Offer 重复对应），其中 **241** 道已有本站题解，持续补充中。
