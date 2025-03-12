# Cloudflare DNS 管理器

这是一个基于 Telegram Bot 的 Cloudflare DNS 记录管理工具，支持多域名管理，可以方便地添加、更新、删除和查询 DNS 记录。

## 功能特点

- 🔒 用户白名单控制
- 🌐 支持多域名管理
- 📝 DNS 记录的增删改查
- 🐳 Docker 容器化部署
- 🤖 Telegram Bot 交互界面

## 快速开始

### 前置要求

- Docker 和 Docker Compose
- Telegram Bot Token（从 [@BotFather](https://t.me/BotFather) 获取）
- Cloudflare API Token（从 Cloudflare 控制面板获取）
- 域名的 Zone ID（从 Cloudflare 控制面板获取）

### 部署步骤

1. 克隆项目：
```bash
git clone https://github.com/yourusername/cloudflare-dns-manager.git
cd cloudflare-dns-manager
```

2. 创建环境配置文件：
```bash
cp .env.example .env
```

3. 编辑 `.env` 文件，填入必要的配置信息：
```env
# Telegram Bot Token
TELEGRAM_TOKEN=your_telegram_token_here

# Cloudflare API Token
CF_API_TOKEN=your_api_token_here

# 域名到 Zone ID 的映射（JSON 格式）
DOMAIN_ZONE_MAP={"example.com":"zone_id_1","example.org":"zone_id_2"}

# 允许访问的 Telegram 用户 ID（逗号分隔）
ALLOWED_CHAT_IDS=123456789,987654321
```

4. 启动服务：
```bash
docker-compose up -d
```

5. 查看日志：
```bash
docker-compose logs -f
```

### 更新部署

1. 拉取最新代码：
```bash
git pull
```

2. 重新构建并启动容器：
```bash
docker-compose up -d --build
```

## Bot 命令使用说明

### 基础命令

- `/start` - 显示欢迎信息和使用说明
- `/help` - 显示帮助信息
- `/domains` - 列出所有已配置的域名

### DNS 记录管理

- `/setdns <域名> <IP地址>` - 添加或更新 DNS 记录
  - 例如：`/setdns test.example.com 192.168.1.1`

- `/getdns <域名>` - 查询域名的 DNS 记录
  - 例如：`/getdns test.example.com`

- `/deldns <域名>` - 删除域名的 DNS 记录
  - 例如：`/deldns test.example.com`

### 管理员命令

- `/listusers` - 显示当前白名单用户列表（仅管理员可用）
- `/zonemap` - 显示域名和 Zone ID 的映射关系（仅管理员可用）

## 配置说明

### Cloudflare API Token 权限要求

创建 API Token 时需要包含以下权限：
- Zone - DNS - Edit
- Zone - Zone - Read

### 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| TELEGRAM_TOKEN | Telegram Bot Token | `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw` |
| CF_API_TOKEN | Cloudflare API Token | `your-api-token-here` |
| DOMAIN_ZONE_MAP | 域名到 Zone ID 的映射 | `{"example.com":"abc123","example.org":"def456"}` |
| ALLOWED_CHAT_IDS | 允许访问的用户 ID | `123456789,987654321` |

## 故障排除

1. 如果 Bot 无响应：
   - 检查 `TELEGRAM_TOKEN` 是否正确
   - 查看容器日志 `docker-compose logs -f`

2. 如果无法管理 DNS：
   - 确认 `CF_API_TOKEN` 权限是否正确
   - 检查 `DOMAIN_ZONE_MAP` 格式是否正确

3. 如果无法访问 Bot：
   - 确认您的 Telegram 用户 ID 是否在 `ALLOWED_CHAT_IDS` 中
   - 可以通过 [@userinfobot](https://t.me/userinfobot) 获取您的用户 ID

## 维护与支持

### 日志查看
```bash
# 查看实时日志
docker-compose logs -f

# 查看最近 100 行日志
docker-compose logs --tail=100
```

### 容器管理
```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps
```

## 安全建议

1. 定期更换 Cloudflare API Token
2. 严格控制白名单用户访问
3. 不要将 `.env` 文件提交到代码仓库
4. 定期检查 Bot 的访问日志

## 许可证

[MIT License](LICENSE)

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进这个项目。

---

如有问题，请提交 Issue 或联系项目维护者。
