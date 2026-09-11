# docs 内容站镜像（dev/deployment.md §2 / content-site §3 大规模构建纪律）：
# 多阶段——node 分区构建（learn / problems-gpu / problems-algo 4 批）→ nginx 托管。
# 构建上下文为仓库根（需要 packages/content 内容快照）：
#   docker build -f apps/docs/Dockerfile -t ailab/docs:latest .
#   内存不足时调大批次：--build-arg BATCH_TOTAL=6
FROM node:22-slim AS build

ARG BATCH_TOTAL=4

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json apps/docs/
RUN pnpm install --filter @ailab/docs

COPY apps/docs apps/docs
COPY packages/content packages/content

# 三分区全量构建（各 build:* 自带 sync；algo 按 BATCH_TOTAL 分批，
# build-algo.sh 内 NODE_OPTIONS 控制单批堆上限）
RUN cd apps/docs \
  && pnpm build:learn \
  && pnpm build:gpu \
  && BATCH_TOTAL=$BATCH_TOTAL pnpm build:algo

FROM nginx:alpine

COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
# 三个分区产物：/learn/*、/problems/gpu/*、/problems/*（algo）
COPY --from=build /app/apps/docs/learn/dist /usr/share/nginx/html/learn
COPY --from=build /app/apps/docs/problems-gpu/dist /usr/share/nginx/html/problems/gpu
COPY --from=build /app/apps/docs/problems-algo/dist /usr/share/nginx/html/problems
