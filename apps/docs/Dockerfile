# docs 内容站镜像（dev/deployment.md §2 / content-site §3 大规模构建纪律）：
# 多阶段——learn / problems-gpu / problems-algo 三分区各自独立 stage，从同一
# 依赖基座（build）分支。任一分区内容变更只重建该分区，其余 stage 命中缓存
# （此前三分区合并在单个 RUN 层，改一处全量重建三区 ~20 分钟）。
# 构建上下文为仓库根（需要 packages/content 内容快照）：
#   docker build -f apps/docs/Dockerfile -t ailab/docs:latest .
#   内存不足时调大批次：--build-arg BATCH_TOTAL=6
#   （三个分区 stage 独立，BuildKit 可能并行调度；内存紧张时注意观察）
FROM node:22-slim AS build

ARG BATCH_TOTAL=4

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json apps/docs/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --filter @ailab/docs --frozen-lockfile

# apps/docs 源码（主题/配置/脚本）+ sitemap 的 URL 事实源
# （gen-sitemap.mts 读 packages/content-kit/dist/contents.json，见 .dockerignore 豁免）
COPY apps/docs apps/docs
COPY packages/content-kit/dist/contents.json packages/content-kit/dist/contents.json

# ---- learn 分区（各 build:* 自带 sync；sync 只读本分区内容目录）----

FROM build AS learn
COPY packages/content/learn packages/content/learn
RUN cd apps/docs && pnpm build:learn

# ---- gpu 分区 ----

FROM build AS gpu
COPY packages/content/problems-gpu packages/content/problems-gpu
RUN cd apps/docs && pnpm build:gpu

# ---- algo 分区（按 BATCH_TOTAL 分批，build-algo.sh 内 NODE_OPTIONS 控制单批堆上限）----

FROM build AS algo
COPY packages/content/problems-algo packages/content/problems-algo
RUN cd apps/docs && BATCH_TOTAL=$BATCH_TOTAL pnpm build:algo

FROM nginx:alpine

COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
# 三个分区产物：/learn/*、/problems/gpu/*、/problems/*（algo）
COPY --from=learn /app/apps/docs/learn/dist /usr/share/nginx/html/learn
COPY --from=gpu /app/apps/docs/problems-gpu/dist /usr/share/nginx/html/problems/gpu
COPY --from=algo /app/apps/docs/problems-algo/dist /usr/share/nginx/html/problems
