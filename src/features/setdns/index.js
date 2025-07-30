const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { command, displayDomainsPage } = require('./utils');
const { setupCallbacks } = require('./callbacks');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_SET,
      lastUpdate: Date.now(),
      currentPage: 0,
      searchKeyword: ''
    });

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0);
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });
  
  setupCallbacks(bot);
}

module.exports = { setup, command };