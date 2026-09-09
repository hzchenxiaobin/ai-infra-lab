# deploy/（待实现）

部署运维资产目录，当前仅为占位。详见 [dev/deployment.md](../dev/deployment.md)。

目标形态（自有机器 Docker 单机部署，一份 compose 管全部服务）：

- `docker-compose.yml`：全栈拓扑 —— Caddy（反代/TLS）、web、docs、server、
  judge-worker、MySQL 8。
- `Caddyfile`：反向代理与自动 HTTPS 配置。
- 评测镜像 Dockerfile：algo 镜像（g++ ≥ 11 / python3 / SQLite）。
- `backup/`：MySQL 备份脚本（定时 mysqldump + 保留策略）。

迁移来源：interview 仓库根目录的单镜像 `Dockerfile` + 仅含 mysql 的
`docker-compose.yml` 将在此扩展为全栈 compose。

注意：部署机无 GPU，不需要 nvidia-container-toolkit；`.env`
（DATABASE_URL / SESSION_SECRET / SMTP / LLM key）只存在于部署机，不入库。
