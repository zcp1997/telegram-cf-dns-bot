require('dotenv').config();

// Telegram Bot配置
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'your_telegram_token_here';

// Cloudflare API配置
const CF_API_TOKEN = process.env.CF_API_TOKEN || 'your_api_token_here';
const CF_API_BASE = 'https://api.cloudflare.com/client/v4/zones';

// 域名到Zone ID的映射配置
let DOMAIN_ZONE_MAP = {};
try {
  DOMAIN_ZONE_MAP = JSON.parse(process.env.DOMAIN_ZONE_MAP || '{}');
  console.log('DOMAIN_ZONE_MAP loaded:', DOMAIN_ZONE_MAP);
} catch (error) {
  console.error('解析DOMAIN_ZONE_MAP环境变量失败:', error.message);
}

// 用户白名单配置
const ALLOWED_CHAT_IDS = (process.env.ALLOWED_CHAT_IDS || '').split(',').map(id => id.trim());

// 会话超时时间
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟

// 轮询检查时间
const CHECK_INTERVAL = 60 * 60 * 1000;  // 60分钟

module.exports = {
  TELEGRAM_TOKEN,
  CF_API_TOKEN,
  CF_API_BASE,
  DOMAIN_ZONE_MAP,
  ALLOWED_CHAT_IDS,
  SESSION_TIMEOUT,
  CHECK_INTERVAL
};
