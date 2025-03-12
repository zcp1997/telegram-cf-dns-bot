const { userSessions, SessionState } = require('../utils/session');
const { createOrUpdateDns, deleteDnsRecord } = require('../services/cloudflare');
const { displayDnsRecordsPage } = require('./messages');

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

  bot.action('dns_prev_page', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.VIEWING_DNS_RECORDS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    if (session.currentPage > 0) {
      session.currentPage--;
      await ctx.deleteMessage();
      await displayDnsRecordsPage(ctx, session);
    }
    
    await ctx.answerCbQuery();
  });

  bot.action('dns_next_page', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.VIEWING_DNS_RECORDS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    if (session.currentPage < session.totalPages - 1) {
      session.currentPage++;
      await ctx.deleteMessage();
      await displayDnsRecordsPage(ctx, session);
    }
    
    await ctx.answerCbQuery();
  });

  bot.action('dns_page_info', async (ctx) => {
    await ctx.answerCbQuery(`第 ${session.currentPage + 1} 页，共 ${session.totalPages} 页`);
  });

  bot.action('dns_done', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    await ctx.answerCbQuery('查询完成');
    await ctx.reply('DNS记录查询已完成');
  });
}

module.exports = { setupCallbacks };
