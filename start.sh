#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

for tool in npm go; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "未找到 $tool，请先安装 Node.js（含 npm）和 Go，并确认已加入 PATH。" >&2
    exit 1
  fi
done

echo "正在构建最新前端资源…"
npm --prefix "$PROJECT_DIR/web" run build

# 每次启动先生成最新 dist，再由 Go 嵌入并提供网页；Vite 可单独启动。
echo "正在启动 Go 服务，按 Ctrl+C 停止。"
exec go run ./cmd/server
