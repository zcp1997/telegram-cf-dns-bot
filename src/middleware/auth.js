const { ALLOWED_CHAT_IDS, CHECK_INTERVAL } = require('../config');
const { validateCloudflareConfig } = require('../services/validation');

let lastCheckTime = 0;

const checkAccess = async (ctx, next) => {
  const chatId = ctx.chat.id.toString();
  console.log(`用户 ${chatId} 访问bot`);

  if (!ALLOWED_CHAT_IDS.includes(chatId)) {
    ctx.reply('您没有权限使用此机器人。');
    console.log(`拒绝用户 ${chatId} 的访问请求`);
    return null;
  }
  return next();
};

const checkAccessWithCache = async (ctx, next) => {
  const now = Date.now();
  const chatId = ctx.chat.id.toString();
  
  if (now - lastCheckTime > CHECK_INTERVAL) {
    const cfValidation = await validateCloudflareConfig();
    if (!cfValidation.success) {
      console.error(`定期配置检查失败: ${cfValidation.message}`);
      if (chatId === ALLOWED_CHAT_IDS[0]) {
        await ctx.reply(
          '⚠️ Bot 配置错误\n\n' +
          `错误详情：${cfValidation.message}\n\n` +
          '请检查以下配置：\n' +
          '1. CF_API_TOKEN 是否正确\n' +
          '2. Cloudflare API 是否可访问'
        );
      } else {
        await ctx.reply('Bot 配置有误，请联系管理员。');
      }
    }
    lastCheckTime = now;
  }
  return checkAccess(ctx, next);
};

module.exports = {
  checkAccess,
  checkAccessWithCache
};
