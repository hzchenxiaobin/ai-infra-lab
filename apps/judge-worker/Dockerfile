# judge-worker 应用镜像（dev/judge-worker.md §2）：
# node:22-slim + docker CLI（Docker-out-of-Docker：挂宿主 /var/run/docker.sock，
# 不嵌套 Docker daemon）。构建上下文为仓库根（需要 packages/judge-core）：
#   docker build -f apps/judge-worker/Dockerfile -t ailab/judge-worker:latest .
FROM docker:29-cli AS docker-cli

FROM node:22-slim

# 不用 debian 源的 docker.io（20.10，API 1.41，新版 daemon 直接拒绝）：
# 取官方 docker:29-cli 的 CLI 二进制，与旧 daemon 自动协商 API 版本
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

WORKDIR /app

# pnpm workspace：装依赖（judge-core 的 typescript 为构建期需要，不裁剪）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/judge-core/package.json packages/judge-core/
COPY apps/judge-worker/package.json apps/judge-worker/
RUN corepack enable && pnpm install --filter @ailab/judge-worker...

COPY packages/judge-core packages/judge-core
COPY apps/judge-worker apps/judge-worker

# judge-core 产 dist（运行时 import 解析到 dist/index.js；worker 经 tsx 启动）
RUN pnpm --filter @ailab/judge-core build

WORKDIR /app/apps/judge-worker
# 直接指向本地 .bin：容器 CMD 不经 pnpm run，PATH 无 node_modules/.bin
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
