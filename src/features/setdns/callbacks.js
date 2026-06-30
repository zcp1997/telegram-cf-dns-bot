const { userSessions, SessionState } = require('../core/session');
const { createOrUpdateDns } = require('../../services/cloudflare');
const { trackSetDnsMessage, createSetDnsReply, deleteSetDnsProcessMessages, displayDomainsPage } = require('./utils');
const { executeSetDns } = require('./handlers');
const { getConfiguredDomains } = require('../../utils/domain');
const { t } = require('../../i18n');

function getRecordTypeKeyboard() {
  return [
    [
      { text: t('setdns.recordType.a'), callback_data: 'select_record_type_A' },
      { text: t('setdns.recordType.aaaa'), callback_data: 'select_record_type_AAAA' }
    ],
    [
      { text: t('setdns.recordType.cname'), callback_data: 'select_record_type_CNAME' },
      { text: t('setdns.recordType.txt'), callback_data: 'select_record_type_TXT' }
    ],
    [
      { text: t('common.cancelOperation'), callback_data: 'cancel_setdns' }
    ]
  ];
}

function setupCallbacks(bot) {
  
  // 取消操作的回调
  bot.action('cancel_setdns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText(t('setdns.cancelled'));
    
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_FOR_SET;

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      t('setdns.domainSelected', { domain: rootDomain }),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('setdns.setRootDomain'), callback_data: 'set_root_domain' },
            { text: t('common.cancelOperation'), callback_data: 'cancel_setdns' }
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 直接使用根域名
    session.domain = session.rootDomain;
    session.state = SessionState.SELECTING_RECORD_TYPE_FOR_SET;

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      t('setdns.selectRecordType', { domain: session.rootDomain }),
      {
        reply_markup: {
          inline_keyboard: getRecordTypeKeyboard()
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    session.recordType = recordType;
    session.state = SessionState.WAITING_RECORD_CONTENT;

    const promptKey = `setdns.prompt.${recordType.toLowerCase()}`;
    const exampleKey = `setdns.example.${recordType.toLowerCase()}`;

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      t('setdns.contentPrompt', {
        prompt: t(promptKey, { domain: session.domain }),
        examples: t(exampleKey)
      }),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('common.cancelOperation'), callback_data: 'cancel_setdns' }
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    if (session.currentPage > 0) {
      session.currentPage--;
      session.lastUpdate = Date.now();
      
      try {
        const domains = await getConfiguredDomains();
        await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
      } catch (error) {
        await createSetDnsReply(ctx)(t('setdns.fetchDomainsFailed', { message: error.message }));
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
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
      await createSetDnsReply(ctx)(t('setdns.fetchDomainsFailed', { message: error.message }));
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
        await ctx.answerCbQuery(t('setdns.pageInfoCallback', {
          page: session.currentPage + 1,
          totalPages
        }));
      } catch (error) {
        await ctx.answerCbQuery(t('setdns.pageInfoFallback'));
      }
    } else {
      await ctx.answerCbQuery(t('common.sessionExpired'));
    }
  });

  // 搜索域名功能
  bot.action('search_domains_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_SET) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 更新会话状态
    session.state = SessionState.WAITING_SEARCH_KEYWORD_FOR_SET;
    session.lastUpdate = Date.now();

    await ctx.answerCbQuery();
    await createSetDnsReply(ctx)(
      t('setdns.searchPrompt'),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('setdns.cancelSearch'), callback_data: 'cancel_search_domains_set' }
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
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
      await createSetDnsReply(ctx)(t('setdns.fetchDomainsFailed', { message: error.message }));
    }

    await ctx.answerCbQuery();
  });

  // 取消搜索域名功能
  bot.action('cancel_search_domains_set', async (ctx) => {
    trackSetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 回到域名选择状态
    session.state = SessionState.SELECTING_DOMAIN_FOR_SET;
    session.lastUpdate = Date.now();
    
    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
    } catch (error) {
      await createSetDnsReply(ctx)(t('setdns.fetchDomainsFailed', { message: error.message }));
    }

    await ctx.answerCbQuery();
  });

}

module.exports = { setupCallbacks };
