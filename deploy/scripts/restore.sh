#!/usr/bin/env bash
# restore.sh —— 备份恢复演练（dev/deployment.md §4：备份没演练过等于没有）。
# 恢复到临时库 ailab_restore（不动生产库），抽查 users / submissions 行数与最新迁移。
#   用法：restore.sh [备份文件.sql.gz]（默认取最新一份）
#   凭据取仓库根 .env 的 MYSQL_ROOT_PASSWORD（需建/删临时库）。
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="$(cd .. && pwd)/.env"

if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

env_val() {
  [ -f "$ENV_FILE" ] || return 1
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DB_ROOT_PASS="${MYSQL_ROOT_PASSWORD:-$(env_val MYSQL_ROOT_PASSWORD || echo root)}"
BACKUP_DIR="backups"
RESTORE_DB="${RESTORE_DB:-ailab_restore}"

src="${1:-}"
if [ -z "$src" ]; then
  src=$(ls -1t "$BACKUP_DIR"/ailab-*.sql.gz 2>/dev/null | head -1 || true)
fi
if [ -z "$src" ] || [ ! -e "$src" ]; then
  echo "错误：找不到备份文件（$BACKUP_DIR/ailab-*.sql.gz）" >&2
  exit 1
fi
echo "[restore] 演练源：$src"

# mysql_root <库名>：SQL 经 stdin 进入（含引号/多行的语句不走 -e，避开 shell 转义）
mysql_root() {
  $COMPOSE -f docker-compose.yml exec -T mysql sh -c \
    "exec mysql -uroot -p\"${DB_ROOT_PASS}\" $1"
}

echo "[restore] 重建临时库 $RESTORE_DB ..."
mysql_root mysql <<< "DROP DATABASE IF EXISTS ${RESTORE_DB}; CREATE DATABASE ${RESTORE_DB};"

echo "[restore] 导入（gzip -dc | mysql）..."
gzip -dc "$src" | mysql_root "$RESTORE_DB"

echo "[restore] 抽查："
mysql_root "$RESTORE_DB" <<'SQL'
SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'interview_sessions', COUNT(*) FROM interview_sessions
UNION ALL SELECT 'contents', COUNT(*) FROM contents;
SQL
echo "[restore] 最新迁移："
mysql_root "$RESTORE_DB" <<'SQL'
SELECT hash, created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 3;
SQL

echo "[restore] 演练完成（临时库 $RESTORE_DB 保留供人工核查，验证后手动 DROP）"
