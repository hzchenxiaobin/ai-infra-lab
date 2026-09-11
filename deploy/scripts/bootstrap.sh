#!/usr/bin/env bash
# bootstrap.sh —— 部署机首次初始化（dev/deployment.md §6：避免口口相传）。
# 前置：宿主已装 docker + git；仓库已 clone 到部署目录。
#   用法：bash deploy/scripts/bootstrap.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi
COMPOSE_FILE="deploy/docker-compose.yml"

echo "== 1/6 .env 初始化（已存在则跳过）=="
if [ ! -e .env ]; then
  cp .env.example .env
  echo "已生成 .env，请编辑后重跑本脚本："
  echo "  必改：SESSION_SECRET（openssl rand -hex 32）、MYSQL_PASSWORD、MYSQL_ROOT_PASSWORD"
  echo "  必改：ADMIN_EMAILS（管理命令身份；对应邮箱需在 web 注册后 CLI --user 使用）"
  echo "  按需：SMTP_*（注册验证码）、LLM_*（面试官）、WEBHOOK_URL（监控告警）"
  exit 1
fi
# .env 的 DATABASE_URL 面向宿主（CLI/备份演练走回环端口）；compose 内服务由
# MYSQL_* 组装出容器网络内的连接串（mysql 主机名），两处互不干扰
grep -q '^DATABASE_URL=' .env || echo 'DATABASE_URL=mysql://ailab:ailab@127.0.0.1:3306/ailab' >> .env
mysql_pw=$(grep -E '^MYSQL_PASSWORD=' .env | tail -1 | cut -d= -f2-)
if [ -z "$mysql_pw" ] || [ "$mysql_pw" = "ailab" ]; then
  echo "警告：MYSQL_PASSWORD 未设置或仍为默认值 ailab，公网部署前务必修改" >&2
fi

echo "== 2/6 宿主侧内容产物（content-kit sync，容器 content:sync 的输入）=="
command -v node >/dev/null || { echo "错误：宿主需要 Node ≥ 20（content-kit sync）" >&2; exit 1; }
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @ailab/content-kit sync

echo "== 3/6 预构建 algo 评测镜像（不在评测路径现场 build）=="
docker build -t ailab/judge-algo:latest deploy/images/algo

echo "== 4/6 构建四个业务镜像 =="
$COMPOSE -f "$COMPOSE_FILE" build

echo "== 5/6 起全栈（server 启动即 db:migrate）并导入内容元数据 =="
$COMPOSE -f "$COMPOSE_FILE" up -d
echo "等待 MySQL 健康 ..."
for i in $(seq 1 60); do
  if $COMPOSE -f "$COMPOSE_FILE" ps mysql | grep -q "healthy"; then break; fi
  sleep 2
done

# CLI 管理命令身份（2026-09-11 收紧后显式化）：取 ADMIN_EMAILS 第一个邮箱；
# 对应用户需已在 web 注册（否则跳过 content:sync，打印补跑指引）
admin_email=$(grep -E '^ADMIN_EMAILS=' .env | tail -1 | cut -d= -f2- | cut -d, -f1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" | xargs)
if [ -z "$admin_email" ]; then
  echo "警告：.env 未配置 ADMIN_EMAILS，跳过 content:sync（配置后在 web 注册对应邮箱再补跑）" >&2
else
  admin_exists=$($COMPOSE -f "$COMPOSE_FILE" exec -T mysql sh -c \
    "exec mysql -uailab -p\"\$MYSQL_PASSWORD\" -N -s ailab -e \"SELECT COUNT(*) FROM users WHERE email='$admin_email'\"" 2>/dev/null || echo 0)
  if [ "$admin_exists" = "1" ]; then
    $COMPOSE -f "$COMPOSE_FILE" exec -T -e AILAB_USER="$admin_email" server \
      sh -c "cd /app && node apps/cli/bin/ailab.mjs content:sync"
  else
    echo "提示：$admin_email 尚未注册。先在 web 完成注册（SMTP 未配置时验证码见 server 日志），再补跑："
    echo "  $COMPOSE -f $COMPOSE_FILE exec -T -e AILAB_USER=$admin_email server sh -c 'cd /app && node apps/cli/bin/ailab.mjs content:sync'"
  fi
fi

echo "== 6/6 冒烟验证 =="
curl -fsS -o /dev/null -w "server healthz（经 caddy）: %{http_code}\n" http://localhost/healthz
curl -fsS -o /dev/null -w "web  首页: %{http_code}\n" http://localhost/ || true
curl -fsS -o /dev/null -w "docs learn: %{http_code}\n" http://localhost/learn/ || true

echo "== 初始化完成 =="
echo "后续升级：git pull → pnpm --filter @ailab/content-kit sync → deploy/scripts/backup.sh → $COMPOSE -f $COMPOSE_FILE build && $COMPOSE -f $COMPOSE_FILE up -d"
