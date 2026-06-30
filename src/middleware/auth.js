const { ALLOWED_CHAT_IDS, CHECK_INTERVAL } = require('../config');
const { validateCloudflareConfig } = require('../services/validation');
const { t } = require('../i18n');

let lastCheckTime = 0;

const checkAccess = async (ctx, next) => {
  const chatId = ctx.chat.id.toString();
  console.log(`User ${chatId} accessed bot`);

  if (!ALLOWED_CHAT_IDS.includes(chatId)) {
    ctx.reply(t('auth.unauthorized'));
    console.log(`Rejected access request from user ${chatId}`);
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
      console.error(`Configuration check failed: ${cfValidation.message}`);
      if (chatId === ALLOWED_CHAT_IDS[0]) {
        await ctx.reply(t('auth.configErrorAdmin', { message: cfValidation.message }));
      } else {
        await ctx.reply(t('auth.configErrorUser'));
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
