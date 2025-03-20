const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { command, commandAll, trackGetDnsMessage, createGetDnsReply } = require('./utils');
const { setupCallbacks } = require('./callbacks');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_QUERY,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        await createGetDnsReply(ctx)('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }

      let message = '请选择要查询的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_query_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_getdns' }]);

      await createGetDnsReply(ctx)(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      await createGetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }
  });

  bot.command(commandAll.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_ALL_DNS,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }

      let message = '请选择要查询的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_all_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_getdns' }]);

      await createGetDnsReply(ctx)(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      await createGetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }
  });

  setupCallbacks(bot);
}

module.exports = { setup, command, commandAll };