#!/usr/bin/env bash
# algo 分区分批构建 + 合并（dev/content-site.md §3/§7：4100+ 页单次构建会 OOM，
# 按题号切 4 批各 ~1000 页，独立 dist_N 产物后 merge-dist 合并）。
# 单批内存 ~10GB；如仍 OOM，调大 BATCH_TOTAL 或 NODE_OPTIONS。
set -euo pipefail
cd "$(dirname "$0")/.."

BATCH_TOTAL="${BATCH_TOTAL:-4}"
for i in $(seq 0 $((BATCH_TOTAL - 1))); do
  echo "== algo batch $((i + 1))/$BATCH_TOTAL =="
  BATCH_TOTAL=$BATCH_TOTAL BATCH_INDEX=$i node --experimental-strip-types scripts/sync-algo.mts > /dev/null
  BATCH_TOTAL=$BATCH_TOTAL BATCH_INDEX=$i \
    NODE_OPTIONS="--max-old-space-size=10240" \
    ./node_modules/.bin/vitepress build problems-algo
done
node --experimental-strip-types scripts/merge-dist.mts problems-algo "$BATCH_TOTAL"
rm -rf problems-algo/dist_*
