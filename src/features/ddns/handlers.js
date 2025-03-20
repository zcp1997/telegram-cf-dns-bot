const { trackDDNSMessage, createDDNSTrackedReply, setupDDNS } = require('./utils');
const { SessionState } = require('../core/session');

// 处理DDNS的子域名输入
async function handleSubdomainForDDNS(ctx, session) {
  trackDDNSMessage(ctx);
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  session.domain = fullDomain;
  session.state = SessionState.WAITING_INTERVAL_FOR_DDNS;

  await createDDNSTrackedReply(ctx)(
    `请输入 ${session.domain} 的DDNS刷新间隔（秒）。\n或选择预设事件间隔：`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '60秒', callback_data: 'ddns_interval_60' },
            { text: '5分钟', callback_data: 'ddns_interval_300' },
            { text: '10分钟', callback_data: 'ddns_interval_600' }
          ],
          [
            { text: '取消操作', callback_data: 'cancel_ddns' }
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
      await ctx.reply('请输入有效的间隔时间，最小为10秒。');
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