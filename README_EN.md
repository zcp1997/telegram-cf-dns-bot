# Cloudflare DNS Manager

A Telegram Bot-based interactive Cloudflare DNS record management tool, supporting multi-domain management for easily adding, updating, deleting, and querying DNS records.

## Features

- 🔒 User whitelist control
- 🌐 Multi-domain management
- 📝 CRUD operations for DNS records
- 🔄 DDNS (Dynamic DNS) automatic IP updates
- 🐳 Docker containerized deployment
- 🤖 Telegram Bot interactive interface

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Telegram Bot Token (get from [@BotFather](https://t.me/BotFather))
- Cloudflare API Token (get from Cloudflare dashboard)

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
      # Allowed Telegram User IDs (comma-separated), first user is admin
      - ALLOWED_CHAT_IDS=123456789,987654321
      # DNS Optional Paramter: Excluded domains list (comma-separated)
      # - EXCLUDE_DOMAINS=example.com,example.org
      # DDNS Optional Paramter: Is the bot deployed in mainland China (default is false)
      # - IN_CHINA=false
      # DDNS Optional Paramter：enable IPv6 DDNS update (default is false)
      # - ENABLE_IPV6_DDNS=false

    volumes:
      - ./config:/app/config 
      - ./logs:/app/logs   

    # ipv6 configuration
    # networks:
      #- ipv6_network  

# networks:
#   ipv6_network:
#     driver: bridge
#     enable_ipv6: true
#     ipam:
#       config:
#         - subnet: 2001:db8:2::/64
#           gateway: 2001:db8:2::1
```

2. Edit the `docker-compose.yml` file with your configuration:

   - Replace `your_telegram_token_here` with your Telegram Bot Token
   - Replace `your_api_token_here` with your Cloudflare API Token
   - Replace the user IDs in `ALLOWED_CHAT_IDS` with your allowed users

3. Start the service:
```bash
docker compose up -d
```

4. View logs:
```bash
docker compose logs -f
```

### Method 2: Manual Build and Deployment
If you want to build the image yourself or modify the code, follow these steps:

1. Clone the repository:
```bash
git clone https://github.com/zcp1997/telegram-cf-dns-bot.git
cd telegram-cf-dns-bot
```

2. Fill in your configuration details:
   
   - Replace `your_telegram_token_here` with your Telegram Bot Token
   - Replace `your_api_token_here` with your Cloudflare API Token
   - Replace the user IDs in `ALLOWED_CHAT_IDS` with your allowed users

3. Build and start with Docker Compose:
   
```bash
docker compose build
docker compose up -d
```

### Updating Deployment

Pull the latest image and restart the container:
```bash
docker compose pull
docker compose up -d
```

## Bot Command Usage

### Basic Commands

- `/start` - Start the bot and display welcome message with function menu
- `/help` - View detailed help information and usage guide
- `/domains` - List all manageable domains

### DNS Record Management

- `/setdns` - Add or update DNS records (supports A, AAAA, CNAME, TXT, etc.)
- `/getdns` - Query DNS records for a specific subdomain
- `/getdnsall` - Query all DNS records under a root domain
- `/deldns` - Delete specified DNS records
- `/dnschangelogs` - Query DNS change logs

### DDNS (Dynamic DNS) Functions

- `/ddns` - Set up automatic DDNS tasks (dynamic IP address updates)
- `/ddnsstatus` - View the status of all DDNS tasks
- `/stopddns` - Pause specified DDNS tasks
- `/delddns` - Delete specified DDNS tasks

### Admin Commands

- `/listusers` - Display current whitelist users (admin only)
- `/zonemap` - Display domain to Zone ID mapping (admin only)

## Configuration Details

### Cloudflare API Token Requirements

When creating an API Token, include these permissions:
- Zone - DNS - Edit
- Zone - Zone - Read

### Environment Variables

| Variable         | Description                        | Required | Example                                        |
| ---------------- | ---------------------------------- | -------- | ---------------------------------------------- |
| TELEGRAM_TOKEN   | Telegram Bot Token                 | Yes      | `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw` |
| CF_API_TOKEN     | Cloudflare API Token               | Yes      | `your-api-token-here`                          |
| ALLOWED_CHAT_IDS | Allowed user IDs (comma-separated) | Yes      | `123456789,987654321`                          |
| EXCLUDE_DOMAINS  | Excluded domains (comma-separated) | No       | `example.com,example.org`                      |
| IN_CHINA         | Whether deployed in mainland China | No       | `true` or `false` (default: `false`)           |
| ENABLE_IPV6_DDNS | enable IPv6 DDNS update | No | `true` or `false` (default: `false`) |

## Troubleshooting

1. If the bot doesn't respond:
   - Check if `TELEGRAM_TOKEN` is correct
   - View container logs with `docker compose logs -f`

2. If you can't manage DNS:
   - Confirm `CF_API_TOKEN` has the correct permissions

3. If you can't access the bot:
   - Confirm your Telegram user ID is in `ALLOWED_CHAT_IDS`
   - You can get your ID via [@userinfobot](https://t.me/userinfobot)

### Viewing Logs
```bash
# View real-time logs
docker compose logs -f

# View last 100 log lines
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
3. Regularly check bot access logs

## License

[MIT License](LICENSE)

## Contributing

Issues and Pull Requests are welcome to help improve this project.
