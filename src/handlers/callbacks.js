const { userSessions, SessionState } = require('../utils/session');
const { createOrUpdateDns, deleteDnsRecord } = require('../services/cloudflare');

function setupCallbacks(bot) {
  // 取消操作的回调
  bot.action('cancel_setdns', (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    ctx.editMessageText('已取消DNS记录设置操作。');
  });

  bot.action('cancel_getdns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    await ctx.editMessageText('已取消DNS记录查询操作。');
  });

  bot.action('cancel_deldns', (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    ctx.editMessageText('已取消DNS记录删除操作。');
  });

  bot.action('cancel_delete', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    await ctx.editMessageText('已取消删除操作。');
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
      await ctx.reply(result.message);
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
    } catch (error) {
      await ctx.reply(`处理过程中发生错误: ${error.message}`);
    }
    
    userSessions.delete(chatId);
  });

  // 确认删除的回调
  bot.action('confirm_delete', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.WAITING_CONFIRM_DELETE) {
      return;
    }
    
    const domainName = session.domain;
    await ctx.editMessageText(`正在删除 ${domainName} 的DNS记录...`);
    
    try {
      const result = await deleteDnsRecord(domainName);
      await ctx.reply(result.message);
    } catch (error) {
      await ctx.reply(`删除过程中发生错误: ${error.message}`);
    }
    
    userSessions.delete(chatId);
  });
}

module.exports = { setupCallbacks };
