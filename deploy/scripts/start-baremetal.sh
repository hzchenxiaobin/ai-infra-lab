#!/usr/bin/env bash
# 裸机部署（方案 A）启动脚本：mysqld → pm2(server) → nginx。
# 适用无 systemd 的容器环境；机器重启/进程退出后执行本脚本拉起全栈。
set -euo pipefail

export PATH=/opt/node22/bin:$PATH
REPO=/mnt/workspace/aiinfra/ai-infra-lab

# 1. MySQL（仅本机回环）
if ! mysqladmin ping --silent 2>/dev/null; then
  mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
  (mysqld_safe >/var/log/mysqld-safe.log 2>&1 &)
  for i in $(seq 1 30); do
    mysqladmin ping --silent 2>/dev/null && break
    sleep 1
  done
fi
mysqladmin ping --silent || { echo "mysqld 启动失败，看 /var/log/mysqld-safe.log" >&2; exit 1; }

# 2. server（pm2 守护，进程清单经 pm2 save 持久化）
if ! pm2 pid ailab-server >/dev/null 2>&1 || ! kill -0 "$(pm2 pid ailab-server)" 2>/dev/null; then
  pm2 resurrect 2>/dev/null || pm2 start "$REPO/apps/server/dist/index.js" --name ailab-server --cwd "$REPO"
fi

# 3. nginx（web/docs 静态 + 反代）
nginx -t >/dev/null 2>&1 || { echo "nginx 配置校验失败" >&2; exit 1; }
if ! pgrep -x nginx >/dev/null; then
  nginx
fi

# 4. 探活
sleep 2
curl -fsS http://localhost/healthz && echo " <- 栈已就绪"
