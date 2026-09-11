# server 应用镜像（dev/deployment.md §2）：
# pnpm workspace 依赖分层缓存 → tsc 构建 → 启动 CMD 先 db:migrate 再起服务。
# content-kit 产物（content:sync 输入）不入镜像：compose 挂载
# packages/content-kit/dist（243MB 内容快照只进 docs 镜像）。
# 构建上下文为仓库根（需要 packages/contracts、judge-core 与 apps/cli）：
#   docker build -f apps/server/Dockerfile -t ailab/server:latest .
FROM node:22-slim

RUN corepack enable

WORKDIR /app

# 依赖层：先只 COPY lockfile 与各包 package.json，保证依赖层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/judge-core/package.json packages/judge-core/
COPY apps/server/package.json apps/server/
COPY apps/cli/package.json apps/cli/
RUN pnpm install --filter @ailab/server... --filter @ailab/cli...

# 源码层（server + cli + 共享包；cli 用于容器内 content:sync 等运维命令）
COPY packages/contracts packages/contracts
COPY packages/judge-core packages/judge-core
COPY apps/server apps/server
COPY apps/cli apps/cli

# 构建：judge-core 先产 dist（运行时 @ailab/judge-core 解析到 dist/index.js），
# 再 tsc 构建 server；devDeps 保留：drizzle-kit（启动迁移）与 tsx（CLI）运行期使用
RUN pnpm --filter @ailab/judge-core build \
  && pnpm --filter @ailab/server build

WORKDIR /app/apps/server
# 启动即迁移（升级即迁移，回滚依赖备份——deployment §3）
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/index.js"]
