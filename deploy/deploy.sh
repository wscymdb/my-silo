#!/bin/bash

# ===================================================
# my-silo 私有资源管理服务 一键本地编译极速发版脚本
# ===================================================

set -e

# 按字面值读取配置，保留 ~，连接服务器后再按远程用户的 home 解析。
load_deploy_env() {
  local line key value quoted_pattern
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in ''|\#*) continue ;; esac
    if [[ "$line" =~ ^export[[:space:]]+ ]]; then
      line="${line#"${BASH_REMATCH[0]}"}"
    fi
    if [[ ! "$line" =~ ^([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*= ]]; then
      echo "❌ .env 包含无效的配置行" >&2
      return 1
    fi
    key="${BASH_REMATCH[1]}"
    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    case "$value" in
      \"*|\'*)
        if [[ "$value" == \"* ]]; then
          quoted_pattern='^"([^"]*)"[[:space:]]*(#.*)?$'
        else
          quoted_pattern="^'([^']*)'[[:space:]]*(#.*)?$"
        fi
        if [[ ! "$value" =~ $quoted_pattern ]]; then
          echo "❌ .env 中 $key 的引号未正确闭合" >&2
          return 1
        fi
        value="${BASH_REMATCH[1]}"
        ;;
      *)
        value="${value%%[[:space:]]\#*}"
        value="${value%"${value##*[![:space:]]}"}"
        ;;
    esac
    export "$key=$value"
  done < "$1"
}

# 转义远程路径，兼容空格和单引号。
quote_remote_arg() {
  local value="$1"
  printf "'"
  while [[ "$value" == *\'* ]]; do
    printf '%s' "${value%%\'*}" "'\\''"
    value="${value#*\'}"
  done
  printf "%s'" "$value"
}

resolve_server_dir() {
  local requested="$1" remote_home="$2" resolved
  case "$requested" in
    '~') resolved="$remote_home" ;;
    '~/'*) resolved="${remote_home%/}/${requested:2}" ;;
    /*) resolved="$requested" ;;
    *) echo '❌ SERVER_DIR 必须是绝对路径、~ 或 ~/ 开头的路径' >&2; return 1 ;;
  esac
  while [[ "$resolved" == */ && "$resolved" != / ]]; do resolved="${resolved%/}"; done
  if [[ "$resolved" != /* || "$resolved" == / || "$resolved" == *$'\n'* || "$resolved" == *$'\r'* ]]; then
    echo '❌ SERVER_DIR 不是有效的部署目录' >&2
    return 1
  fi
  printf '%s\n' "$resolved"
}


# 获取脚本与项目根目录绝对路径 (兼容 sh 与 bash)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# 临时 SSH 套接字变量与全局安全清理钩子
SSH_SOCKET=""
cleanup() {
  if [ -n "$SSH_SOCKET" ] && [ -e "$SSH_SOCKET" ]; then
    ssh -o ControlPath="$SSH_SOCKET" -O exit "$SERVER_USER@$SERVER_HOST" 2>/dev/null || true
    rm -f "$SSH_SOCKET" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "=================================================="
echo " 🚀 my-silo 资源管理服务 本地极速编译发版"
echo "=================================================="

# 1. 优先读取 deploy/.env 配置文件
if [ -f "$SCRIPT_DIR/.env" ]; then
  load_deploy_env "$SCRIPT_DIR/.env"
  echo "📄 已成功载入环境配置: deploy/.env"
fi

APP_NAME="${APP_NAME:-my-silo}"
APP_PORT="${APP_PORT:-8989}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST:-}"
SERVER_SSH_PORT="${SERVER_SSH_PORT:-22}"
SERVER_DIR="${SERVER_DIR:-/opt/my-silo}"

# 2. 判断部署目标（远程云服务器部署 还是 本机 Docker 运行）
if [ -z "$SERVER_HOST" ]; then
  echo ""
  echo "💡 提示：当前未在 deploy/.env 中配置远程服务器 SERVER_HOST"
  read -p "👉 请选择发版目标 [1: 输入远程服务器IP部署 / 2: 在本机 Docker 直接运行] (默认: 2): " DEPLOY_MODE
  DEPLOY_MODE="${DEPLOY_MODE:-2}"

  if [ "$DEPLOY_MODE" = "1" ]; then
    read -p "🔑 请输入目标服务器 IP 地址或域名 (SERVER_HOST): " SERVER_HOST
    if [ -z "$SERVER_HOST" ]; then
      echo "❌ 错误: 服务器主机地址不能为空，发版终止。"
      exit 1
    fi
  fi
fi

# 3. 本地执行前端生产构建 (产物输出至 web/dist/)
echo ""
echo "📦 [1/4] 正在构建前端 React 管理界面..."
cd "$ROOT_DIR/web"
npm run build
cd "$ROOT_DIR"

# 4. 判断并设定目标架构
TARGET_ARCH="amd64"

if [ -n "$SERVER_HOST" ]; then
  # 远程云服务器部署模式：预建 SSH 复用通道
  SSH_SOCKET_DIR="$HOME/.ssh/sockets"
  mkdir -p -m 700 "$SSH_SOCKET_DIR" 2>/dev/null || SSH_SOCKET_DIR="/tmp"
  SSH_SOCKET="$SSH_SOCKET_DIR/my-silo-deploy-${SERVER_USER}@${SERVER_HOST}-${SERVER_SSH_PORT}.sock"
  SSH_COMMON_OPTS="-p $SERVER_SSH_PORT -o ConnectTimeout=8 -o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$SSH_SOCKET -o ControlPersist=60s"

  echo ""
  echo "🔗 正在连接远程服务器 (只需验证 1 次密码)..."
  REMOTE_HOME=$(ssh $SSH_COMMON_OPTS "$SERVER_USER@$SERVER_HOST" 'printf "%s\n" "$HOME"')
  SERVER_DIR=$(resolve_server_dir "$SERVER_DIR" "$REMOTE_HOME")
  REMOTE_DIR_ARG=$(quote_remote_arg "$SERVER_DIR")

  ssh $SSH_COMMON_OPTS "$SERVER_USER@$SERVER_HOST" "mkdir -p -- $REMOTE_DIR_ARG"

  echo "🔍 检测远程服务器 CPU 架构..."
  REMOTE_UNAME=$(ssh $SSH_COMMON_OPTS "$SERVER_USER@$SERVER_HOST" "uname -m" 2>/dev/null || echo "x86_64")
  if [ "$REMOTE_UNAME" = "aarch64" ] || [ "$REMOTE_UNAME" = "arm64" ]; then
    TARGET_ARCH="arm64"
  else
    TARGET_ARCH="amd64"
  fi
  echo "   目标服务器架构: $REMOTE_UNAME (对应 Go: $TARGET_ARCH)"
else
  # 本地 Docker 模式
  LOCAL_UNAME="$(uname -m)"
  if [ "$LOCAL_UNAME" = "arm64" ] || [ "$LOCAL_UNAME" = "aarch64" ]; then
    TARGET_ARCH="arm64"
  else
    TARGET_ARCH="amd64"
  fi
  echo "   本地架构: $LOCAL_UNAME (对应 Go: $TARGET_ARCH)"
fi

# 5. 本地交叉编译静态 Linux 二进制
echo ""
echo "🔨 [2/4] 本地极速编译 Linux ($TARGET_ARCH) 静态二进制..."
mkdir -p "$ROOT_DIR/deploy/bin"
CGO_ENABLED=0 GOOS=linux GOARCH="$TARGET_ARCH" go build -ldflags="-s -w" -o "$ROOT_DIR/deploy/bin/my-silo" ./cmd/server
BINARY_SIZE=$(ls -lh "$ROOT_DIR/deploy/bin/my-silo" | awk '{print $5}')
echo "   ✅ 编译完成！纯静态二进制大小: $BINARY_SIZE (前端已完全内嵌)"

# 6. 分发与拉起容器
if [ -n "$SERVER_HOST" ]; then
  echo ""
  echo "--------------------------------------------------"
  echo "📍 目标服务器: $SERVER_USER@$SERVER_HOST (SSH端口: $SERVER_SSH_PORT)"
  echo "📍 部署目录: $SERVER_DIR"
  echo "📍 对外端口: $APP_PORT"
  echo "--------------------------------------------------"

  echo "📤 [3/4] 正在通过 rsync 增量同步部署包至远端服务器..."
  ssh $SSH_COMMON_OPTS "$SERVER_USER@$SERVER_HOST" "mkdir -p -- $REMOTE_DIR_ARG"

  rsync -avz --delete \
    -e "ssh $SSH_COMMON_OPTS" \
    --exclude '.git' \
    --exclude 'data' \
    "$ROOT_DIR/deploy" \
    "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR_ARG/"

  echo ""
  echo "🐳 [4/4] 正在远程拉起 Docker 服务 (直接秒级启动)..."
  ssh $SSH_COMMON_OPTS "$SERVER_USER@$SERVER_HOST" "cd $REMOTE_DIR_ARG && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans"

  TARGET_IP="$SERVER_HOST"
else
  # 本机 Docker 运行模式
  echo ""
  echo "--------------------------------------------------"
  echo "📍 本地容器名称: $APP_NAME"
  echo "📍 本地访问端口: $APP_PORT"
  echo "--------------------------------------------------"

  echo "🐳 [3/3] 正在通过 Docker Compose 构建并启动容器..."
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans

  TARGET_IP="localhost"
fi

echo ""
echo "=================================================="
echo " 🎉 发版成功！my-silo 资源管理服务已正式运行。"
echo " 🌐 访问地址: http://${TARGET_IP}:${APP_PORT}"
echo "=================================================="
