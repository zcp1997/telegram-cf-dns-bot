const { command } = require('./utils');
const { setupCallbacks, showDateList, showDomainSearchResults } = require('./callbacks');
const { t } = require('../../i18n');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    try {
      const input = ctx.message.text.replace(/^\/dnschangelogs(@\w+)?\s*/i, '').trim();
      if (input) {
        await showDomainSearchResults(ctx, input, 0, { reply: true });
        return;
      }

      await showDateList(ctx, 0, { reply: true });
    } catch (error) {
      console.error('处理dnschangelogs命令失败:', error);
      await ctx.reply(t('dnsLogs.fetchFailed'));
    }
  });

  // 注册回调处理
  setupCallbacks(bot);
}

module.exports = {
  setup,
  command
};
