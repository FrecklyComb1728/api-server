#!/bin/bash
set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$REPO_DIR/logs/deploy.log"
LOCK_FILE="/tmp/api-server/deploy.lock"
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$LOCK_FILE")"
if [ -f "$LOCK_FILE" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') 已有部署在进行中，跳过" >> "$LOG_FILE"
  exit 0
fi
touch "$LOCK_FILE"
cleanup() {
  local exit_code=$?
  rm -f "$LOCK_FILE"
  if [ $exit_code -ne 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') 部署失败，行号: ${BASH_LINENO[0]}，exit code: $exit_code" >> "$LOG_FILE"
  fi
}
trap cleanup EXIT
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}
log_stderr() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
  echo "$1" >&2
}
log "开始部署..."
cd "$REPO_DIR"
PREV_COMMIT=$(git rev-parse --short HEAD)
log "当前版本: $PREV_COMMIT"
if ! git fetch origin main 2>&1; then
  log_stderr "git fetch 失败"
  exit 1
fi
if ! git reset --hard origin/main 2>&1; then
  log_stderr "git reset 失败"
  exit 1
fi
NEW_COMMIT=$(git rev-parse --short HEAD)
log "新版本: $NEW_COMMIT"
if git diff "$PREV_COMMIT" HEAD --name-only | grep -q "package.*json"; then
  log "依赖有变动，开始安装..."
  if ! npm ci --registry=https://registry.npmmirror.com 2>&1; then
    log_stderr "npm ci 失败"
    exit 1
  fi
else
  log "依赖无变动，跳过安装"
fi
if ! pm2 reload ecosystem.config.js --update-env 2>&1; then
  log "pm2 reload 失败，尝试 pm2 start..."
  if ! pm2 start ecosystem.config.js 2>&1; then
    log_stderr "pm2 start 失败"
    exit 1
  fi
fi
log "部署完成: $PREV_COMMIT -> $NEW_COMMIT"
