
const { userSessions, SessionState } = require('../core/session');
const { trackDDNSMessage, createDDNSTrackedReply, deleteDDNSProcessMessages, setupDDNS } = require('./utils');
const { stopDDNS, getAllDDNSTasks } = require('../../services/ddns');
const { t } = require('../../i18n');

function setupCallbacks(bot) {

  // 处理DDNS域名选择
  bot.action(/^select_domain_ddns_(.+)$/, async (ctx) => {
    trackDDNSMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DDNS) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_FOR_DDNS;

    await ctx.answerCbQuery();
    await createDDNSTrackedReply(ctx)(
      t('ddns.domainSelected', { domain: rootDomain }),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('ddns.setRootDomain'), callback_data: 'set_root_domain_ddns' },
            { text: t('common.cancelOperation'), callback_data: 'cancel_ddns' }
          ]]
        }
      }
    );
  });

  // 处理设置根域名DDNS
  bot.action('set_root_domain_ddns', async (ctx) => {
    trackDDNSMessage(ctx);

    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_SUBDOMAIN_FOR_DDNS) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 直接使用根域名
    session.domain = session.rootDomain;
    session.state = SessionState.WAITING_INTERVAL_FOR_DDNS;

    await ctx.answerCbQuery();
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
  });

  // 处理DDNS间隔选择
  bot.action(/^ddns_interval_(\d+)$/, async (ctx) => {
    trackDDNSMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_INTERVAL_FOR_DDNS) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const interval = parseInt(ctx.match[1]);
    await setupDDNS(ctx, session, interval);
  });

  // 取消DDNS设置
  bot.action('cancel_ddns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText(t('ddns.cancelSetup'));
    
    // 获取当前回调消息的ID，以便在删除时排除它
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    // 删除其他相关消息，但排除当前消息
    await deleteDDNSProcessMessages(ctx, currentMessageId);
    
    userSessions.delete(chatId);
  });

  // 取消停止DDNS
  bot.action('cancel_stop_ddns', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(t('ddns.cancelStop'));
    await deleteDDNSProcessMessages(ctx, ctx.callbackQuery.message.message_id);
  });

  // 停止特定DDNS任务
  bot.action(/^stop_ddns_(.+)$/, async (ctx) => {
    const domain = ctx.match[1];
    const result = stopDDNS(domain);

    await ctx.answerCbQuery();
    if (result) {
      await ctx.editMessageText(t('ddns.stoppedTask', { domain }));
    } else {
      await ctx.editMessageText(t('ddns.taskNotFound', { domain }));
    }

    await deleteDDNSProcessMessages(ctx, ctx.callbackQuery.message.message_id);
  });

  // 停止所有DDNS任务
  bot.action('stop_all_ddns', async (ctx) => {
    const tasks = getAllDDNSTasks();
    let stoppedCount = 0;

    for (const task of tasks) {
      if (stopDDNS(task.domain)) {
        stoppedCount++;
      }
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(t('ddns.stoppedAllTasks', { count: stoppedCount }));
    await deleteDDNSProcessMessages(ctx, ctx.callbackQuery.message.message_id);
  });

}

module.exports = { setupCallbacks };
