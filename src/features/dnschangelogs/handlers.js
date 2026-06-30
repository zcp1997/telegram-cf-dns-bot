const { trackDnsLogsMessage } = require('./utils');
const { showDomainSearchResults } = require('./callbacks');
const { t } = require('../../i18n');

async function handleDnsLogsSearchKeywordInput(ctx) {
  trackDnsLogsMessage(ctx);

  const keyword = ctx.message.text.trim();
  if (!keyword) {
    await ctx.reply(t('dnsLogs.emptyKeyword'));
    return;
  }

  await showDomainSearchResults(ctx, keyword, 0, { reply: true });
}

module.exports = {
  handleDnsLogsSearchKeywordInput,
};
