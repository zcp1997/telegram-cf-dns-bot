
const { userSessions, SessionState } = require('../core/session');
const { trackDDNSMessage, createDDNSTrackedReply, deleteDDNSProcessMessages, setupDDNS } = require('./utils');
const { stopDDNS, getAllDDNSTasks } = require('../../services/ddns');

function setupCallbacks(bot) {

  // 处理DDNS域名选择
  bot.action(/^select_domain_ddns_(.+)$/, async (ctx) => {
    trackDDNSMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DDNS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_FOR_DDNS;

    await ctx.answerCbQuery();
    await createDDNSTrackedReply(ctx)(
      `已选择域名: ${rootDomain}\n\n` +
      `请输入子域名前缀（如：www），或直接发送 "." 设置根域名。\n\n` +
      `例如：输入 "www" 将设置 www.${rootDomain}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '设置根域名', callback_data: 'set_root_domain_ddns' },
            { text: '取消操作', callback_data: 'cancel_ddns' }
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
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 直接使用根域名
    session.domain = session.rootDomain;
    session.state = SessionState.WAITING_INTERVAL_FOR_DDNS;

    await ctx.answerCbQuery();
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
  });

  // 处理DDNS间隔选择
  bot.action(/^ddns_interval_(\d+)$/, async (ctx) => {
    trackDDNSMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_INTERVAL_FOR_DDNS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const interval = parseInt(ctx.match[1]);
    await setupDDNS(ctx, session, interval);
  });

  // 取消DDNS设置
  bot.action('cancel_ddns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText('已取消DDNS设置操作。');
    
    // 获取当前回调消息的ID，以便在删除时排除它
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    // 删除其他相关消息，但排除当前消息
    await deleteDDNSProcessMessages(ctx, currentMessageId);
    
    userSessions.delete(chatId);
  });

  // 取消停止DDNS
  bot.action('cancel_stop_ddns', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('已取消停止DDNS操作。');
    await deleteDDNSProcessMessages(ctx, ctx.callbackQuery.message.message_id);
  });

  // 停止特定DDNS任务
  bot.action(/^stop_ddns_(.+)$/, async (ctx) => {
    const domain = ctx.match[1];
    const result = stopDDNS(domain);

    await ctx.answerCbQuery();
    if (result) {
      await ctx.editMessageText(`已停止 ${domain} 的DDNS任务。`);
    } else {
      await ctx.editMessageText(`未找到 ${domain} 的DDNS任务。`);
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
    await ctx.editMessageText(`已停止所有DDNS任务，共${stoppedCount}个。`);
    await deleteDDNSProcessMessages(ctx, ctx.callbackQuery.message.message_id);
  });

}

module.exports = { setupCallbacks };