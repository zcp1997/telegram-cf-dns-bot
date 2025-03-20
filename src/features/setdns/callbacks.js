const { userSessions, SessionState } = require('../core/session');
const { createOrUpdateDns } = require('../../services/cloudflare');
const { trackSetDnsMessage, createSetDnsReply, deleteSetDnsProcessMessages } = require('./utils');

function setupCallbacks(bot) {
  
  // 取消操作的回调
  bot.action('cancel_setdns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText('已取消DNS记录设置操作。');
    
    // 获取当前回调消息的ID，以便在删除时排除它
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    // 删除其他相关消息，但排除当前消息
    await deleteSetDnsProcessMessages(ctx, currentMessageId);
    
    userSessions.delete(chatId);
  });

  // 代理设置的回调
  bot.action('proxy_yes', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_PROXY) {
      return;
    }

    await ctx.editMessageText(
      `正在处理: ${session.domain} -> ${session.ipAddress} ` +
      `(类型: ${session.recordType}, 已启用代理)`
    );

    try {
      const result = await createOrUpdateDns(
        session.domain,
        session.ipAddress,
        session.recordType,
        true
      );
      // 先发送成功消息
      await ctx.reply(result.message);

      // 然后删除之前的所有消息
      await deleteSetDnsProcessMessages(ctx, ctx.callbackQuery.message.message_id);
    } catch (error) {
      await ctx.reply(`处理过程中发生错误: ${error.message}`);
    }

    userSessions.delete(chatId);
  });

  bot.action('proxy_no', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_PROXY) {
      return;
    }

    await ctx.editMessageText(
      `正在处理: ${session.domain} -> ${session.ipAddress} ` +
      `(类型: ${session.recordType}, 未启用代理)`
    );

    try {
      const result = await createOrUpdateDns(
        session.domain,
        session.ipAddress,
        session.recordType,
        false
      );
      await ctx.reply(result.message);

      await deleteSetDnsProcessMessages(ctx, ctx.callbackQuery.message.message_id);
    } catch (error) {
      await ctx.reply(`处理过程中发生错误: ${error.message}`);
    }

    userSessions.delete(chatId);
  });

  // 处理设置DNS的域名选择
  bot.action(/^select_domain_set_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_SET) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_FOR_SET;

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      `已选择域名: ${rootDomain}\n\n` +
      `请输入子域名前缀（如：www），或直接发送 "." 设置根域名。\n\n` +
      `例如：输入 "www" 将设置 www.${rootDomain}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '设置根域名', callback_data: 'set_root_domain' },
            { text: '取消操作', callback_data: 'cancel_setdns' }
          ]]
        }
      }
    );
  });

  // 处理设置根域名的回调
  bot.action('set_root_domain', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_SUBDOMAIN_FOR_SET) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 直接使用根域名
    session.domain = session.rootDomain;
    session.state = SessionState.WAITING_IP;

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      `请输入 ${session.domain} 的IP地址。\n` +
      '支持IPv4（例如：192.168.1.1）\n' +
      '或IPv6（例如：2001:db8::1）',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '取消操作', callback_data: 'cancel_setdns' }
          ]]
        }
      }
    );
  });

}

module.exports = { setupCallbacks };