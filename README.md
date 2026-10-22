# PureNav

轻量、自托管的导航页。分组 + 卡片 + 高保真动效，前台浏览、后台管理，Docker 一键部署。

- **前台**：分组卡片网格、即时搜索（`/` 聚焦）、深浅色切换、离线快照、`prefers-reduced-motion` 降级
- **后台**：管理员登录、分组与站点 CRUD、排序、标签、内网地址、导入导出、操作日志
- **部署**：单容器、SQLite、数据目录挂载；GitHub Actions 自动产出 `linux/amd64` + `linux/arm64` 镜像

## 快速开始

```bash
docker run -d --name purenav \
  -p 8090:8080 \
  -v $(pwd)/data:/data \
  --restart unless-stopped \
  ghcr.io/j9kkk/purenav:latest
```

打开 <http://localhost:8090>，首次访问会引导创建管理员账号。

> 容器内固定监听 `8080`，宿主机端口自选。若宿主机 `8080` 已被占用，改 `-p` 左侧即可。

### docker compose

```bash
docker compose up -d
```

默认映射 `${PURENAV_PORT:-8090}:8080`。改端口：

```bash
PURENAV_PORT=9000 docker compose up -d
```

本地从源码构建，把 `docker-compose.yml` 里的 `image:` 换成 `build: .`（或直接 `docker build -t purenav:local .`）。

## 配置

全部通过环境变量，均有默认值，通常只需关心端口和数据目录。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 容器内监听端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `PURE_DATA_DIR` | `/data` | 数据目录（SQLite + 上传图标） |
| `PURE_WEB_DIST` | `/app/web-dist` | 前端构建产物位置 |
| `PURE_SESSION_TTL_DAYS` | `7` | 登录会话有效期 |
| `PURE_TRUST_PROXY` | `0` | 置于反向代理后设为 `1`，以读取真实客户端 IP |
| `PURE_SECURE_COOKIE` | `0` | 公网 https 部署建议设为 `1` |
| `LOG_LEVEL` | `info` | 日志级别 |

完整示例见 [`.env.example`](.env.example)。

### 数据

`/data` 下有两类内容，挂载后即可持久化、备份、迁移：

- `purenav.db`（含 `-wal`/`-shm`）—— 全量业务数据
- `assets/` —— 后台上传的图标文件

备份直接打包整个目录即可；升级镜像不会改动已有数据（启动时自动迁移）。

## 反向代理

置于 Nginx / Caddy / Traefik 之后时：

```nginx
location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

同时设置 `PURE_TRUST_PROXY=1` 与 `PURE_SECURE_COOKIE=1`。

## 本地开发

需要 Node.js 22+。

```bash
npm install
npm run dev:server   # http://127.0.0.1:8080
npm run dev:web      # http://127.0.0.1:5173，已代理 API 到 8080
```

首次启动无账号时，打开 `/admin` 会进入初始化流程。

```bash
npm run typecheck    # 前后端类型检查
npm run build        # 构建 web + server
docker build -t purenav:local .
```

## 发布

推送语义化版本 tag 即触发多架构镜像构建并推送到 GHCR：

```bash
git tag v0.1.0
git push origin v0.1.0
```

产出 `ghcr.io/<owner>/purenav`：`0.1.0`、`0.1`、`0`、`latest`、`sha-xxxxxxx`。PR 与 `main` 推送只跑 CI（类型检查、构建、镜像冒烟测试），不推送镜像。

镜像匿名拉取已验证可用（`docker pull ghcr.io/j9kkk/purenav:0.1.0`）。若你的账号策略默认把新包设为私有，需在仓库 **Packages** 设置里改为 `public`。

## 项目结构

```
apps/
  server/          Fastify + SQLite，API 与静态托管
    src/db/        迁移与连接
    src/lib/       认证、密码、设置、错误
    src/routes/    公共 / 认证 / 分组 / 站点 / 设置与资源
  web/             React + Vite 单页应用
    src/pages/     NavPage / LoginPage / AdminPage
docs/
  product/         需求与功能模块梳理
  design/          数据模型与接口设计
```

数据模型、接口清单与关键设计取舍见 [`docs/design/data-model-and-api.md`](docs/design/data-model-and-api.md)，功能模块拆分见 [`docs/product/feature-modules.md`](docs/product/feature-modules.md)。

## 安全说明

- 密码使用 Node 内置 scrypt 加盐哈希；会话只存 token 的 SHA-256，Cookie 为 `HttpOnly` + `SameSite=Lax`
- 所有非 GET 请求校验 `Origin` 同源；登录失败 10 次锁定 15 分钟
- 全站 CSP、`X-Frame-Options: DENY`、`nosniff`
- 站外地址仅接受 `http/https`；上传图标校验 magic bytes
- **内网地址不会出现在匿名接口**：`/public/config` 永远不含 `lan_url`，仅后台登录后可见

## License

MIT
