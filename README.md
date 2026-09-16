# AI Infra Lab

AI Infra 方向（推理系统 / CUDA 内核 / 大模型工程化）的学—练—面闭环备战平台。

## 仓库结构

```
ai-infra-lab/
├── apps/
│   ├── server/          # API 服务（Hono + tRPC + Drizzle）
│   ├── web/             # 门户前端（React 19）
│   ├── ios/             # iOS 原生客户端（SwiftUI，功能对等 web）
│   ├── docs/            # docs 内容站（VitePress）
│   ├── judge-worker/    # 评测沙箱
│   └── cli/             # 管理 CLI
├── packages/
│   ├── content-kit/     # 内容管线与工作流
│   ├── content/         # 统一内容资产
│   ├── contracts/       # 前后端共享类型
│   └── judge-core/      # 评测核心逻辑
├── deploy/              # Docker 部署配置
└── docs/                # 产品设计文档
```

## 快速开始

```bash
pnpm install
pnpm dev          # 启动 server + web + docs 开发服务
pnpm build        # 构建所有应用
pnpm test         # 运行测试
pnpm db:generate  # 生成数据库迁移
pnpm db:migrate   # 执行数据库迁移
```

## 文档

| 文档 | 内容 |
|---|---|
| [01-product-design.md](docs/01-product-design.md) | 产品定位、目标用户、功能模块 |
| [02-architecture.md](docs/02-architecture.md) | 技术选型、monorepo 结构、部署架构 |
| [03-data-model.md](docs/03-data-model.md) | 数据模型、统一 ID 方案 |
| [04-migration.md](docs/04-migration.md) | 资产迁移、去重策略 |
| [05-roadmap.md](docs/05-roadmap.md) | 里程碑与验收标准 |
| [06-development.md](docs/06-development.md) | 开发环境、约定 |
| [07-backlog.md](docs/07-backlog.md) | 待办清单 |
| [08-ios-app-design.md](docs/08-ios-app-design.md) | iOS App 设计（架构 / 功能映射 / 里程碑） |

模块开发文档：[server](docs/dev/server.md) · [web](docs/dev/web.md) · [content-site](docs/dev/content-site.md) · [cli](docs/dev/cli.md) · [judge-worker](docs/dev/judge-worker.md) · [content-kit](docs/dev/content-kit.md) · [database](docs/dev/database.md) · [deployment](docs/dev/deployment.md) · [iOS App](../apps/ios/README.md)

## 技术栈

- **运行时**：Node.js >= 20
- **包管理**：pnpm 11 + workspaces
- **后端**：Hono + tRPC + Drizzle + MySQL
- **前端**：React 19 + Vite
- **内容站**：VitePress
- **评测**：容器沙箱隔离
- **部署**：Docker Compose 单机部署
