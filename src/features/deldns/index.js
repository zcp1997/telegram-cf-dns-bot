const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { command, displayDomainsPage } = require('./utils');
const { setupCallbacks } = require('./callbacks');
const { t } = require('../../i18n');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_DELETE,
      lastUpdate: Date.now(),
      currentPage: 0,
      searchKeyword: ''
    });

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0);
    } catch (error) {
      ctx.reply(t('deldns.fetchDomainsFailed', { message: error.message }));
    }
  });
  
  setupCallbacks(bot);
}

module.exports = { setup, command };
