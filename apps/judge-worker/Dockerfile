# judge-worker 应用镜像（dev/judge-worker.md §2）：
# node:22-slim + docker CLI（Docker-out-of-Docker：挂宿主 /var/run/docker.sock，
# 不嵌套 Docker daemon）。构建上下文为仓库根（需要 packages/judge-core）：
#   docker build -f apps/judge-worker/Dockerfile -t ailab/judge-worker:latest .
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pnpm workspace：仅装生产依赖（judge-core + mysql2 + tsx）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/judge-core/package.json packages/judge-core/
COPY apps/judge-worker/package.json apps/judge-worker/
RUN corepack enable && pnpm install --filter @ailab/judge-worker... --prod

COPY packages/judge-core packages/judge-core
COPY apps/judge-worker apps/judge-worker

WORKDIR /app/apps/judge-worker
CMD ["tsx", "src/index.ts"]
