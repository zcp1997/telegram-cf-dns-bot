const { userSessions, SessionState } = require('../core/session');
const { deleteDnsRecord, getDnsRecord } = require('../../services/cloudflare');
const { trackDelDnsMessage, createDelDnsReply, deleteDelDnsProcessMessages } = require('./utils');

function setupCallbacks(bot) {

  // 处理删除DNS的域名选择
  bot.action(/^select_domain_del_(.+)$/, async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_FOR_DELETE;

    await ctx.answerCbQuery();
    await createDelDnsReply(ctx)(
      `已选择域名: ${rootDomain}\n\n` +
      `请输入子域名前缀（如：www），或直接发送 "." 删除根域名。\n\n` +
      `例如：输入 "www" 将删除 www.${rootDomain}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '删除根域名', callback_data: 'del_root_domain' },
            { text: '取消操作', callback_data: 'cancel_deldns' }
          ]]
        }
      }
    );
  });

  bot.action('del_root_domain', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_SUBDOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    try {
      const { records } = await getDnsRecord(session.rootDomain);
      if (!records || records.length === 0) {
        await ctx.answerCbQuery();
        await createDelDnsReply(ctx)(
          `未找到 ${session.rootDomain} 的DNS记录`
        );
        userSessions.delete(chatId);
        return;
      }

      session.domain = session.rootDomain;
      session.state = SessionState.WAITING_CONFIRM_DELETE;

      const recordsInfo = records.map(record =>
        `类型: ${record.type}\n内容: ${record.content}`
      ).join('\n\n');

      await ctx.answerCbQuery();
      await createDelDnsReply(ctx)(
        `找到以下DNS记录：\n\n${recordsInfo}\n\n确定要删除这些记录吗？`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '确认删除', callback_data: 'confirm_delete' },
                { text: '取消', callback_data: 'cancel_delete' }
              ]
            ]
          }
        }
      );
    } catch (error) {
      await ctx.answerCbQuery();
      await ctx.reply(`查询DNS记录时发生错误: ${error.message}`);
      userSessions.delete(chatId);
    }
  });

  // 确认删除的回调
  bot.action('confirm_delete', async (ctx) => {
    trackDelDnsMessage(ctx);
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
      deleteDelDnsProcessMessages(ctx);
    } catch (error) {
      await ctx.reply(`删除过程中发生错误: ${error.message}`);
    }

    userSessions.delete(chatId);
  });

  bot.action('cancel_deldns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText('已取消DNS记录删除操作。');
    
    // 获取当前回调消息的ID，以便在删除时排除它
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    // 删除其他相关消息，但排除当前消息
    await deleteDelDnsProcessMessages(ctx, currentMessageId);
    
    userSessions.delete(chatId);
  });
}

module.exports = { setupCallbacks };