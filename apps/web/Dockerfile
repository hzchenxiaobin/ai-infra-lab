# web 应用镜像（dev/deployment.md §2）：多阶段——node 构建静态产物 → nginx 托管 SPA。
# 构建上下文为仓库根：
#   docker build -f apps/web/Dockerfile -t ailab/web:latest .
FROM node:22-slim AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/judge-core/package.json packages/judge-core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --filter @ailab/web...

# 源码层：server/judge-core 仅为 tsc 的 AppRouter 类型链所需（产物不打包后端代码）
COPY packages/contracts packages/contracts
COPY packages/judge-core packages/judge-core
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @ailab/web build

FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
