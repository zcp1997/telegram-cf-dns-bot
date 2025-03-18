# Cloudflare DNS 管理器

这是一个基于 Telegram Bot 的 Cloudflare DNS 交互式记录管理工具，支持多域名管理，可以方便地添加、更新、删除和查询 DNS 记录。

## 功能特点

- 🔒 用户白名单控制
- 🌐 支持多域名管理
- 📝 DNS 记录的增删改查
- 🔄 支持DDNS自动动态域名解析
- 🐳 Docker 容器化部署
- 🤖 Telegram Bot 交互界面

## 快速开始

### 前置要求

- Docker 和 Docker Compose
- Telegram Bot Token（从 [@BotFather](https://t.me/BotFather) 获取）
- Cloudflare API Token（从 Cloudflare 控制面板获取）

## 部署方式

### 方式一：使用预构建镜像（推荐）

1. 创建 `docker-compose.yml` 文件：

```yaml
services:
  tg-cf-dns-bot:
    image: ghcr.io/zcp1997/telegram-cf-dns-bot:latest
    container_name: tg-cf-dns-bot
    restart: unless-stopped
    environment:
      # Telegram Bot Token
      - TELEGRAM_TOKEN=your_telegram_token_here
      # Cloudflare API Token
      - CF_API_TOKEN=your_api_token_here
      # 允许访问的 Telegram 用户 ID（逗号分隔），第一个用户是管理员
      - ALLOWED_CHAT_IDS=123456789,987654321
      # 可选参数：排除的域名列表（逗号分隔）
      #- EXCLUDE_DOMAINS=example.com,example.org
      # 可选参数：是否部署在中国大陆服务器（默认为false）
      #- IN_CHINA=false

```

2. 编辑 `docker-compose.yml` 文件，填入必要的配置信息：

   - 替换 `your_telegram_token_here` 为您的 Telegram Bot Token
   - 替换 `your_api_token_here` 为您的 Cloudflare API Token
   - 替换 `ALLOWED_CHAT_IDS` 中的用户ID为您允许访问的用户ID

3. 启动服务：
```bash
docker compose up -d
```

1. 查看日志：
```bash
docker compose logs -f
```

### 方式二：手动构建与部署
如果您希望自行构建镜像或对代码进行修改，可以按照以下步骤操作：

1. 克隆代码仓库：
```bash
git clone https://github.com/zcp1997/telegram-cf-dns-bot.git
cd telegram-cf-dns-bot
```

2. 填写配置信息
   
   - 替换 `your_telegram_token_here` 为您的 Telegram Bot Token
   - 替换 `your_api_token_here` 为您的 Cloudflare API Token
   - 替换 `ALLOWED_CHAT_IDS` 中的用户ID为您允许访问的用户ID

3. 使用 Docker Compose 构建并启动：
   
```bash
docker compose build
docker compose up -d
```

### 更新部署

直接拉取最新镜像并重启容器：
```bash
docker compose pull
docker compose up -d
```

## Bot 命令使用说明

### 基础命令

- `/start` - 启动机器人，显示欢迎信息和功能菜单
- `/help` - 查看详细的帮助信息和使用指南
- `/domains` - 列出所有可管理的域名列表

### DNS 记录管理

- `/setdns` - 添加或更新DNS记录（支持A、AAAA、CNAME、TXT等记录类型）
- `/getdns` - 查询特定子域名的DNS记录
- `/getdnsall` - 查询根域名下所有DNS记录
- `/deldns` - 删除指定的DNS记录

### DDNS 动态域名功能

- `/ddns` - 设置自动DDNS任务（动态更新域名IP地址）
- `/ddnsstatus` - 查看所有DDNS任务的运行状态
- `/stopddns` - 暂停指定的DDNS任务
- `/delddns` - 删除指定的DDNS任务

### 管理员命令

- `/listusers` - 显示当前白名单用户列表（仅管理员可用）
- `/zonemap` - 显示域名和Zone ID的映射关系（仅管理员可用）

## 配置说明

### Cloudflare API Token 权限要求

创建 API Token 时需要包含以下权限：
- Zone - DNS - Edit
- Zone - Zone - Read

### 环境变量说明

| 变量名 | 说明 | 是否必填 | 示例 |
|--------|------|---------|------|
| TELEGRAM_TOKEN | Telegram Bot Token | 必填 | `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw` |
| CF_API_TOKEN | Cloudflare API Token | 必填 | `your-api-token-here` |
| ALLOWED_CHAT_IDS | 允许访问的用户ID（逗号分隔） | 必填 | `123456789,987654321` |
| EXCLUDE_DOMAINS | 排除的域名列表（逗号分隔） | 可选 | `example.com,example.org` |
| IN_CHINA | 是否部署在中国大陆服务器 | 可选 | `true` 或 `false`（默认为`false`） |

## 故障排除

1. 如果 Bot 无响应：
   - 检查 `TELEGRAM_TOKEN` 是否正确
   - 查看容器日志 `docker compose logs -f`

2. 如果无法管理 DNS：
   - 确认 `CF_API_TOKEN` 权限是否正确

3. 如果无法访问 Bot：
   - 确认您的 Telegram 用户 ID 是否在 `ALLOWED_CHAT_IDS` 中
   - 可以通过 [@userinfobot](https://t.me/userinfobot) 获取您的用户 ID

### 日志查看
```bash
# 查看实时日志
docker compose logs -f

# 查看最近 100 行日志
docker compose logs --tail=100
```

### 容器管理
```bash
# 停止服务
docker compose down

# 重启服务
docker compose restart

# 查看服务状态
docker compose ps
```

## 安全建议

1. 定期更换 Cloudflare API Token
2. 严格控制白名单用户访问
3. 定期检查 Bot 的访问日志

## 许可证

[MIT License](LICENSE)

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进这个项目。
