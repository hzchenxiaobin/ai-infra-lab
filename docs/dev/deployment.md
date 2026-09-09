# deployment — 部署运维指南

> 自有机器 + Docker 单机部署，不上 GitHub Pages、不上云平台（2026-09 决策，见
> [02 部署架构](../02-architecture.md#部署架构)）。所有部署物集中在 `deploy/`。
> interview 已有的 Dockerfile + compose 作模板扩展（现状：单镜像 + 仅 mysql 服务）。

## 1. 全栈拓扑

```
                      ┌──────────────────────────────────┐
                      │  Caddy（反向代理 + 自动 HTTPS）    │  :80/:443
                      └──┬──────────┬───────────┬────────┘
          /learn,/problems│          │ /(其余)   │ /trpc
                          ▼          ▼           ▼
                  ┌───────────┐ ┌─────────┐ ┌──────────────┐   ┌────────┐
                  │ docs      │ │ web     │ │ server       │──▶│ MySQL  │
                  │ (nginx    │ │ (nginx  │ │ (Hono+tRPC)  │   │ :3306  │
                  │  静态服务) │ │  静态)  │ │ :3001        │   └────────┘
                  └───────────┘ └─────────┘ └──────┬───────┘
                                                   │       ┌──────────────┐
                                                   └──────▶│ judge-worker │
                                                           └──────┬───────┘
                                                                  │ 挂宿主 docker.sock
                                                                  ▼
                                                     一次性评测容器（algo 镜像，纯 CPU）
```

服务清单（一份 compose 管全部）：

| 服务 | 镜像构建 | 端口 | 说明 |
|---|---|---|---|
| `caddy` | 官方镜像 + `deploy/Caddyfile` | 80/443 | 自有域名自动 TLS；纯内网使用可关 HTTPS |
| `web` | `apps/web` 构建产物 + nginx | 内部 | 门户静态站 |
| `docs` | `apps/docs` 三分区产物 + nginx | 内部 | 内容站；图片随镜像分发（方案一） |
| `server` | `apps/server`（node:22-slim 基底，沿用 interview Dockerfile 模式） | 内部 3001 | 启动 CMD 含 `db:migrate` |
| `judge-worker` | `apps/judge-worker` + docker CLI | 无 | 挂 `/var/run/docker.sock`，见 [judge-worker](judge-worker.md#3-docker-out-of-docker) |
| `mysql` | `mysql:8` | 宿主不暴露（仅内网） | 命名卷 `mysql-data`；健康检查沿用 interview compose 的 mysqladmin ping |

`deploy/` 目录内容：

```
deploy/
├── docker-compose.yml      # 全栈编排
├── Caddyfile               # 路由：/learn,/problems→docs；/trpc→server；其余→web
├── images/algo/Dockerfile  # 评测镜像（g++/python3/SQLite，见 judge-worker §4）
├── backups/                # mysqldump 输出（.gitignore）
└── scripts/
    ├── backup.sh           # 备份脚本（cron 每日）
    └── restore.sh          # 恢复演练用
```

## 2. 镜像构建

```bash
# 全量构建（web/docs/server/judge-worker 四个业务镜像）
docker compose -f deploy/docker-compose.yml build

# docs 镜像构建要点（大规模构建纪律，见 content-site §3）：
#   构建参数透传分批与堆上限
docker compose build docs \
  --build-arg BATCH_TOTAL=4
# Dockerfile 内：NODE_OPTIONS=--max-old-space-size=6144，
# 4 批构建（multi-stage 或 CI 预构建产物 COPY 进 nginx 镜像）
```

- 沿用 interview Dockerfile 的分层模式：先 COPY lockfile + 各包 package.json
  → `pnpm install --frozen-lockfile` → 再 COPY 源码，保证依赖层缓存。
- pnpm 版本经 corepack 固定（interview 现状 `pnpm@11.18.0`）。
- algo 评测镜像**单独预构建**并留在宿主（`docker build -t ailab/judge-algo deploy/images/algo`），
  不在 compose 服务链里，也不在评测路径上现场构建。
- **无 GPU 依赖**：部署栈不需要 nvidia-container-toolkit，宿主机无 GPU 亦可全量运行
  （GPU 题评测引流 leetgpu.com，2026-09 决策）。

## 3. 升级流程

```bash
# 部署机上：
cd ai-infra-lab && git pull

# 1. 先备份（升级即迁移，回滚依赖备份）
docker compose -f deploy/docker-compose.yml exec mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" ailab' > deploy/backups/pre-upgrade-$(date +%F).sql

# 2. 重建并滚动更新
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d

# 3. 验证
curl -fsS http://localhost:3001/healthz        # server 探活（compose 内部网络）
# 浏览器过一遍冒烟：首页 → 内容页 → 登录 → 提交评测 → 面试
```

- server 容器启动时自动 `db:migrate`（沿用 interview 的 CMD 模式），因此
  **升级前必须备份**；迁移不向下兼容时先停机再升级。
- docs/web 是纯静态镜像，升级即替换，无状态。
- judge-worker 升级时先把 `pending/running` 任务重置或等队列排空；worker 启动
  自带 running 超时任务回收（见 judge-worker §3）。
- 内容更新（周赛题解等）= 常规 `git pull` + 重建 docs 镜像；CI 已通过 lint +
  分区构建的提交才允许合入主干（content-kit §10）。

## 4. MySQL 备份

```bash
# 手动备份（同 cli db:backup）
deploy/scripts/backup.sh
# 输出：deploy/backups/ailab-YYYY-MM-DD.sql.gz

# cron（部署机 /etc/cron.d/ailab）：
17 3 * * * root /srv/ai-infra-lab/deploy/scripts/backup.sh
```

- 保留策略：每日备份保留 14 天，每周日备份保留 8 周。
- **恢复演练**：每里程碑至少一次——`restore.sh` 恢复到临时库，抽查 users /
  submissions 行数。备份没演练过等于没有。
- 内容无需备份（Git 即备份）；需要备份的只有 MySQL。

## 5. 监控告警（M3 起）

| 指标 | 来源 | 告警阈值（初版） |
|---|---|---|
| 评测队列积压 | `SELECT count(*) FROM submissions WHERE status='pending'` | > 20 持续 10 min |
| 评测失败率 | submissions 终态分布 | `ie`（internal error）出现即告警 |
| LLM 成本/延迟 | server 打点（模型分级调用计数 + token 用量） | 日成本超预算 / p95 延迟 > 60s |
| docs 构建时长/内存 | CI 构建日志 | 单区 > 15 min 或 > 8GB（换框架触发线，05） |
| 错误率 | server 5xx 计数 | > 1% 持续 5 min |
| 异常用量 | usage_quotas.used 增速 | 单用户日用量突增 10 倍（防滥用，05 风险清单） |

初期用轻量方案（脚本 + 通知 webhook），不引入 Prometheus 全家桶；compose 服务均配
`restart: unless-stopped` 兜底进程级可用性。

## 6. 运维边界与注意事项

- **单机天花板**：流量超单机承载时迁移云主机不留架构障碍（内容在 Git、数据在
  MySQL，整体可搬迁，05 风险清单），但本期不做多机/HA。
- **与原三站零耦合**：原仓库 GitHub Pages 站继续独立运行；新产品独立域名冷启动，
  不做 301、不做跨站互链（04 边界约束）。
- **端口冲突**：interview 仓库的 `docker-compose.override.yml`（宿主 3306 被占改
  3307）是本机开发特例，新产品 compose 不暴露 MySQL 宿主端口，无此问题；本机同时
  开发多个项目时注意 3001/5173 冲突。
- **秘密管理**：`.env`（DATABASE_URL/SESSION_SECRET/SMTP/LLM key）只在部署机上，
  不进 Git；`.env.example` 维护完整清单（06 §8）。
- 备份目录、`logs/` 不进 Git；部署机上的首次初始化清单（建库、导入题库、
  content sync、构建 algo 镜像）写成 `deploy/scripts/bootstrap.sh`，避免口口相传。
