const { trackDDNSMessage, createDDNSTrackedReply, setupDDNS } = require('./utils');
const { SessionState } = require('../core/session');
const { t } = require('../../i18n');

// 处理DDNS的子域名输入
async function handleSubdomainForDDNS(ctx, session) {
  trackDDNSMessage(ctx);
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  session.domain = fullDomain;
  session.state = SessionState.WAITING_INTERVAL_FOR_DDNS;

  await createDDNSTrackedReply(ctx)(
    t('ddns.intervalPrompt', { domain: session.domain }),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t('ddns.interval60'), callback_data: 'ddns_interval_60' },
            { text: t('ddns.interval300'), callback_data: 'ddns_interval_300' },
            { text: t('ddns.interval600'), callback_data: 'ddns_interval_600' }
          ],
          [
            { text: t('common.cancelOperation'), callback_data: 'cancel_ddns' }
          ]
        ]
      }
    }
  );
}

// 处理DDNS的间隔输入
async function handleIntervalForDDNS(ctx, session) {
  trackDDNSMessage(ctx);
  const intervalText = ctx.message.text.trim();
  let interval = 60; // 默认60秒

  if (intervalText !== '') {
    const parsedInterval = parseInt(intervalText);
    if (isNaN(parsedInterval) || parsedInterval < 10) {
      await ctx.reply(t('ddns.invalidInterval'));
      return;
    }
    interval = parsedInterval;
  }

  await setupDDNS(ctx, session, interval);
}

module.exports = {
  handleSubdomainForDDNS, 
  handleIntervalForDDNS
};
