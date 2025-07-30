const { userSessions, SessionState } = require('../core/session');
const { createOrUpdateDns } = require('../../services/cloudflare');
const { trackSetDnsMessage, createSetDnsReply, deleteSetDnsProcessMessages, displayDomainsPage } = require('./utils');
const { executeSetDns } = require('./handlers');
const { getConfiguredDomains } = require('../../utils/domain');

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
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.proxied = true;
    await ctx.answerCbQuery();
    await executeSetDns(ctx, session);
  });

  bot.action('proxy_no', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_PROXY) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.proxied = false;
    await ctx.answerCbQuery();
    await executeSetDns(ctx, session);
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
      `请输入要设置DNS记录的具体域名，或直接发送 "." 设置根域名。\n\n` +
      `支持的记录类型: 4️⃣A 6️⃣AAAA 🔗CNAME 📄TXT\n\n` +
      `示例：\n` +
      `• 输入 "www" → 设置 www.${rootDomain}\n` +
      `• 输入 "api" → 设置 api.${rootDomain}\n` +
      `• 输入 "." → 设置 ${rootDomain}`,
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
    session.state = SessionState.SELECTING_RECORD_TYPE_FOR_SET;

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      `📋 请选择要为 ${session.rootDomain} 设置的DNS记录类型：\n\n` +
      `4️⃣ A记录 - IPv4地址（如：192.168.1.1）\n` +
      `6️⃣ AAAA记录 - IPv6地址（如：2001:db8::1）\n` +
      `🔗 CNAME记录 - 域名别名（如：example.com）\n` +
      `📄 TXT记录 - 文本记录（如：验证码、SPF等）`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '4️⃣ A记录 (IPv4)', callback_data: 'select_record_type_A' },
              { text: '6️⃣ AAAA记录 (IPv6)', callback_data: 'select_record_type_AAAA' }
            ],
            [
              { text: '🔗 CNAME记录', callback_data: 'select_record_type_CNAME' },
              { text: '📄 TXT记录', callback_data: 'select_record_type_TXT' }
            ],
            [
              { text: '取消操作', callback_data: 'cancel_setdns' }
            ]
          ]
        }
      }
    );
  });

  // 处理记录类型选择
  bot.action(/^select_record_type_(A|AAAA|CNAME|TXT)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    const recordType = ctx.match[1];

    if (!session || session.state !== SessionState.SELECTING_RECORD_TYPE_FOR_SET) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.recordType = recordType;
    session.state = SessionState.WAITING_RECORD_CONTENT;

    let promptMessage = '';
    let examples = '';
    
    if (recordType === 'A') {
      promptMessage = `请输入 ${session.domain} 的IPv4地址：`;
      examples = `例如：192.168.1.1 或 8.8.8.8`;
    } else if (recordType === 'AAAA') {
      promptMessage = `请输入 ${session.domain} 的IPv6地址：`;
      examples = `例如：2001:db8::1 或 2001:4860:4860::8888`;
    } else if (recordType === 'CNAME') {
      promptMessage = `请输入 ${session.domain} 的目标域名：`;
      examples = `例如：example.com 或 www.google.com`;
    } else if (recordType === 'TXT') {
      promptMessage = `请输入 ${session.domain} 的TXT记录内容：`;
      examples = `例如：v=spf1 include:_spf.google.com ~all\n或：google-site-verification=xxxxxx`;
    }

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      `📝 ${promptMessage}\n\n${examples}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '取消操作', callback_data: 'cancel_setdns' }
          ]]
        }
      }
    );
  });

  // 域名列表分页导航 - 上一页
  bot.action('domains_prev_page_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_SET) {
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
        await createSetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
      }
    }

    await ctx.answerCbQuery();
  });

  // 域名列表分页导航 - 下一页
  bot.action('domains_next_page_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_SET) {
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
      await createSetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }

    await ctx.answerCbQuery();
  });

  // 域名列表页码信息
  bot.action('domains_page_info_set', async (ctx) => {
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
  bot.action('search_domains_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_SET) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 更新会话状态
    session.state = SessionState.WAITING_SEARCH_KEYWORD_FOR_SET;
    session.lastUpdate = Date.now();

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      '🔍 请输入域名搜索关键字：\n\n' +
      '可以搜索域名中的任何部分，支持设置以下记录类型：\n' +
      '4️⃣ A记录 (IPv4)\n' +
      '6️⃣ AAAA记录 (IPv6)\n' +
      '🔗 CNAME记录 (域名别名)\n' +
      '📄 TXT记录 (文本记录)\n\n' +
      '搜索示例：\n' +
      '• 输入 "blog" → 找到 blog.example.com\n' +
      '• 输入 "api" → 找到 api.mydomain.org\n' +
      '• 输入 ".com" → 找到所有 .com 域名',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '取消搜索', callback_data: 'cancel_search_domains_set' }
          ]]
        }
      }
    );
  });

  // 显示全部域名功能
  bot.action('show_all_domains_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || (session.state !== SessionState.WAITING_SEARCH_KEYWORD_FOR_SET && 
                    session.state !== SessionState.SELECTING_DOMAIN_FOR_SET)) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 重置搜索关键字和页码
    session.searchKeyword = '';
    session.currentPage = 0;
    session.state = SessionState.SELECTING_DOMAIN_FOR_SET;
    session.lastUpdate = Date.now();

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0);
    } catch (error) {
      await createSetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }

    await ctx.answerCbQuery();
  });

  // 取消搜索域名功能
  bot.action('cancel_search_domains_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 回到域名选择状态
    session.state = SessionState.SELECTING_DOMAIN_FOR_SET;
    session.lastUpdate = Date.now();
    
    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
    } catch (error) {
      await createSetDnsReply(ctx)(`获取域名列表失败: ${error.message}`);
    }

    await ctx.answerCbQuery();
  });

}

module.exports = { setupCallbacks };