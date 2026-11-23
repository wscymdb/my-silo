# 部署与服务器维护

开发环境安装、首次发版步骤和整体流程见 [项目 README](../README.md)。本文中的服务器维护命令，均在服务器实际的 `SERVER_DIR` 目录下执行。

## 编译和运行的分工

| 阶段 | 执行位置 | 内容 |
| --- | --- | --- |
| 前端构建 | 本机 | 使用 Node.js 和 npm 构建 `web/dist` |
| Go 编译 | 本机 | 使用 Go 工具链交叉编译目标 Linux 架构，嵌入前端资源 |
| 部署同步 | 本机 → 服务器 | rsync 上传 `deploy/`，包括配置和预编译二进制 |
| 镜像打包与服务运行 | 服务器 | Docker 复制二进制、安装运行依赖并启动应用 |

这样可以减少低配置服务器在编译时的 CPU 和内存开销。本机的编译环境是 Go 和 Node.js（含 npm）；服务器使用 Docker 和 Compose v2，不需要 Go 或 Node.js。

部署脚本使用 Bash、SSH 和 rsync，服务器也需要支持 SSH 连接和 rsync 传输。远程发版时本机无需 Docker，本机 Docker 运行模式才需要安装。

## 目录和配置文件

| 文件 | 用途 |
| --- | --- |
| `deploy.sh` | 本机执行的构建与发版脚本 |
| `docker-compose.yml` | 配置镜像、容器端口、环境变量和数据挂载 |
| `Dockerfile` | 基于 Alpine 的运行镜像，复制本机已编译的 `bin/my-silo` |
| `bin/my-silo` | 本机编译生成的 Linux 程序，不提交 Git |
| `.env.example` | 配置模板，首次使用需复制为 `.env` |
| `.env` | 本机维护的部署配置，随部署包上传，不提交 Git |

本机执行 `bash deploy/deploy.sh` 即可构建并发版。脚本支持目标 Linux `amd64` 和 `arm64`。请保持本机 `deploy/.env` 为配置来源，直接修改服务器副本的内容可能被下次发版覆盖。

### 服务器目录与数据

`SERVER_DIR=~/my-silo` 中的 `~` 是 `SERVER_USER` 在服务器上的 home，不是本机 home。root 用户通常部署在 `/root/my-silo`。配置也支持 `/opt/my-silo` 等绝对路径，不支持 `$HOME` 等变量替换。

持久化数据存放在 `SERVER_DIR/data`，挂载到容器 `/data`：

- `data/silo.db`：SQLite 数据库，包括文件记录、配置和密码哈希。
- `data/uploads/`：上传文件。

部署直接使用配置的 `SERVER_DIR`，不会因旧容器使用过其他目录而拦截。更换到没有数据的新目录会初始化全新的数据库和文件目录，旧目录不会被自动迁移或删除。如需保留原数据，自行迁移完整 `data/` 后再部署。

## 常用维护命令

```bash
# 查看容器状态
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps

# 查看日志，Ctrl+C 退出日志跟随
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f --tail=100 my-silo

# 普通重启，不更新程序或环境变量
docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart my-silo
```

代码更新由本机重新执行发版脚本完成。只重启容器不会换成新的程序。

## 密码管理

### 设置新密码

服务器执行以下命令，不需要旧密码：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec my-silo /app/my-silo reset-password '替换成你的新密码'
```

新密码至少 6 位，写入持久化数据库，立即用于新的登录请求，无需重启。命令使用 Compose 服务名 `my-silo`，即使自定义了容器名称也无需修改。

### 恢复到环境变量密码

不带参数执行重置命令，会清除数据库密码，让登录使用**运行中容器的** `SILO_ADMIN_PASSWORD`：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec my-silo /app/my-silo reset-password
```

如果还要修改环境变量密码，推荐更新本机 `deploy/.env` 并重新发版，然后执行上述清除命令。仅修改 `.env` 文件不会改变运行中容器的环境变量。

如需在服务器临时处理，修改服务器 `deploy/.env` 后重建容器，再清除数据库密码：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --force-recreate my-silo
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec my-silo /app/my-silo reset-password
```

之后将同样的配置更新到本机，避免下次发版覆盖。普通 `restart` 不会加载新环境变量；单纯重启也不会清除数据库密码。

### 直接运行二进制时

使用与正在运行的服务相同的数据目录执行：

```bash
SILO_DATA_DIR=/实际数据目录 ./my-silo reset-password '替换成你的新密码'

# 或清除数据库密码，恢复为正在运行的服务的环境变量密码
SILO_DATA_DIR=/实际数据目录 ./my-silo reset-password
```

不要换成空数据目录，否则会操作另一个数据库。修改密码不会主动撤销已签发的登录 Token。

## 环境变量

### 部署脚本配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_NAME` | `my-silo` | 镜像名和容器名称，Compose 服务名仍为 `my-silo` |
| `APP_PORT` | `8989` | 宿主机端口，映射到容器 `8989` |
| `IMAGE_TAG` | `latest` | 镜像标签 |
| `SERVER_HOST` | 空 | 远程主机；为空时进入部署目标选择提示 |
| `SERVER_USER` | `root` | SSH 登录用户 |
| `SERVER_SSH_PORT` | `22` | SSH 端口 |
| `SERVER_DIR` | `/opt/my-silo` | 服务器部署目录，支持 `~/my-silo` |

### 应用配置

| 变量 | 应用默认值 | 说明 |
| --- | --- | --- |
| `SILO_PORT` | `8989` | Go 监听端口；当前 Compose 固定为 `8989`，对外端口用 `APP_PORT` 调整 |
| `SILO_DATA_DIR` | `./data` | 数据目录；当前 Compose 固定为 `/data` 并挂载宿主机 `data/` |
| `SILO_ADMIN_USER` | `admin` | 管理员用户名配置 |
| `SILO_ADMIN_PASSWORD` | `admin123` | 初始或回退密码，部署前应设置；数据库密码优先 |
| `SILO_API_KEY` | 空 | API Key 回退值，设置页面生成的数据库 Key 优先 |
| `SILO_MAX_SIZE_MB` | `500` | 上传大小限制，单位 MB |
| `SILO_JWT_SECRET` | 自动生成并持久化 | JWT 签名密钥 |
| `SILO_TRUSTED_PROXIES` | `127.0.0.1,::1` | 可信反向代理列表 |

当前 Compose 显式传入管理员配置、API Key 和上传大小限制。需要为容器自定义 `SILO_JWT_SECRET` 或 `SILO_TRUSTED_PROXIES` 时，除设置 `.env` 外，还需在 Compose 的 `environment` 中添加对应项；`.env` 中的变量不会自动全部注入容器。
