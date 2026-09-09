#!/usr/bin/env bash
# 在 leetcode 目录下运行 cannbot，使用 SKILL.md 完成一道题解，并打印返回信息
# 相同的消息顺序执行，一次跑完再跑下一次，循环十次
set -euo pipefail

WORKDIR="/mnt/workspace/code/github/infra/leetcode"
MESSAGE="${1:-使用/mnt/workspace/code/github/infra/leetcode/solution/SKILL.md,完成一道题解}"
TIMES=1

cd "$WORKDIR"
echo ">>> 工作目录: $(pwd)"
echo ">>> 发送: $MESSAGE"
for i in $(seq 1 "$TIMES"); do
    echo
    echo "======== 第 $i/$TIMES 次执行 ========"
    kimi --auto -p "$MESSAGE"
done
echo
echo ">>> 全部 $TIMES 次执行完毕"

# 全部完成后，让 cannbot 提交并推送本次改动
GIT_MESSAGE="请把本次题解产生的所有改动 git 提交并推送到远程仓库"
echo
echo "======== 提交并推送 ========"
echo ">>> 发送: $GIT_MESSAGE"
kimi --auto -p "$GIT_MESSAGE"
echo
echo ">>> 全部完成"
