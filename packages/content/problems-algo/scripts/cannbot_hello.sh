#!/usr/bin/env bash
# 在 leetcode 目录下并发运行 cannbot，使用 SKILL.md 完成 TIMES 道题解
# 并发前先预分配互不相同的题号，避免多个线程写同一题号的题解
set -euo pipefail

WORKDIR="$(cd "$(dirname "$0")" && pwd)"
SKILL="$WORKDIR/solution/SKILL.md"
MESSAGE_PREFIX="使用${SKILL}写一下题号为"
TIMES=10
ROUNDS=70

cd "$WORKDIR"
echo ">>> 工作目录: $(pwd)"

for round in $(seq 1 "$ROUNDS"); do
echo
echo "======== 第 $round/$ROUNDS 轮 ========"

# 预计算接下来 TIMES 个缺失题号（按题号升序），保证并发线程各写一题不冲突
mapfile -t NUMS < <(python3 -c "
import os, re
root = 'solution'
nums = set()
for d in sorted(os.listdir(root)):
    if not os.path.isdir(os.path.join(root, d)) or d == 'images': continue
    for f in os.listdir(os.path.join(root, d)):
        m = re.match(r'(\d+)_', f)
        if m: nums.add(int(m.group(1)))
mx = max(nums) if nums else 0
n = ${TIMES}
out = []
i = 1
while len(out) < n and i <= mx + n:
    if i not in nums:
        out.append(i)
    i += 1
print('\n'.join(str(x) for x in out))
")

if [ "${#NUMS[@]}" -lt "$TIMES" ]; then
    echo ">>> 警告: 仅找到 ${#NUMS[@]} 个缺失题号，少于 TIMES=$TIMES，按实际数量并发" >&2
fi

echo ">>> 预分配题号（共 ${#NUMS[@]} 个）: ${NUMS[*]}"
echo ">>> 并发启动 ${#NUMS[@]} 个 cannbot 线程"
echo

pids=()
for num in "${NUMS[@]}"; do
    (
        echo "[题号 $num] 开始"
        cannbot run "${MESSAGE_PREFIX} ${num} 的题目"
        echo "[题号 $num] 完成"
    ) &
    pids+=($!)
done

fail=0
for pid in "${pids[@]}"; do
    wait "$pid" || fail=1
done

if [ "$fail" -ne 0 ]; then
    echo ">>> 警告: 部分线程执行失败" >&2
fi

echo
echo ">>> 全部 ${#NUMS[@]} 次执行完毕"

# 全部完成后，让 cannbot 提交并推送本次改动
GIT_MESSAGE="请把本次题解产生的所有改动 git 提交并推送到远程仓库"
echo
echo "======== 提交并推送 ========"
echo ">>> 发送: $GIT_MESSAGE"
cannbot run "$GIT_MESSAGE"
echo
echo ">>> 第 $round/$ROUNDS 轮完成"
done

echo
echo ">>> 全部 $ROUNDS 轮完成"
