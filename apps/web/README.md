# @ailab/web

门户前端（React 19 + Vite + Tailwind 4 + TanStack Query + tRPC）。

- dev：`pnpm dev`（Vite 5173，`/trpc` 代理到 server 3001）
- build：`pnpm build`（产物 `dist/`，nginx 托管）
- lint：`pnpm lint`（oxlint）
- 类型链：`src/lib/trpc.ts` 从 `@ailab/server` 仅 type-only 导入 `AppRouter`

模块文档：[docs/dev/web.md](../../docs/dev/web.md)
