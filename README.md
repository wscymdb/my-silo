# 🚀 my-silo

专为个人自用打造的高性能、轻量级私有资源管理服务与图床。

---

## ✨ 核心特性

- 📁 **类似 Mac Finder 的目录交互**：支持无限级文件夹创建、双击下钻进入、顶部面包屑路径跳转、返回上一级。
- ⚡ **无感极速上传**：
  - 页面任意位置**拖拽文件**直接上传当前文件夹。
  - 截图后直接在页面 <kbd>Cmd+V</kbd> / <kbd>Ctrl+V</kbd> 自动上传（极佳的图床体验）。
- 🔗 **外链永久不变**：使用固定短 ID 分发（`/f/:id` 预览，`/d/:id` 下载），无论文件在后台怎么移动、重命名，已发布的外链永不失效。
- 🛡️ **细粒度 IP 访问控制**：
  - **公开 (Public)**：外链对全网公开。
  - **IP 白名单 (IP Whitelist)**：仅允许指定的单 IP 或 CIDR 网段（如 `192.168.1.0/24`）访问，支持一键填入当前客户端 IP，违规直接返回 403。
  - **私有 (Private)**：仅管理员登录后可见。
- ⚙️ **独立公共系统设置中心 (`/settings`)**：
  - **自定义公网域名 (Base URL)**：支持拼接反代域名，一键生成正式外链。
  - **全局默认上传策略**：可预设默认公开、白名单或私有。
  - **全局 IP 白名单与恶意 IP 黑名单**：全站通用拦截规则。
  - **开放 API Token & PicGo 快捷配置**：提供一键复制的配置 JSON，无缝对接第三方客户端。
  - **存储统计监控**：实时查看文件数、图片数、物理空间占用。
  - **在线修改密码**：数据库持久化保存，修改后免重启即刻生效。
- 🔒 **生产级安全防护**：
  - 存储文件名哈希重命名，杜绝路径穿越（Path Traversal）。
  - 强行注入 `X-Content-Type-Options: nosniff` 与 SVG 沙箱隔离，杜绝存储型 XSS。
  - 登录接口内置防爆破频率限制（Rate Limiting）。
  - 环境变量注入单管理员账密，杜绝开放注册带来的黑客扫描与刷号风险。
- 📦 **单二进制文件交付**：Go + React 前端内嵌编译，服务器**零环境依赖**，拷过去就能跑。

---

## 🏃 快速开始

### 1. 本地直接运行单二进制文件（最推荐）

我们已经将前端编译并打包进了二进制文件 `my-silo`：

```bash
# 启动服务（指定端口与管理员密码）
SILO_ADMIN_USER=admin SILO_ADMIN_PASSWORD=admin123 ./my-silo
```

打开浏览器访问：[http://localhost:8989](http://localhost:8989) 即可开始使用！

---

### 2. 一键发版到云服务器（参考 zhuyu 规范，极力推荐）

项目在 `deploy/` 目录内置了全自动发版脚本：

1. 编辑 `deploy/.env` 填入你的远程服务器 IP：
   ```bash
   SERVER_HOST=123.45.67.89
   SERVER_USER=root
   SILO_ADMIN_PASSWORD=your_password
   ```
2. 直接运行一键发版：
   ```bash
   ./deploy/deploy.sh
   ```
   * 自动在本地打包前端；
   * 建立安全 SSH 隧道（**只需验证 1 次密码**）；
   * 自动增量同步至服务器并执行 Docker 容器编排启动，自动输出访问 URL。

---

### 3. 单二进制文件跨平台交叉编译（免 Docker 模式）

如果你想直接以单个 30MB 左右的二进制文件跑在服务器（服务器上甚至不装 Docker）：

```bash
# 在 Mac 上一键交叉编译出 Linux 64位 二进制
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o my-silo-linux ./cmd/server

# 上传到服务器直接运行
scp my-silo-linux root@你的服务器IP:/opt/
ssh root@你的服务器IP "SILO_ADMIN_USER=admin SILO_ADMIN_PASSWORD=你的密码 /opt/my-silo-linux"
```

---

## ⚙️ 环境变量说明

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SILO_PORT` | `8989` | HTTP 服务监听端口 |
| `SILO_DATA_DIR` | `./data` | 数据持久化目录（存储 SQLite 与物理文件） |
| `SILO_ADMIN_USER` | `admin` | 管理员用户名 |
| `SILO_ADMIN_PASSWORD` | `admin123` | 管理员密码 |
| `SILO_API_KEY` | *(空)* | 可选的固定 API Key（供 PicGo / 脚本调用） |
| `SILO_MAX_SIZE_MB` | `500` | 单文件最大体积限制（MB） |
| `SILO_TRUSTED_PROXIES` | `127.0.0.1,::1` | 可信反向代理 IP 列表（防 XFF 伪造） |

---

## 🛠️ 本地开发热更新模式（前后端一键并发启动）

如果你在本地开发、想要实时查看前端界面修改效果，只需在项目根目录下执行一行命令：

```bash
npm run dev
```

该命令通过 `concurrently` 同时并发拉起：
* **`[go]` Go 后端服务**：监听在 `http://localhost:8989`
* **`[web]` Vite 前端热更新**：监听在 `http://localhost:7771`

👉 直接在浏览器打开 **[http://localhost:7771](http://localhost:7771)** 即可开始开发！
* 修改前端 React 代码时，浏览器毫秒级无感热刷新（HMR）。
* 按 <kbd>Ctrl+C</kbd> 退出时，**会自动干净利落地同时关闭前后端两个进程**，绝不会残留孤立进程占用端口。
