# Cloudflare DNS Manager

This is an interactive Cloudflare DNS record management tool based on Telegram Bot, supporting multi-domain management for easy addition, updating, deletion, and querying of DNS records.

[中文文档](README_CN.md)

## Features

- 🔒 User whitelist control
- 🌐 Multi-domain management
- 📝 DNS record CRUD operations
- 🐳 Docker containerized deployment
- 🤖 Telegram Bot interactive interface

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Telegram Bot Token (obtain from [@BotFather](https://t.me/BotFather))
- Cloudflare API Token (obtain from Cloudflare dashboard)
- Domain Zone IDs (obtain from Cloudflare dashboard)

## Deployment Methods

### Method 1: Using Pre-built Image (Recommended)

1. Create a `docker-compose.yml` file:

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
      # Allowed Telegram user IDs (comma-separated), first user is admin
      - ALLOWED_CHAT_IDS=123456789,987654321
      # Domain to Zone ID mapping (JSON format)
      - 'DOMAIN_ZONE_MAP=
        {
          "example.com": "zone_id_1",
          "example.org": "zone_id_2",
          "another-domain.com": "zone_id_3"
        }'
```

2. Edit the `docker-compose.yml` file, filling in the necessary configuration:
   - Replace `your_telegram_token_here` with your Telegram Bot Token
   - Replace `your_api_token_here` with your Cloudflare API Token
   - Replace user IDs in `ALLOWED_CHAT_IDS` with your allowed user IDs
   - Configure your domains and corresponding Zone IDs in `DOMAIN_ZONE_MAP`

3. Start the service:
```bash
docker compose up -d
```

4. View logs:
```bash
docker compose logs -f
```

### Method 2: Manual Build and Deployment
If you prefer to build the image yourself or modify the code, follow these steps:

1. Clone the repository:
```bash
git clone https://github.com/zcp1997/telegram-cf-dns-bot.git
cd telegram-cf-dns-bot
```

2. Fill in the configuration information

3. Build and start using Docker Compose:
```bash
docker compose build
docker compose up -d
```

### Updating Deployment

Simply pull the latest image and restart the container:
```bash
docker compose pull
docker compose up -d
```

## Bot Command Usage

### Basic Commands

- `/start` - Display welcome message and instructions
- `/help` - Display help information
- `/domains` - List all configured domains

### DNS Record Management

- `/setdns` - Add or update DNS records
- `/getdns` - Query DNS records for a domain
- `/getdnsall` - Query all DNS records under a root domain
- `/deldns` - Delete DNS records for a domain

### Admin Commands

- `/listusers` - Display current whitelist users (admin only)
- `/zonemap` - Display domain to Zone ID mapping (admin only)

## Configuration Details

### Cloudflare API Token Permission Requirements

When creating an API Token, include the following permissions:
- Zone - DNS - Edit
- Zone - Zone - Read

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| TELEGRAM_TOKEN | Telegram Bot Token | `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw` |
| CF_API_TOKEN | Cloudflare API Token | `your-api-token-here` |
| DOMAIN_ZONE_MAP | Domain to Zone ID mapping | `{"example.com":"abc123","example.org":"def456"}` |
| ALLOWED_CHAT_IDS | Allowed user IDs | `123456789,987654321` |

## Troubleshooting

1. If the Bot is unresponsive:
   - Check if `TELEGRAM_TOKEN` is correct
   - View container logs with `docker compose logs -f`

2. If unable to manage DNS:
   - Confirm `CF_API_TOKEN` has correct permissions
   - Check if `DOMAIN_ZONE_MAP` format is correct

3. If unable to access the Bot:
   - Confirm your Telegram user ID is in `ALLOWED_CHAT_IDS`
   - You can get your user ID via [@userinfobot](https://t.me/userinfobot)

### Viewing Logs
```bash
# View real-time logs
docker compose logs -f

# View last 100 lines of logs
docker compose logs --tail=100
```

### Container Management
```bash
# Stop service
docker compose down

# Restart service
docker compose restart

# Check service status
docker compose ps
```

## Security Recommendations

1. Regularly rotate your Cloudflare API Token
2. Strictly control whitelist user access
3. Regularly check Bot access logs

## License

[MIT License](LICENSE)

## Contributing

Issues and Pull Requests are welcome to help improve this project.
