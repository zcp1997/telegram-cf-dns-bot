const { userSessions, SessionState } = require('../core/session');
const { deleteDnsRecord, getDnsRecord } = require('../../services/cloudflare');
const { trackDelDnsMessage, createDelDnsReply, deleteDelDnsProcessMessages, displayDomainsPage } = require('./utils');
const { getConfiguredDomains } = require('../../utils/domain');

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
      `请输入要删除DNS记录的具体域名，或直接发送 "." 删除根域名。\n\n` +
      `支持的记录类型: 4️⃣A 6️⃣AAAA 🔗CNAME 📄TXT\n\n` +
      `示例：\n` +
      `• 输入 "www" → 删除 www.${rootDomain}\n` +
      `• 输入 "api" → 删除 api.${rootDomain}\n` +
      `• 输入 "." → 删除 ${rootDomain}`,
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

  // 域名列表分页导航 - 上一页
  bot.action('domains_prev_page_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    if (session.currentPage > 0) {
      session.currentPage--;
      session.lastUpdate = Date.now();
      
      try {
        const domains = await getConfiguredDomains();
        await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
      } catch (error) {
        await createDelDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
      }
    }

    await ctx.answerCbQuery();
  });

  // 域名列表分页导航 - 下一页
  bot.action('domains_next_page_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    try {
      const domains = await getConfiguredDomains();
      const { DOMAINS_PAGE_SIZE } = require('../../config');
      const totalPages = Math.ceil(domains.length / DOMAINS_PAGE_SIZE);
      
      if (session.currentPage < totalPages - 1) {
        session.currentPage++;
        session.lastUpdate = Date.now();
        
        await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
      }
    } catch (error) {
      await createDelDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }

    await ctx.answerCbQuery();
  });

  // 域名列表页码信息
  bot.action('domains_page_info_del', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (session) {
      try {
        const domains = await getConfiguredDomains();
        const { DOMAINS_PAGE_SIZE } = require('../../config');
        const totalPages = Math.ceil(domains.length / DOMAINS_PAGE_SIZE);
        await ctx.answerCbQuery(`第 ${session.currentPage + 1} 页，共 ${totalPages} 页`);
      } catch (error) {
        await ctx.answerCbQuery('页码信息');
      }
    } else {
      await ctx.answerCbQuery('会话已过期');
    }
  });

  // 搜索域名功能
  bot.action('search_domains_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 更新会话状态
    session.state = SessionState.WAITING_SEARCH_KEYWORD_FOR_DELETE;
    session.lastUpdate = Date.now();

    await ctx.answerCbQuery();
    await createDelDnsReply(ctx)(
      '🔍 请输入域名搜索关键字：\n\n' +
      '可以搜索域名中的任何部分，支持删除以下记录类型：\n' +
      '4️⃣ A记录 (IPv4)\n' +
      '6️⃣ AAAA记录 (IPv6)\n' +
      '🔗 CNAME记录 (域名别名)\n' +
      '📄 TXT记录 (文本记录)\n\n' +
      '搜索示例：\n' +
      '• 输入 "test" → 找到 test.example.com\n' +
      '• 输入 "mail" → 找到 mail.mydomain.org\n' +
      '• 输入 ".net" → 找到所有 .net 域名',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '取消搜索', callback_data: 'cancel_search_domains_del' }
          ]]
        }
      }
    );
  });

  // 显示全部域名功能
  bot.action('show_all_domains_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || (session.state !== SessionState.WAITING_SEARCH_KEYWORD_FOR_DELETE && 
                    session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE)) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 重置搜索关键字和页码
    session.searchKeyword = '';
    session.currentPage = 0;
    session.state = SessionState.SELECTING_DOMAIN_FOR_DELETE;
    session.lastUpdate = Date.now();

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0);
    } catch (error) {
      await createDelDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }

    await ctx.answerCbQuery();
  });

  // 取消搜索域名功能
  bot.action('cancel_search_domains_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 回到域名选择状态
    session.state = SessionState.SELECTING_DOMAIN_FOR_DELETE;
    session.lastUpdate = Date.now();
    
    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
    } catch (error) {
      await createDelDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }

    await ctx.answerCbQuery();
  });

}

module.exports = { setupCallbacks };