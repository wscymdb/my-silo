# my-silo

## 一、介绍

my-silo 是面向个人使用的文件管理服务与图床，支持通过网页管理文件、生成访问外链，并通过 API 对接上传工具。

- **文件管理**：支持多级目录、文件上传、重命名、删除，以及列表和网格视图。
- **便捷上传**：支持拖拽文件、粘贴图片上传，提供文件直链和图片 Markdown 链接。
- **访问控制**：支持公开、私有和 IP 白名单访问策略，以及全局 IP 规则。
- **图床接入**：提供 API Key 和 PicGo 配置参考，方便第三方客户端上传。
- **系统设置**：支持配置外链域名、默认访问策略，并查看文件数量和存储占用。

后端使用 Go，前端使用 React、TypeScript 和 Vite，数据保存在 SQLite 与本地文件目录中。前端构建产物会嵌入 Go 二进制，运行一个后端服务即可同时提供网页和 API。

部署采用本地构建、服务器运行的方式，减少服务器编译时的 CPU 和内存开销，适合配置有限的个人服务器。

## 二、环境准备

本机需要安装：

- **Go 1.26 或更新兼容版本**：编译和运行后端。
- **Node.js 22（用的是这个版本开发的 低版本可以尝试应该没啥问题）**：安装前端依赖和构建页面。

首次拉取项目后，在项目根目录安装前端依赖：

```bash
npm --prefix web install
```

## 三、快速开始

在项目根目录执行：

```bash
bash start.sh
```

脚本每次都会构建最新前端资源，再启动 Go 服务，无需单独启动前端。

启动后访问 [http://localhost:8989](http://localhost:8989)。未配置环境变量时，默认账号为 `admin`，密码为 `admin123`。

按 `Ctrl+C` 停止服务。

## 四、二次开发

开发时分别启动后端和前端。

终端一，在项目根目录启动后端：

```bash
bash start.sh
```

终端二，从项目根目录进入 `web`，启动 Vite 开发服务：

```bash
cd web
npm run dev
```

访问 [http://localhost:7771](http://localhost:7771) 进行开发，修改前端代码后会自动热更新，接口请求会代理到后端的 `8989` 端口。

[http://localhost:8989](http://localhost:8989) 展示的是运行 `start.sh` 时构建并嵌入 Go 的页面，不会随前端代码修改自动更新。修改 Go 代码或需要更新该页面时，停止后端并重新运行 `bash start.sh`。

结束开发时，在前后端两个终端分别按 `Ctrl+C`。

## 五、部署

Go 编译会占用 CPU 和内存，部分服务器配置有限，因此项目采用**本地编译、服务器运行**的方式。前端构建和 Go 交叉编译均在本机完成，服务器只将编译好的程序打包为 Docker 运行镜像并启动容器，不在服务器上编译 Go。

### 1. 准备服务器

服务器需要安装 Docker 和 Docker Compose v2，并支持 SSH 连接及 rsync 传输，无需安装 Go 或 Node.js。本机使用第二部分准备的 Go、Node.js，以及 Bash、SSH 客户端和 rsync；远程部署时本机不需要 Docker。

### 2. 配置部署信息

首次部署时，在本机项目根目录复制配置模板；已有 `deploy/.env` 时直接编辑：

```bash
cp deploy/.env.example deploy/.env
```

填写本机 `deploy/.env`：

```dotenv
APP_NAME=my-silo                              # 镜像名和容器名称
APP_PORT=8989                                 # 服务器对外访问端口
SILO_ADMIN_PASSWORD=replace_with_your_production_password # 管理员初始密码

SERVER_HOST=your-server.example.com           # 服务器 IP 或域名
SERVER_USER=root                             # SSH 登录用户
SERVER_SSH_PORT=22                            # SSH 端口
SERVER_DIR=~/my-silo                          # 服务器部署目录，~ 为远程用户 home；也可填 /opt/my-silo
```

`.env` 不提交 Git，但会随部署包同步到服务器。

### 3. 在本机执行部署

在本机项目根目录运行：

```bash
bash deploy/deploy.sh
```

脚本会依次完成：

1. 本机构建最新前端资源。
2. 连接服务器，检测目标 CPU 架构并检查部署路径。
3. 本机交叉编译 Linux `amd64` 或 `arm64` 程序，将前端资源嵌入 Go 二进制。
4. 使用 rsync 上传部署包和预编译程序。
5. 服务器使用 Docker Compose 打包运行镜像并启动服务。

完成后访问 `http://服务器地址:APP_PORT`，并确保服务器防火墙和云安全组允许该端口。后续更新仍在本机执行同一部署命令。

数据持久化在服务器的 `SERVER_DIR/data/`，包括数据库和上传文件。更新容器时应保留该目录。日志查看、密码修改和数据目录说明见 [部署维护文档](deploy/README.md)。

### 4. 查看服务和日志

登录服务器，进入实际的部署目录 `SERVER_DIR` 后执行：

```bash
# 查看服务状态
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps

# 查看最近日志并持续跟随，Ctrl+C 退出查看
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f --tail=100 my-silo
```

### 5. 修改或重置密码

网页不提供修改密码入口。忘记密码时也可以直接在服务器重置，无需旧密码。进入实际的部署目录后执行：

```bash
# 设置新密码，至少 6 位，立即生效，无需重启
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec my-silo /app/my-silo reset-password '替换成你的新密码'
```

密码保存在数据库中，更新或重启容器后仍保留。修改密码不会主动撤销已签发的登录 Token。命令中的 `my-silo` 是 Compose 服务名，即使修改了 `APP_NAME` 也不用替换。

如果希望改用 `deploy/.env` 中的 `SILO_ADMIN_PASSWORD`：

1. 修改本机 `deploy/.env` 中的密码，再执行 `bash deploy/deploy.sh`，让服务器容器加载新配置。
2. 在服务器的实际部署目录执行以下命令，清除数据库中优先级更高的密码：

   ```bash
   # 不带新密码参数，恢复使用运行中容器的环境变量密码
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec my-silo /app/my-silo reset-password
   ```

单纯重启不会重置密码。只修改 `.env` 文件也不会更新运行中容器的环境变量，需要重新部署或重建容器。

### 6. 重启与更新

在服务器的实际部署目录执行普通重启：

```bash
# 重启现有服务，不更新程序或环境变量
docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart my-silo
```

更新程序时，在本机项目根目录重新执行 `bash deploy/deploy.sh`。服务器上的 `deploy/.env` 会被本机配置覆盖，因此长期配置应在本机修改。

## 六、AI Rule

统一在根目录 `ai/rules/` 中维护规则，通过 `web` 下的命令生成不同 IDE 的适配文件。

在项目根目录执行：

```bash
# 生成所有适配规则
npm --prefix web run ai:sync

# 只生成 Antigravity 规则
npm --prefix web run ai:sync:antigravity

# 只生成 Codex 规则
npm --prefix web run ai:sync:codex
```

也可以进入 `web` 目录后执行对应的 `npm run ai:sync` 等命令，输出位置不变：

| 目标        | 生成位置                |
| ----------- | ----------------------- |
| Antigravity | 根目录 `.agents/rules/` |
| Codex       | 根目录 `AGENTS.md`      |

首次拉取项目或修改规则源后执行一次即可。生成过程仅使用 Node.js 内置模块，无需先安装前端依赖。

只修改 `ai/rules/` 中的规则源，再运行命令同步。生成的适配文件已被 Git 忽略，不需要提交。更多说明见 [AI 规则文档](ai/README.md)。
