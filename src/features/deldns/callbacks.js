const { userSessions, SessionState } = require('../core/session');
const { deleteDnsRecord, getDnsRecord } = require('../../services/cloudflare');
const { trackDelDnsMessage, createDelDnsReply, deleteDelDnsProcessMessages, displayDomainsPage } = require('./utils');
const { getConfiguredDomains } = require('../../utils/domain');
const { t } = require('../../i18n');

function formatRecordsInfo(records) {
  return records.map(record => t('deldns.recordInfo', {
    type: record.type,
    content: record.content
  })).join('\n\n');
}

function setupCallbacks(bot) {

  // 处理删除DNS的域名选择
  bot.action(/^select_domain_del_(.+)$/, async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_FOR_DELETE;

    await ctx.answerCbQuery();
    await createDelDnsReply(ctx)(
      t('deldns.domainSelected', { domain: rootDomain }),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('deldns.deleteRootDomain'), callback_data: 'del_root_domain' },
            { text: t('common.cancelOperation'), callback_data: 'cancel_deldns' }
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    try {
      const { records } = await getDnsRecord(session.rootDomain);
      if (!records || records.length === 0) {
        await ctx.answerCbQuery();
        await createDelDnsReply(ctx)(
          t('deldns.noRecords', { domain: session.rootDomain })
        );
        userSessions.delete(chatId);
        return;
      }

      session.domain = session.rootDomain;
      session.state = SessionState.WAITING_CONFIRM_DELETE;

      const recordsInfo = formatRecordsInfo(records);

      await ctx.answerCbQuery();
      await createDelDnsReply(ctx)(
        t('deldns.confirmRecords', { recordsInfo }),
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: t('deldns.confirmDelete'), callback_data: 'confirm_delete' },
                { text: t('common.cancel'), callback_data: 'cancel_deldns' }
              ]
            ]
          }
        }
      );
    } catch (error) {
      await ctx.answerCbQuery();
      await ctx.reply(t('deldns.queryError', { message: error.message }));
      userSessions.delete(chatId);
    }
  });

  // 确认删除的回调
  bot.action('confirm_delete', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_CONFIRM_DELETE) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const domainName = session.domain;
    await ctx.editMessageText(t('deldns.deleting', { domain: domainName }));

    try {
      const result = await deleteDnsRecord(domainName);
      await ctx.reply(result.message);
      await deleteDelDnsProcessMessages(ctx);
    } catch (error) {
      await ctx.reply(t('deldns.deleteError', { message: error.message }));
    }

    userSessions.delete(chatId);
  });

  bot.action('cancel_deldns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText(t('deldns.cancelled'));
    
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
        await createDelDnsReply(ctx)(t('deldns.fetchDomainsFailed', { message: error.message }));
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
      await createDelDnsReply(ctx)(t('deldns.fetchDomainsFailed', { message: error.message }));
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
        await ctx.answerCbQuery(t('deldns.pageInfoCallback', {
          page: session.currentPage + 1,
          totalPages
        }));
      } catch (error) {
        await ctx.answerCbQuery(t('deldns.pageInfoFallback'));
      }
    } else {
      await ctx.answerCbQuery(t('common.sessionExpired'));
    }
  });

  // 搜索域名功能
  bot.action('search_domains_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_DELETE) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 更新会话状态
    session.state = SessionState.WAITING_SEARCH_KEYWORD_FOR_DELETE;
    session.lastUpdate = Date.now();

    await ctx.answerCbQuery();
    await createDelDnsReply(ctx)(
      t('deldns.searchPrompt'),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('deldns.cancelSearch'), callback_data: 'cancel_search_domains_del' }
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
      await ctx.answerCbQuery(t('common.sessionExpired'));
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
      await createDelDnsReply(ctx)(t('deldns.fetchDomainsFailed', { message: error.message }));
    }

    await ctx.answerCbQuery();
  });

  // 取消搜索域名功能
  bot.action('cancel_search_domains_del', async (ctx) => {
    trackDelDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 回到域名选择状态
    session.state = SessionState.SELECTING_DOMAIN_FOR_DELETE;
    session.lastUpdate = Date.now();
    
    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, session.currentPage, session.searchKeyword);
    } catch (error) {
      await createDelDnsReply(ctx)(t('deldns.fetchDomainsFailed', { message: error.message }));
    }

    await ctx.answerCbQuery();
  });

}

module.exports = { setupCallbacks };
