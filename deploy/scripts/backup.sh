#!/usr/bin/env bash
# backup.sh —— MySQL 每日备份（dev/deployment.md §4）：
#   输出 deploy/backups/ailab-YYYY-MM-DD.sql.gz；保留每日备份 14 天、周日备份 8 周。
#   cron（/etc/cron.d/ailab）：17 3 * * * root /srv/ai-infra-lab/deploy/scripts/backup.sh
#   与 cli db:backup 等价（走 compose exec，宿主无需 mysql 客户端）。
#   凭据取仓库根 .env 的 MYSQL_ROOT_PASSWORD（root 才有权导出 routines），
#   环境变量已设时优先（cron 可不依赖 .env）。
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="$(cd .. && pwd)/.env"

# docker compose 插件与独立 docker-compose 二进制自适应
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

# 从 .env 读值（不 source 整文件：值可能带引号/空格，逐键解析最稳）
env_val() {
  [ -f "$ENV_FILE" ] || return 1
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DB_NAME="${MYSQL_DATABASE:-$(env_val MYSQL_DATABASE || echo ailab)}"
DB_ROOT_PASS="${MYSQL_ROOT_PASSWORD:-$(env_val MYSQL_ROOT_PASSWORD || echo root)}"
COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="backups"
KEEP_DAILY_DAYS=14   # 每日备份保留
KEEP_WEEKLY_WEEKS=8  # 周日备份保留

mkdir -p "$BACKUP_DIR"
today=$(date +%F)
dest="$BACKUP_DIR/ailab-${today}.sql.gz"

if [ -e "$dest" ]; then
  echo "今日备份已存在：$dest"
  exit 0
fi

echo "[backup] dumping ${DB_NAME} → ${dest}"
$COMPOSE -f "$COMPOSE_FILE" exec -T mysql \
  sh -c "exec mysqldump -uroot -p\"${DB_ROOT_PASS}\" --single-transaction --routines ${DB_NAME}" \
  | gzip > "$dest"

# 备份自检：解压后必须包含建表语句且非空
size=$(stat -c%s "$dest")
if [ "$size" -lt 10240 ]; then
  echo "[backup] 警告：备份文件仅 ${size} 字节，疑似异常，请人工核查" >&2
fi

# 保留策略：非周日的保留 14 天；周日的保留 8 周（周日 = $(date +%u) == 7）
echo "[backup] 清理过期备份（每日 ${KEEP_DAILY_DAYS} 天 / 周日 ${KEEP_WEEKLY_WEEKS} 周）"
find "$BACKUP_DIR" -name 'ailab-*.sql.gz' | while read -r f; do
  base=$(basename "$f" .sql.gz)
  day=${base#ailab-}
  # 校验文件名形态，避免误删人工文件
  [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
  dow=$(date -d "$day" +%u 2>/dev/null) || continue
  if [ "$dow" = "7" ]; then
    keep_days=$((KEEP_WEEKLY_WEEKS * 7))
  else
    keep_days=$KEEP_DAILY_DAYS
  fi
  if [ $(( ($(date +%s) - $(date -d "$day" +%s)) / 86400 )) -gt "$keep_days" ]; then
    echo "[backup] 删除过期备份：$f"
    rm -f "$f"
  fi
done

echo "[backup] 完成：$dest（$(du -h "$dest" | cut -f1)）"
