# 📅 10 周算法面试刷题计划

本计划把 [高频算法面试题汇总](hot-interview.md) 中的 **200 道高频面试题**（Hot 100 / CodeTop / 面试经典 150 / 剑指 Offer）按类别编排为 10 周，每周 3-6 天刷题 + 1 天复盘（复盘日重做本周错题、默写模板）。节奏建议：**简单题一天 3-4 道快速过，中等题 2-3 道，困难题 1 道吃透**；题目后带「题解」的表示本站已有详细中文题解，卡壳 20 分钟就看题解、看懂后自己默写一遍。

## 第 1 周：数组、哈希与双指针（含手撕排序）（26 题）

建立数组基本功：哈希查重、双指针、前缀和，以及面试必考的手撕排序。

| 天数 | 题目 |
|---|---|
| Day 1 哈希 | [1. 两数之和](https://leetcode.cn/problems/two-sum/)（[题解](solution/0001-0100/1_两数之和.md)）、[49. 字母异位词分组](https://leetcode.cn/problems/group-anagrams/)（[题解](solution/0001-0100/49_字母异位词分组.md)）、[128. 最长连续序列](https://leetcode.cn/problems/longest-consecutive-sequence/)（[题解](solution/0101-0200/128_最长连续序列.md)）、[136. 只出现一次的数字](https://leetcode.cn/problems/single-number/)（[题解](solution/0101-0200/136_只出现一次的数字.md)）、[169. 多数元素](https://leetcode.cn/problems/majority-element/)（[题解](solution/0101-0200/169_多数元素.md)） |
| Day 2 双指针 | [283. 移动零](https://leetcode.cn/problems/move-zeroes/)（[题解](solution/0201-0300/283_移动零.md)）、[11. 盛最多水的容器](https://leetcode.cn/problems/container-with-most-water/)（[题解](solution/0001-0100/11_盛最多水的容器.md)）、[15. 三数之和](https://leetcode.cn/problems/3sum/)（[题解](solution/0001-0100/15_三数之和.md)）、[42. 接雨水](https://leetcode.cn/problems/trapping-rain-water/)（[题解](solution/0001-0100/42_接雨水.md)） |
| Day 3 数组 DP / 前缀和 | [53. 最大子数组和](https://leetcode.cn/problems/maximum-subarray/)（[题解](solution/0001-0100/53_最大子数组和.md)）、[56. 合并区间](https://leetcode.cn/problems/merge-intervals/)（[题解](solution/0001-0100/56_合并区间.md)）、[238. 除自身以外数组的乘积](https://leetcode.cn/problems/product-of-array-except-self/)（[题解](solution/0201-0300/238_除自身以外数组的乘积.md)）、[41. 缺失的第一个正数](https://leetcode.cn/problems/first-missing-positive/)（[题解](solution/0001-0100/41_缺失的第一个正数.md)） |
| Day 4 手撕排序 | [912. 排序数组](https://leetcode.cn/problems/sort-an-array/)（[题解](solution/0901-1000/912_排序数组.md)）、[88. 合并两个有序数组](https://leetcode.cn/problems/merge-sorted-array/)（[题解](solution/0001-0100/88_合并两个有序数组.md)）、[179. 最大数](https://leetcode.cn/problems/largest-number/)（[题解](solution/0101-0200/179_最大数.md)）、[274. H 指数](https://leetcode.cn/problems/h-index/)（[题解](solution/0201-0300/274_H指数.md)） |
| Day 5 数组技巧 | [75. 颜色分类](https://leetcode.cn/problems/sort-colors/)（[题解](solution/0001-0100/75_颜色分类.md)）、[31. 下一个排列](https://leetcode.cn/problems/next-permutation/)（[题解](solution/0001-0100/31_下一个排列.md)）、[287. 寻找重复数](https://leetcode.cn/problems/find-the-duplicate-number/)（[题解](solution/0201-0300/287_寻找重复数.md)）、[189. 轮转数组](https://leetcode.cn/problems/rotate-array/)（[题解](solution/0101-0200/189_轮转数组.md)） |
| Day 6 位运算与其他 | [137. 只出现一次的数字 II](https://leetcode.cn/problems/single-number-ii/)（[题解](solution/0101-0200/137_只出现一次的数字II.md)）、[260. 只出现一次的数字 III](https://leetcode.cn/problems/single-number-iii/)（[题解](solution/0201-0300/260_只出现一次的数字III.md)）、[338. 比特位计数](https://leetcode.cn/problems/counting-bits/)（[题解](solution/0301-0400/338_比特位计数.md)）、[349. 两个数组的交集](https://leetcode.cn/problems/intersection-of-two-arrays/)（[题解](solution/0301-0400/349_两个数组的交集.md)）、[581. 最短无序连续子数组](https://leetcode.cn/problems/shortest-unsorted-continuous-subarray/)（[题解](solution/0501-0600/581_最短无序连续子数组.md)） |
| Day 7 复盘 | 重做本周错题，总结模板笔记 |

## 第 2 周：字符串、滑动窗口与矩阵（20 题）

掌握滑动窗口模板（可变窗口求最长/最短），字符串模拟题注意边界处理。

| 天数 | 题目 |
|---|---|
| Day 1 滑动窗口基础 | [3. 无重复字符的最长子串](https://leetcode.cn/problems/longest-substring-without-repeating-characters/)（[题解](solution/0001-0100/3_无重复字符的最长子串.md)）、[438. 找到字符串中所有字母异位词](https://leetcode.cn/problems/find-all-anagrams-in-a-string/)（[题解](solution/0401-0500/438_找到字符串中所有字母异位词.md)）、[560. 和为 K 的子数组](https://leetcode.cn/problems/subarray-sum-equals-k/)（[题解](solution/0501-0600/560_和为K的子数组.md)）、[974. 和可被 K 整除的子数组](https://leetcode.cn/problems/subarray-sums-divisible-by-k/)（[题解](solution/0901-1000/974_和可被K整除的子数组.md)） |
| Day 2 滑动窗口进阶 | [239. 滑动窗口最大值](https://leetcode.cn/problems/sliding-window-maximum/)（[题解](solution/0201-0300/239_滑动窗口最大值.md)）、[76. 最小覆盖子串](https://leetcode.cn/problems/minimum-window-substring/)（[题解](solution/0001-0100/76_最小覆盖子串.md)）、[209. 长度最小的子数组](https://leetcode.cn/problems/minimum-size-subarray-sum/)（[题解](solution/0201-0300/209_长度最小的子数组.md)）、[424. 替换后的最长重复字符](https://leetcode.cn/problems/longest-repeating-character-replacement/)（[题解](solution/0401-0500/424_替换后的最长重复字符.md)）、[713. 乘积小于 K 的子数组](https://leetcode.cn/problems/subarray-product-less-than-k/)（[题解](solution/0701-0800/713_乘积小于K的子数组.md)） |
| Day 3 字符串模拟 | [415. 字符串相加](https://leetcode.cn/problems/add-strings/)（[题解](solution/0401-0500/415_字符串相加.md)）、[43. 字符串相乘](https://leetcode.cn/problems/multiply-strings/)（[题解](solution/0001-0100/43_字符串相乘.md)）、[151. 反转字符串中的单词](https://leetcode.cn/problems/reverse-words-in-a-string/)（[题解](solution/0101-0200/151_反转字符串中的单词.md)）、[14. 最长公共前缀](https://leetcode.cn/problems/longest-common-prefix/)（[题解](solution/0001-0100/14_最长公共前缀.md)） |
| Day 4 字符串匹配 | [165. 比较版本号](https://leetcode.cn/problems/compare-version-numbers/)（[题解](solution/0101-0200/165_比较版本号.md)）、[8. 字符串转换整数（atoi）](https://leetcode.cn/problems/string-to-integer-atoi/)（[题解](solution/0001-0100/8_字符串转换整数atoi.md)）、[28. 找出字符串中第一个匹配项的下标](https://leetcode.cn/problems/find-the-index-of-the-first-occurrence-in-a-string/)（[题解](solution/0001-0100/28_找出字符串中第一个匹配项的下标.md)）、[468. 验证 IP 地址](https://leetcode.cn/problems/validate-ip-address/)（[题解](solution/0401-0500/468_验证IP地址.md)） |
| Day 5 矩阵 | [73. 矩阵置零](https://leetcode.cn/problems/set-matrix-zeroes/)（[题解](solution/0001-0100/73_矩阵置零.md)）、[54. 螺旋矩阵](https://leetcode.cn/problems/spiral-matrix/)（[题解](solution/0001-0100/54_螺旋矩阵.md)）、[48. 旋转图像](https://leetcode.cn/problems/rotate-image/)（[题解](solution/0001-0100/48_旋转图像.md)）、[240. 搜索二维矩阵 II](https://leetcode.cn/problems/search-a-2d-matrix-ii/)（[题解](solution/0201-0300/240_搜索二维矩阵II.md)） |
| Day 6 复盘 | 重做本周错题，总结模板笔记 |

## 第 3 周：链表与数学技巧（25 题）

链表题套路固定（哑节点、快慢指针、反转三板斧），争取做到白板默写。

| 天数 | 题目 |
|---|---|
| Day 1 反转与合并 | [206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/)（[题解](solution/0201-0300/206_反转链表.md)）、[21. 合并两个有序链表](https://leetcode.cn/problems/merge-two-sorted-lists/)（[题解](solution/0001-0100/21_合并两个有序链表.md)）、[83. 删除排序链表中的重复元素](https://leetcode.cn/problems/remove-duplicates-from-sorted-list/)（[题解](solution/0001-0100/83_删除排序链表中的重复元素.md)）、[876. 链表的中间结点](https://leetcode.cn/problems/middle-of-the-linked-list/)（[题解](solution/0801-0900/876_链表的中间结点.md)） |
| Day 2 快慢指针 | [141. 环形链表](https://leetcode.cn/problems/linked-list-cycle/)（[题解](solution/0101-0200/141_环形链表.md)）、[142. 环形链表 II](https://leetcode.cn/problems/linked-list-cycle-ii/)（[题解](solution/0101-0200/142_环形链表%20II.md)）、[160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/)（[题解](solution/0101-0200/160_相交链表.md)）、[19. 删除链表的倒数第 N 个结点](https://leetcode.cn/problems/remove-nth-node-from-end-of-list/)（[题解](solution/0001-0100/19_删除链表的倒数第N个节点.md)）、[234. 回文链表](https://leetcode.cn/problems/palindrome-linked-list/)（[题解](solution/0201-0300/234_回文链表.md)） |
| Day 3 链表变换 | [24. 两两交换链表中的节点](https://leetcode.cn/problems/swap-nodes-in-pairs/)（[题解](solution/0001-0100/24_两两交换链表中的节点.md)）、[25. K 个一组翻转链表](https://leetcode.cn/problems/reverse-nodes-in-k-group/)（[题解](solution/0001-0100/25_K个一组翻转链表.md)）、[92. 反转链表 II](https://leetcode.cn/problems/reverse-linked-list-ii/)（[题解](solution/0001-0100/92_反转链表%20II.md)）、[143. 重排链表](https://leetcode.cn/problems/reorder-list/)（[题解](solution/0101-0200/143_重排链表.md)）、[328. 奇偶链表](https://leetcode.cn/problems/odd-even-linked-list/)（[题解](solution/0301-0400/328_奇偶链表.md)） |
| Day 4 相加与复制 | [2. 两数相加](https://leetcode.cn/problems/add-two-numbers/)（[题解](solution/0001-0100/2_两数相加.md)）、[445. 两数相加 II](https://leetcode.cn/problems/add-two-numbers-ii/)（[题解](solution/0401-0500/445_两数相加%20II.md)）、[138. 随机链表的复制](https://leetcode.cn/problems/copy-list-with-random-pointer/)（[题解](solution/0101-0200/138_复制带随机指针的链表.md)）、[430. 扁平化多级双向链表](https://leetcode.cn/problems/flatten-a-multilevel-doubly-linked-list/)（[题解](solution/0401-0500/430_扁平化多级双向链表.md)） |
| Day 5 排序与设计 | [148. 排序链表](https://leetcode.cn/problems/sort-list/)（[题解](solution/0101-0200/148_排序链表.md)）、[23. 合并 K 个升序链表](https://leetcode.cn/problems/merge-k-sorted-lists/)（[题解](solution/0001-0100/23_合并K个升序链表.md)）、[146. LRU 缓存](https://leetcode.cn/problems/lru-cache/)（[题解](solution/0101-0200/146_LRU缓存.md)） |
| Day 6 数学技巧 | [50. Pow(x, n)](https://leetcode.cn/problems/powx-n/)（[题解](solution/0001-0100/50_Powx_n.md)）、[470. 用 Rand7() 实现 Rand10()](https://leetcode.cn/problems/implement-rand10-using-rand7/)（[题解](solution/0401-0500/470_用Rand7实现Rand10.md)）、[289. 生命游戏](https://leetcode.cn/problems/game-of-life/)（[题解](solution/0201-0300/289_生命游戏.md)）、[166. 分数到小数](https://leetcode.cn/problems/fraction-to-recurring-decimal/)（[题解](solution/0101-0200/166_分数到小数.md)）、[168. Excel 表列名称](https://leetcode.cn/problems/excel-sheet-column-title/)（[题解](solution/0001-0100/168_Excel表列名称.md)） |
| Day 7 复盘 | 重做本周错题，总结模板笔记 |

## 第 4 周：栈、队列与单调栈（16 题）

栈是面试基础数据结构；单调栈是面试分水岭，记住「找下一个更大/更小」的模板。

| 天数 | 题目 |
|---|---|
| Day 1 栈基础与设计 | [20. 有效的括号](https://leetcode.cn/problems/valid-parentheses/)（[题解](solution/0001-0100/20_有效括号.md)）、[155. 最小栈](https://leetcode.cn/problems/min-stack/)（[题解](solution/0101-0200/155_最小栈.md)）、[232. 用栈实现队列](https://leetcode.cn/problems/implement-queue-using-stacks/)（[题解](solution/0201-0300/232_用栈实现队列.md)）、[150. 逆波兰表达式求值](https://leetcode.cn/problems/evaluate-reverse-polish-notation/)（[题解](solution/0101-0200/150_逆波兰表达式求值.md)）、[380. O(1) 时间插入、删除和获取随机元素](https://leetcode.cn/problems/insert-delete-getrandom-o1/)（[题解](solution/0301-0400/380_O1时间插入删除和获取随机元素.md)）、[946. 验证栈序列](https://leetcode.cn/problems/validate-stack-sequences/)（[题解](solution/0901-1000/946_验证栈序列.md)） |
| Day 2 表达式与计算器 | [394. 字符串解码](https://leetcode.cn/problems/decode-string/)（[题解](solution/0301-0400/394_字符串解码.md)）、[224. 基本计算器](https://leetcode.cn/problems/basic-calculator/)（[题解](solution/0201-0300/224_基本计算器.md)）、[227. 基本计算器 II](https://leetcode.cn/problems/basic-calculator-ii/)（[题解](solution/0201-0300/227_基本计算器II.md)）、[402. 移掉 K 位数字](https://leetcode.cn/problems/remove-k-digits/)（[题解](solution/0401-0500/402_移掉K位数字.md)）、[316. 去除重复字母](https://leetcode.cn/problems/remove-duplicate-letters/)（[题解](solution/0301-0400/316_去除重复字母.md)） |
| Day 3 单调栈 | [739. 每日温度](https://leetcode.cn/problems/daily-temperatures/)（[题解](solution/0701-0800/739_每日温度.md)）、[496. 下一个更大元素 I](https://leetcode.cn/problems/next-greater-element-i/)（[题解](solution/0401-0500/496_下一个更大元素%20I.md)）、[503. 下一个更大元素 II](https://leetcode.cn/problems/next-greater-element-ii/)（[题解](solution/0501-0600/503_下一个更大元素%20II.md)）、[901. 股票价格跨度](https://leetcode.cn/problems/online-stock-span/)（[题解](solution/0901-1000/901_股票价格跨度.md)）、[84. 柱状图中最大的矩形](https://leetcode.cn/problems/largest-rectangle-in-histogram/)（[题解](solution/0001-0100/84_柱状图中最大的矩形.md)） |
| Day 4 复盘 | 重做本周错题，总结模板笔记 |

## 第 5 周：堆、贪心与区间（16 题）

堆是 Top-K 问题的通用解法；区间贪心记住「按右端点排序」的直觉。

| 天数 | 题目 |
|---|---|
| Day 1 堆 | [215. 数组中的第 K 个最大元素](https://leetcode.cn/problems/kth-largest-element-in-an-array/)（[题解](solution/0201-0300/215_数组中的第K个最大元素.md)）、[347. 前 K 个高频元素](https://leetcode.cn/problems/top-k-frequent-elements/)（[题解](solution/0301-0400/347_前K个高频元素.md)）、[692. 前 K 个高频单词](https://leetcode.cn/problems/top-k-frequent-words/)（[题解](solution/0601-0700/692_前K个高频单词.md)）、[295. 数据流的中位数](https://leetcode.cn/problems/find-median-from-data-stream/)（[题解](solution/0201-0300/295_数据流的中位数.md)）、[264. 丑数 II](https://leetcode.cn/problems/ugly-number-ii/)（[题解](solution/0201-0300/264_丑数II.md)）、[767. 重构字符串](https://leetcode.cn/problems/reorganize-string/)（[题解](solution/0701-0800/767_重构字符串.md)） |
| Day 2 贪心 | [121. 买卖股票的最佳时机](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock/)（[题解](solution/0101-0200/121_买卖股票的最佳时机.md)）、[55. 跳跃游戏](https://leetcode.cn/problems/jump-game/)（[题解](solution/0001-0100/55_跳跃游戏.md)）、[45. 跳跃游戏 II](https://leetcode.cn/problems/jump-game-ii/)（[题解](solution/0001-0100/45_跳跃游戏%20II.md)）、[763. 划分字母区间](https://leetcode.cn/problems/partition-labels/)（[题解](solution/0701-0800/763_划分字母区间.md)）、[621. 任务调度器](https://leetcode.cn/problems/task-scheduler/)（[题解](solution/0601-0700/621_任务调度器.md)） |
| Day 3 区间与差分 | [253. 会议室 II](https://leetcode.cn/problems/meeting-rooms-ii/)（[题解](solution/0201-0300/253_会议室II.md)）、[435. 无重叠区间](https://leetcode.cn/problems/non-overlapping-intervals/)（[题解](solution/0401-0500/435_无重叠区间.md)）、[452. 用最少数量的箭引爆气球](https://leetcode.cn/problems/minimum-number-of-arrows-to-burst-balloons/)（[题解](solution/0401-0500/452_用最少数量的箭引爆气球.md)）、[406. 根据身高重建队列](https://leetcode.cn/problems/queue-reconstruction-by-height/)（[题解](solution/0401-0500/406_根据身高重建队列.md)）、[1109. 航班预订统计](https://leetcode.cn/problems/corporate-flight-bookings/)（[题解](solution/1101-1200/1109_航班预订统计.md)） |
| Day 4 复盘 | 重做本周错题，总结模板笔记 |

## 第 6 周：二叉树（上）——遍历、形态与 BST（20 题）

树的题 90% 是遍历的变形。递归三要素（参数、终止条件、返回值）要写之前先想清楚。

| 天数 | 题目 |
|---|---|
| Day 1 遍历 | [94. 二叉树的中序遍历](https://leetcode.cn/problems/binary-tree-inorder-traversal/)（[题解](solution/0001-0100/94_二叉树的中序遍历.md)）、[144. 二叉树的前序遍历](https://leetcode.cn/problems/binary-tree-preorder-traversal/)（[题解](solution/0101-0200/144_二叉树的前序遍历.md)）、[145. 二叉树的后序遍历](https://leetcode.cn/problems/binary-tree-postorder-traversal/)（[题解](solution/0101-0200/145_二叉树的后序遍历.md)）、[102. 二叉树的层序遍历](https://leetcode.cn/problems/binary-tree-level-order-traversal/)（[题解](solution/0101-0200/102_二叉树的层序遍历.md)）、[103. 二叉树的锯齿形层序遍历](https://leetcode.cn/problems/binary-tree-zigzag-level-order-traversal/)（[题解](solution/0101-0200/103_二叉树的锯齿形层序遍历.md)） |
| Day 2 形态与深度 | [104. 二叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-binary-tree/)（[题解](solution/0101-0200/104_二叉树的最大深度.md)）、[226. 翻转二叉树](https://leetcode.cn/problems/invert-binary-tree/)（[题解](solution/0201-0300/226_翻转二叉树.md)）、[101. 对称二叉树](https://leetcode.cn/problems/symmetric-tree/)（[题解](solution/0101-0200/101_对称二叉树.md)）、[543. 二叉树的直径](https://leetcode.cn/problems/diameter-of-binary-tree/)（[题解](solution/0501-0600/543_二叉树的直径.md)）、[110. 平衡二叉树](https://leetcode.cn/problems/balanced-binary-tree/)（[题解](solution/0101-0200/110_平衡二叉树.md)） |
| Day 3 BST 基础 | [111. 二叉树的最小深度](https://leetcode.cn/problems/minimum-depth-of-binary-tree/)（[题解](solution/0101-0200/111_二叉树的最小深度.md)）、[559. N 叉树的最大深度](https://leetcode.cn/problems/maximum-depth-of-n-ary-tree/)（[题解](solution/0501-0600/559_N叉树的最大深度.md)）、[108. 将有序数组转换为二叉搜索树](https://leetcode.cn/problems/convert-sorted-array-to-binary-search-tree/)（[题解](solution/0101-0200/108_将有序数组转换为二叉搜索树.md)）、[98. 验证二叉搜索树](https://leetcode.cn/problems/validate-binary-search-tree/)（[题解](solution/0001-0100/98_验证二叉搜索树.md)）、[230. 二叉搜索树中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-bst/)（[题解](solution/0201-0300/230_二叉搜索树中第K小的元素.md)） |
| Day 4 BST 进阶与构造 | [235. 二叉搜索树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-search-tree/)（[题解](solution/0201-0300/235_二叉搜索树的最近公共祖先.md)）、[173. 二叉搜索树迭代器](https://leetcode.cn/problems/binary-search-tree-iterator/)（[题解](solution/0101-0200/173_二叉搜索树迭代器.md)）、[1008. 前序遍历构造二叉搜索树](https://leetcode.cn/problems/construct-binary-search-tree-from-preorder-traversal/)（[题解](solution/1001-1100/1008_前序遍历构造二叉搜索树.md)）、[105. 从前序与中序遍历序列构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/)（[题解](solution/0101-0200/105_从前序与中序遍历序列构造二叉树.md)）、[889. 根据前序与后序遍历构造二叉树](https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-postorder-traversal/)（[题解](solution/0801-0900/889_根据前序与后序遍历构造二叉树.md)） |
| Day 5 复盘 | 重做本周错题，总结模板笔记 |

## 第 7 周：二叉树（下）+ 回溯 + 网格搜索（25 题）

路径类问题用后序 DFS；回溯记住「选择列表 + 路径 + 撤销选择」模板。

| 天数 | 题目 |
|---|---|
| Day 1 路径问题 | [112. 路径总和](https://leetcode.cn/problems/path-sum/)（[题解](solution/0101-0200/112_路径总和.md)）、[113. 路径总和 II](https://leetcode.cn/problems/path-sum-ii/)（[题解](solution/0101-0200/113_路径总和II.md)）、[129. 求根节点到叶节点数字之和](https://leetcode.cn/problems/sum-root-to-leaf-numbers/)（[题解](solution/0101-0200/129_求根节点到叶节点数字之和.md)）、[222. 完全二叉树的节点个数](https://leetcode.cn/problems/count-complete-tree-nodes/)（[题解](solution/0201-0300/222_完全二叉树的节点个数.md)）、[437. 路径总和 III](https://leetcode.cn/problems/path-sum-iii/)（[题解](solution/0401-0500/437_路径总和III.md)） |
| Day 2 LCA 与路径和 | [236. 二叉树的最近公共祖先](https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/)（[题解](solution/0201-0300/236_二叉树的最近公共祖先.md)）、[124. 二叉树中的最大路径和](https://leetcode.cn/problems/binary-tree-maximum-path-sum/)（[题解](solution/0101-0200/124_二叉树中的最大路径和.md)）、[199. 二叉树的右视图](https://leetcode.cn/problems/binary-tree-right-side-view/)（[题解](solution/0101-0200/199_二叉树的右视图.md)）、[114. 二叉树展开为链表](https://leetcode.cn/problems/flatten-binary-tree-to-linked-list/)（[题解](solution/0101-0200/114_二叉树展开为链表.md)） |
| Day 3 序列化与宽度 | [297. 二叉树的序列化与反序列化](https://leetcode.cn/problems/serialize-and-deserialize-binary-tree/)（[题解](solution/0201-0300/297_二叉树的序列化与反序列化.md)）、[662. 二叉树最大宽度](https://leetcode.cn/problems/maximum-width-of-binary-tree/)（[题解](solution/0601-0700/662_二叉树最大宽度.md)）、[958. 二叉树的完全性检验](https://leetcode.cn/problems/check-completeness-of-a-binary-tree/)（[题解](solution/0901-1000/958_二叉树的完全性检验.md)） |
| Day 4 网格 DFS/BFS | [200. 岛屿数量](https://leetcode.cn/problems/number-of-islands/)（[题解](solution/0101-0200/200_岛屿数量.md)）、[994. 腐烂的橘子](https://leetcode.cn/problems/rotting-oranges/)（[题解](solution/0901-1000/994_腐烂的橘子.md)）、[695. 岛屿的最大面积](https://leetcode.cn/problems/max-area-of-island/)（[题解](solution/0601-0700/695_岛屿的最大面积.md)）、[130. 被围绕的区域](https://leetcode.cn/problems/surrounded-regions/)（[题解](solution/0101-0200/130_被围绕的区域.md)） |
| Day 5 回溯基础 | [46. 全排列](https://leetcode.cn/problems/permutations/)（[题解](solution/0001-0100/46_全排列.md)）、[77. 组合](https://leetcode.cn/problems/combinations/)（[题解](solution/0001-0100/77_组合.md)）、[78. 子集](https://leetcode.cn/problems/subsets/)（[题解](solution/0001-0100/78_子集.md)）、[39. 组合总和](https://leetcode.cn/problems/combination-sum/)（[题解](solution/0001-0100/39_组合总和.md)）、[17. 电话号码的字母组合](https://leetcode.cn/problems/letter-combinations-of-a-phone-number/)（[题解](solution/0001-0100/17_电话号码的字母组合.md)） |
| Day 6 回溯进阶 | [22. 括号生成](https://leetcode.cn/problems/generate-parentheses/)（[题解](solution/0001-0100/22_括号生成.md)）、[79. 单词搜索](https://leetcode.cn/problems/word-search/)（[题解](solution/0001-0100/79_单词搜索.md)）、[131. 分割回文串](https://leetcode.cn/problems/palindrome-partitioning/)（[题解](solution/0101-0200/131_分割回文串.md)）、[51. N 皇后](https://leetcode.cn/problems/n-queens/)（[题解](solution/0001-0100/51_N皇后.md)）、[93. 复原 IP 地址](https://leetcode.cn/problems/restore-ip-addresses/)（[题解](solution/0001-0100/93_复原IP地址.md)）、[89. 格雷编码](https://leetcode.cn/problems/gray-code/)（[题解](solution/0001-0100/89_格雷编码.md)） |
| Day 7 复盘 | 重做本周错题，总结模板笔记 |

## 第 8 周：二分查找与动态规划基础（25 题）

二分核心是「区间定义一致」；DP 入门先写暴力递归，再记忆化，再改递推。

| 天数 | 题目 |
|---|---|
| Day 1 二分模板 | [704. 二分查找](https://leetcode.cn/problems/binary-search/)（[题解](solution/0701-0800/704_二分查找.md)）、[35. 搜索插入位置](https://leetcode.cn/problems/search-insert-position/)（[题解](solution/0001-0100/35_搜索插入位置.md)）、[69. x 的平方根](https://leetcode.cn/problems/sqrtx/)（[题解](solution/0001-0100/69_x的平方根.md)）、[74. 搜索二维矩阵](https://leetcode.cn/problems/search-a-2d-matrix/)（[题解](solution/0001-0100/74_搜索二维矩阵.md)） |
| Day 2 旋转数组与峰值 | [153. 寻找旋转排序数组中的最小值](https://leetcode.cn/problems/find-minimum-in-rotated-sorted-array/)（[题解](solution/0101-0200/153_寻找旋转排序数组中的最小值.md)）、[33. 搜索旋转排序数组](https://leetcode.cn/problems/search-in-rotated-sorted-array/)（[题解](solution/0001-0100/33_搜索旋转排序数组.md)）、[34. 在排序数组中查找元素的第一个和最后一个位置](https://leetcode.cn/problems/find-first-and-last-position-of-element-in-sorted-array/)（[题解](solution/0001-0100/34_在排序数组中查找元素的第一个和最后一个位置.md)）、[162. 寻找峰值](https://leetcode.cn/problems/find-peak-element/)（[题解](solution/0101-0200/162_寻找峰值.md)）、[540. 有序数组中的单一元素](https://leetcode.cn/problems/single-element-in-a-sorted-array/)（[题解](solution/0501-0600/540_有序数组中的单一元素.md)） |
| Day 3 二分答案 | [875. 爱吃香蕉的珂珂](https://leetcode.cn/problems/koko-eating-bananas/)（[题解](solution/0801-0900/875_爱吃香蕉的珂珂.md)）、[1011. 在 D 天内送达包裹的能力](https://leetcode.cn/problems/capacity-to-ship-packages-within-d-days/)（[题解](solution/1001-1100/1011_在D天内送达包裹的能力.md)）、[378. 有序矩阵中第 K 小的元素](https://leetcode.cn/problems/kth-smallest-element-in-a-sorted-matrix/)（[题解](solution/0301-0400/378_有序矩阵中第K小的元素.md)） |
| Day 4 二分进阶 | [410. 分割数组的最大值](https://leetcode.cn/problems/split-array-largest-sum/)（[题解](solution/0401-0500/410_分割数组的最大值.md)）、[719. 找出第 K 小的数对距离](https://leetcode.cn/problems/find-k-th-smallest-pair-distance/)（[题解](solution/0701-0800/719_找出第K小的数对距离.md)）、[4. 寻找两个正序数组的中位数](https://leetcode.cn/problems/median-of-two-sorted-arrays/)（[题解](solution/0001-0100/4_寻找两个正序数组的中位数.md)） |
| Day 5 一维 DP | [70. 爬楼梯](https://leetcode.cn/problems/climbing-stairs/)（[题解](solution/0001-0100/70_爬楼梯.md)）、[118. 杨辉三角](https://leetcode.cn/problems/pascals-triangle/)（[题解](solution/0001-0100/118_杨辉三角.md)）、[198. 打家劫舍](https://leetcode.cn/problems/house-robber/)（[题解](solution/0101-0200/198_打家劫舍.md)）、[213. 打家劫舍 II](https://leetcode.cn/problems/house-robber-ii/)（[题解](solution/0201-0300/213_打家劫舍II.md)）、[337. 打家劫舍 III](https://leetcode.cn/problems/house-robber-iii/)（[题解](solution/0301-0400/337_打家劫舍III.md)） |
| Day 6 背包 DP | [279. 完全平方数](https://leetcode.cn/problems/perfect-squares/)（[题解](solution/0201-0300/279_完全平方数.md)）、[322. 零钱兑换](https://leetcode.cn/problems/coin-change/)（[题解](solution/0301-0400/322_零钱兑换.md)）、[518. 零钱兑换 II](https://leetcode.cn/problems/coin-change-ii/)（[题解](solution/0501-0600/518_零钱兑换II.md)）、[416. 分割等和子集](https://leetcode.cn/problems/partition-equal-subset-sum/)（[题解](solution/0401-0500/416_分割等和子集.md)）、[494. 目标和](https://leetcode.cn/problems/target-sum/)（[题解](solution/0401-0500/494_目标和.md)） |
| Day 7 复盘 | 重做本周错题，总结模板笔记 |

## 第 9 周：动态规划进阶——子序列、区间与二维 DP（15 题）

收官阶段：子序列/区间 DP 与二维 DP 模板，先写暴力递归再改递推。

| 天数 | 题目 |
|---|---|
| Day 1 子数组与子序列 | [139. 单词拆分](https://leetcode.cn/problems/word-break/)（[题解](solution/0101-0200/139_单词拆分.md)）、[152. 乘积最大子数组](https://leetcode.cn/problems/maximum-product-subarray/)（[题解](solution/0101-0200/152_乘积最大子数组.md)）、[300. 最长递增子序列](https://leetcode.cn/problems/longest-increasing-subsequence/)（[题解](solution/0201-0300/300_最长递增子序列.md)）、[354. 俄罗斯套娃信封问题](https://leetcode.cn/problems/russian-doll-envelopes/)（[题解](solution/0301-0400/354_俄罗斯套娃信封问题.md)） |
| Day 2 回文与区间 DP | [647. 回文子串](https://leetcode.cn/problems/palindromic-substrings/)（[题解](solution/0601-0700/647_回文子串.md)）、[516. 最长回文子序列](https://leetcode.cn/problems/longest-palindromic-subsequence/)（[题解](solution/0501-0600/516_最长回文子序列.md)）、[5. 最长回文子串](https://leetcode.cn/problems/longest-palindromic-substring/)（[题解](solution/0001-0100/5_最长回文子串.md)）、[312. 戳气球](https://leetcode.cn/problems/burst-balloons/)（[题解](solution/0301-0400/312_戳气球.md)）、[32. 最长有效括号](https://leetcode.cn/problems/longest-valid-parentheses/)（[题解](solution/0001-0100/32_最长有效括号.md)） |
| Day 3 二维 DP | [62. 不同路径](https://leetcode.cn/problems/unique-paths/)（[题解](solution/0001-0100/62_不同路径.md)）、[64. 最小路径和](https://leetcode.cn/problems/minimum-path-sum/)（[题解](solution/0001-0100/64_最小路径和.md)）、[120. 三角形最小路径和](https://leetcode.cn/problems/triangle/)（[题解](solution/0101-0200/120_三角形最小路径和.md)）、[1143. 最长公共子序列](https://leetcode.cn/problems/longest-common-subsequence/)（[题解](solution/1101-1200/1143_最长公共子序列.md)）、[72. 编辑距离](https://leetcode.cn/problems/edit-distance/)（[题解](solution/0001-0100/72_编辑距离.md)）、[221. 最大正方形](https://leetcode.cn/problems/maximal-square/)（[题解](solution/0201-0300/221_最大正方形.md)） |
| Day 4 复盘 | 重做本周错题，总结模板笔记 |

## 第 10 周：股票 DP、划分与图论（17 题）

收官周：股票系列 DP、划分问题与图论模板（拓扑排序、并查集、Dijkstra），最后留出时间整体复盘错题。

| 天数 | 题目 |
|---|---|
| Day 1 股票与划分 | [122. 买卖股票的最佳时机 II](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-ii/)（[题解](solution/0101-0200/122_买卖股票的最佳时机II.md)）、[123. 买卖股票的最佳时机 III](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iii/)（[题解](solution/0101-0200/123_买卖股票的最佳时机III.md)）、[188. 买卖股票的最佳时机 IV](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-iv/)（[题解](solution/0101-0200/188_买卖股票的最佳时机IV.md)）、[309. 买卖股票的最佳时机含冷冻期](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-with-cooldown/)（[题解](solution/0301-0400/309_买卖股票的最佳时机含冷冻期.md)）、[714. 买卖股票的最佳时机含手续费](https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-with-transaction-fee/)（[题解](solution/0701-0800/714_买卖股票的最佳时机含手续费.md)）、[698. 划分为 K 个相等的子集](https://leetcode.cn/problems/partition-to-k-equal-sum-subsets/)（[题解](solution/0601-0700/698_划分为K个相等的子集.md)） |
| Day 2 图论基础 | [207. 课程表](https://leetcode.cn/problems/course-schedule/)（[题解](solution/0201-0300/207_课程表.md)）、[208. 实现 Trie（前缀树）](https://leetcode.cn/problems/implement-trie-prefix-tree/)（[题解](solution/0201-0300/208_实现Trie.md)）、[547. 省份数量](https://leetcode.cn/problems/number-of-provinces/)（[题解](solution/0501-0600/547_省份数量.md)）、[785. 判断二分图](https://leetcode.cn/problems/is-graph-bipartite/)（[题解](solution/0701-0800/785_判断二分图.md)）、[133. 克隆图](https://leetcode.cn/problems/clone-graph/)（[题解](solution/0101-0200/133_克隆图.md)） |
| Day 3 最短路与 BFS | [743. 网络延迟时间](https://leetcode.cn/problems/network-delay-time/)（[题解](solution/0701-0800/743_网络延迟时间.md)）、[787. K 站中转内最便宜的航班](https://leetcode.cn/problems/cheapest-flights-within-k-stops/)（[题解](solution/0701-0800/787_K站中转内最便宜的航班.md)）、[399. 除法求值](https://leetcode.cn/problems/evaluate-division/)（[题解](solution/0301-0400/399_除法求值.md)）、[752. 打开转盘锁](https://leetcode.cn/problems/open-the-lock/)（[题解](solution/0701-0800/752_打开转盘锁.md)）、[127. 单词接龙](https://leetcode.cn/problems/word-ladder/)（[题解](solution/0101-0200/127_单词接龙.md)）、[329. 矩阵中的最长递增路径](https://leetcode.cn/problems/longest-increasing-path-in-a-matrix/)（[题解](solution/0301-0400/329_矩阵中的最长递增路径.md)） |
| Day 4 复盘 | 重做本周错题，总结模板笔记 |
