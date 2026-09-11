# deploy/ — 部署运维资产

自有机器 + Docker 单机部署（2026-09 决策，见 [dev/deployment.md](../docs/dev/deployment.md)）。
一份 compose 管全部服务。

## 目录

```
deploy/
├── docker-compose.yml      # 六服务编排：caddy / web / docs / server / judge-worker / mysql
├── Caddyfile               # 反向代理路由（SPA 与 docs 站的路径取舍见文件头注释）
├── images/algo/            # 评测镜像（g++/python3 + run.py 哑执行器，judge-worker 用）
├── backups/                # 备份输出（.gitignore，不进 Git）
└── scripts/
    ├── bootstrap.sh        # 首次初始化：.env → algo 镜像 → compose 构建起栈 → content:sync → 冒烟
    ├── backup.sh           # MySQL 每日备份（cron 17 3 * * *；每日留 14 天 / 周日留 8 周）
    ├── restore.sh          # 恢复演练：恢复到临时库 ailab_restore 并抽查行数
    └── monitor.sh          # 轻量告警：队列积压 / ie 终态 / server 探活 / caddy 5xx / LLM 日 token 与 p95 / 用户用量突增（cron */5 + WEBHOOK_URL）
```

## 首次部署

```bash
git clone <repo> && cd ai-infra-lab
bash deploy/scripts/bootstrap.sh   # 交互式走完全部初始化清单
```

前置：宿主已装 docker + git。`.env` 必改项：`SESSION_SECRET`、`MYSQL_PASSWORD`、
`MYSQL_ROOT_PASSWORD`、`ADMIN_EMAILS`（清单见 `.env.example`）。

管理员引导（CLI 管理命令的身份来源，2026-09-11 收紧后显式化）：

1. `.env` 配 `ADMIN_EMAILS=ops@example.com`（可多个，逗号分隔）；
2. 栈起起来后在 web 注册该邮箱（SMTP 未配置时验证码打印在 server 日志）；
3. CLI 管理命令带 `--user ops@example.com`（或设 `AILAB_USER`）——
   bootstrap 检测到未注册会跳过 `content:sync` 并打印补跑命令。

## 日常升级

```bash
cd ai-infra-lab && git pull
bash deploy/scripts/backup.sh        # 升级即迁移，回滚依赖备份
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
curl -fsS http://localhost/healthz   # server 探活（caddy /healthz 路由）
```

## 关键约定

- **algo 评测镜像预构建**：`docker build -t ailab/judge-algo:latest deploy/images/algo`
  （国内网络默认走 aliyun apt 源，海外传 `--build-arg APT_MIRROR=deb.debian.org`）；
  不在 compose 服务链里，也不在评测路径上现场构建。
- **MySQL 仅宿主回环暴露**（`127.0.0.1:3306`）：CLI `content:sync` 与备份演练用，
  不对公网；compose 内 server/judge-worker 的连接串由 `MYSQL_*` 变量组装
  （主机名 `mysql`），与 mysql 服务凭据永远一致。
- **judge-worker 挂宿主 `/var/run/docker.sock`**（Docker-out-of-Docker），
  server 侧 `JUDGE_INPROCESS_WORKER=false`（compose 已配）。
- **脚本自适应 compose 形态**（`docker compose` 插件或独立 `docker-compose` 均可），
  凭据自动读根目录 `.env`，cron 无需额外 export。
- **秘密只在部署机 `.env`**，不进 Git（镜像构建经 `.dockerignore` 排除 `.env`）。
- 监控告警阈值与 LLM 成本告警见 [dev/deployment.md §5](../docs/dev/deployment.md)。
