const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { command, commandAll, createGetDnsReply, displayDomainsPage } = require('./utils');
const { setupCallbacks } = require('./callbacks');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_QUERY,
      lastUpdate: Date.now(),
      currentPage: 0,
      searchKeyword: ''
    });

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0, 'query');
    } catch (error) {
      await createGetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }
  });

  bot.command(commandAll.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_ALL_DNS,
      lastUpdate: Date.now(),
      currentPage: 0,
      searchKeyword: ''
    });

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0, 'all');
    } catch (error) {
      await createGetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }
  });

  setupCallbacks(bot);
}

module.exports = { setup, command, commandAll };