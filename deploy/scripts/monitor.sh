#!/usr/bin/env bash
# monitor.sh —— 轻量监控告警（dev/deployment.md §5：脚本 + 通知 webhook，不上
# Prometheus 全家桶）。cron 建议 */5 * * * *。
#   检查项：评测队列积压（pending > 20）、评测 ie 终态（worker 故障）、
#           server 探活、caddy 5xx（JSON 访问日志近 10 分钟计数）、
#           LLM 日 token 超预算 / 延迟 p95 > 60s（server /metrics/llm）。
#   通知：设 WEBHOOK_URL（飞书/钉钉/Server 酱通用 JSON），未设则只打日志。
#   凭据取仓库根 .env 的 MYSQL_ROOT_PASSWORD；LLM_DAILY_TOKEN_BUDGET 同 .env
#（0/空 = 不设预算，只观测）。
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="$(cd .. && pwd)/.env"

if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi

env_val() {
  [ -f "$ENV_FILE" ] || return 1
  grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DB_NAME="${MYSQL_DATABASE:-$(env_val MYSQL_DATABASE || echo ailab)}"
DB_ROOT_PASS="${MYSQL_ROOT_PASSWORD:-$(env_val MYSQL_ROOT_PASSWORD || echo root)}"
PENDING_THRESHOLD="${PENDING_THRESHOLD:-20}"
WEBHOOK_URL="${WEBHOOK_URL:-$(env_val WEBHOOK_URL || echo "")}"

alarms=()

mysql_exec() {
  $COMPOSE -f docker-compose.yml exec -T mysql sh -c \
    "exec mysql -uroot -p\"${DB_ROOT_PASS}\" -N -s ${DB_NAME} -e \"$1\"" 2>/dev/null
}

# 1. 评测队列积压
pending=$(mysql_exec "SELECT COUNT(*) FROM submissions WHERE status='pending'" || echo "")
if [ -n "$pending" ] && [ "$pending" -gt "$PENDING_THRESHOLD" ]; then
  alarms+=("评测队列积压 ${pending}（阈值 ${PENDING_THRESHOLD}，>10 分钟持续即扩 JUDGE_CONCURRENCY）")
fi

# 2. 评测 ie 终态（internal error：worker 自身故障，出现即告警）
ie=$(mysql_exec "SELECT COUNT(*) FROM submissions WHERE status='ie' AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)" || echo "")
if [ -n "$ie" ] && [ "$ie" -gt 0 ]; then
  alarms+=("近 10 分钟出现 ${ie} 条 ie（评测 worker 故障，需人工介入）")
fi

# 3. server 探活（compose 内网）
if ! $COMPOSE -f docker-compose.yml exec -T server \
  sh -c "node -e \"fetch('http://localhost:3001/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"" 2>/dev/null; then
  alarms+=("server /healthz 探活失败")
fi

# 4. caddy 5xx（JSON 访问日志，近 10 分钟计数 > 50 即告警——单机量级阈值）。
#    grep -c 无匹配时 exit 1（pipefail/set -e 会中断脚本），接 || true 拿到计数 0
CADDY_5XX_THRESHOLD="${CADDY_5XX_THRESHOLD:-50}"
caddy_5xx=$($COMPOSE -f docker-compose.yml logs --since 10m caddy 2>/dev/null \
  | grep -coE '"status":5[0-9][0-9]' || true)
if [ "$caddy_5xx" -gt "$CADDY_5XX_THRESHOLD" ]; then
  alarms+=("caddy 近 10 分钟 5xx ${caddy_5xx} 条（阈值 ${CADDY_5XX_THRESHOLD}）")
fi

# 5. LLM 日 token 超预算 / 延迟 p95 > 60s（server /metrics/llm 打点）
LLM_DAILY_TOKEN_BUDGET="${LLM_DAILY_TOKEN_BUDGET:-$(env_val LLM_DAILY_TOKEN_BUDGET || echo 0)}"
llm_json=$($COMPOSE -f docker-compose.yml exec -T server \
  sh -c "node -e \"fetch('http://localhost:3001/metrics/llm').then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1))\"" 2>/dev/null || echo "")
if [ -n "$llm_json" ] && [ "$llm_json" != "exit" ]; then
  llm_tokens=$(printf '%s' "$llm_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["totals"]["tokens"])' 2>/dev/null || echo "")
  llm_p95=$(printf '%s' "$llm_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["latency"]["p95Ms"] or "")' 2>/dev/null || echo "")
  if [ -n "$llm_tokens" ] && [ "$LLM_DAILY_TOKEN_BUDGET" -gt 0 ] 2>/dev/null \
    && [ "$llm_tokens" -gt "$LLM_DAILY_TOKEN_BUDGET" ]; then
    alarms+=("LLM 日 token ${llm_tokens} 超预算 ${LLM_DAILY_TOKEN_BUDGET}")
  fi
  if [ -n "$llm_p95" ] && [ "$llm_p95" -gt 60000 ] 2>/dev/null; then
    alarms+=("LLM 延迟 p95 ${llm_p95}ms > 60s（评估模型响应过慢）")
  fi
fi

# 6. 异常用量（05 风险清单：单用户日用量突增 10 倍——今日 vs 昨日 usage_quotas）
spike=$(mysql_exec "SELECT u.user_id, u.kind, u.used, y.used AS yest FROM usage_quotas u LEFT JOIN usage_quotas y ON y.user_id = u.user_id AND y.kind = u.kind AND y.period = DATE_SUB(u.period, INTERVAL 1 DAY) WHERE u.period = CURDATE() AND u.used >= 20 AND y.used IS NOT NULL AND y.used > 0 AND u.used > y.used * 10 LIMIT 3" || echo "")
if [ -n "$spike" ]; then
  # 输出形态：user_id\tkind\tused\tyest（制表符分隔）
  while IFS=$'\t' read -r uid kind used yest; do
    [ -n "$uid" ] && alarms+=("用户 #${uid} ${kind} 今日用量 ${used}（昨日 ${yest}，突增超 10 倍，防滥用检查）")
  done <<< "$spike"
fi

if [ ${#alarms[@]} -eq 0 ]; then
  echo "[monitor] OK（$(date '+%F %T')）"
  exit 0
fi

# 告警输出 + webhook 通知
msg="[AIInfra Lab 监控告警] $(date '+%F %T')
${alarms[*]}"
echo "$msg" >&2
if [ -n "$WEBHOOK_URL" ]; then
  curl -fsS -m 10 -H 'Content-Type: application/json' \
    -d "{\"msg_type\":\"text\",\"content\":{\"text\":$(printf '%s' "$msg" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}}" \
    "$WEBHOOK_URL" >/dev/null \
    && echo "[monitor] 已推送 webhook" \
    || echo "[monitor] webhook 推送失败（WEBHOOK_URL=$WEBHOOK_URL）" >&2
fi
exit 1
