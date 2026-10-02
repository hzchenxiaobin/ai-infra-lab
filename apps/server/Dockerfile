# server 应用镜像（dev/deployment.md §2）：
# pnpm workspace 依赖分层缓存 → tsc 类型检查 → tsx 直跑源码（启动 CMD 先 db:migrate）。
# content-kit 产物（content:sync 输入）不入镜像：compose 挂载
# packages/content-kit/dist（243MB 内容快照只进 docs 镜像）。
# CLI 不入镜像：走 HTTP tRPC（宿主执行，服务身份经 .env 的 CLI_TOKEN）。
# 构建上下文为仓库根（需要 packages/contracts、judge-core）：
#   docker build -f apps/server/Dockerfile -t ailab/server:latest .
FROM node:22-slim

RUN corepack enable

WORKDIR /app

# 依赖层：先只 COPY lockfile 与各包 package.json，保证依赖层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/judge-core/package.json packages/judge-core/
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --filter @ailab/server... --frozen-lockfile

# 源码层（server + 共享包；judge-core/contracts 均为 src 直链，无需预构建产物）
COPY packages/contracts packages/contracts
COPY packages/judge-core packages/judge-core
COPY apps/server apps/server

# 类型检查；devDeps 保留：drizzle-kit（启动迁移）与 tsx（运行时）运行期使用
RUN pnpm --filter @ailab/server build

WORKDIR /app/apps/server
# 启动即迁移（升级即迁移，回滚依赖备份——deployment §3）；
# 与 judge-worker 一致：tsx 直跑源码（dev/prod 同构，无独立构建产物）
CMD ["sh", "-c", "npx drizzle-kit migrate && ./node_modules/.bin/tsx src/index.ts"]
