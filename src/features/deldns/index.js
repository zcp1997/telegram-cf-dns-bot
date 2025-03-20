const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { command, createDelDnsReply } = require('./utils');
const { setupCallbacks } = require('./callbacks');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_DELETE,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }

      let message = '请选择要删除记录的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_del_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_deldns' }]);

      await createDelDnsReply(ctx)(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });
  
  setupCallbacks(bot);
}

module.exports = { setup, command };