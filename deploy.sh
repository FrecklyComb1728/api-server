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
    echo "$(date '+%Y-%m-%d %H:%M:%S') 部署失败，exit code: $exit_code" >> "$LOG_FILE"
  fi
}
trap cleanup EXIT
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}
log "开始部署..."
cd "$REPO_DIR"
PREV_COMMIT=$(git rev-parse --short HEAD)
log "当前版本: $PREV_COMMIT"
git fetch origin main
git reset --hard origin/main
NEW_COMMIT=$(git rev-parse --short HEAD)
log "新版本: $NEW_COMMIT"
if git diff "$PREV_COMMIT" HEAD --name-only | grep -q "package.*json"; then
  log "依赖有变动，开始安装..."
  npm ci --registry=https://registry.npmmirror.com
else
  log "依赖无变动，跳过安装"
fi
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
log "部署完成: $PREV_COMMIT -> $NEW_COMMIT"