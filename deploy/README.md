# 🚀 my-silo 一键发版与部署指南

参考标准云原生发版规范，本项目在 `deploy/` 目录下提供了一整套**全自动化一键发版体系**。

---

## 🛠️ 目录清单

| 文件 | 说明 |
| :--- | :--- |
| `deploy.sh` | **一键打包发版核心脚本**（自动构建前端、增量同步服务器、复用 SSH 隧道、拉起 Docker） |
| `docker-compose.yml` | 生产级容器编排文件（映射端口、注入环境变量、挂载数据卷） |
| `Dockerfile` | 多阶段极致优化的生产镜像构建脚本（前端+Go二进制） |
| `.env.example` | 生产环境变量模版 |
| `.env` | 当前生效的部署环境变量（已默认生成） |

---

## ⚡ 极速发版方式

### 方式 1：一键发布到远端服务器（最爽快）

1. 打开 `deploy/.env`，填入你的服务器信息：
   ```env
   SERVER_HOST=123.45.67.89      # 你的服务器 IP
   SERVER_USER=root              # 登录用户名
   SERVER_SSH_PORT=22            # SSH 端口
   SERVER_DIR=/opt/my-silo       # 远程部署目标目录
   SILO_ADMIN_PASSWORD=your_password  # 你想要的管理员密码
   ```

2. 在终端直接敲入一行命令：
   ```bash
   ./deploy/deploy.sh
   ```
   * 自动在本地构建前端静态包；
   * 建立安全 SSH 隧道（**只需验证 1 次密码**）；
   * 通过 `rsync` 增量同步核心代码至远程服务器；
   * 在远程服务器自动执行 `docker compose up -d --build` 并输出公网访问地址！

---

### 方式 2：在本机 Docker 直接运行

如果 `deploy/.env` 中的 `SERVER_HOST` 为空，直接执行：
```bash
./deploy/deploy.sh
```
回车确认后，脚本会在本机通过 Docker 构建并拉起容器，直接在 `http://localhost:8989` 启动。
