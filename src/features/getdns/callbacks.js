const { userSessions, SessionState } = require('../core/session');
const { trackGetDnsMessage, createGetDnsReply, deleteGetDnsProcessMessages, queryDomainRecords, displayDnsRecordsPage, displayDomainsPage } = require('./utils');
const { deleteSingleDnsRecord, updateDnsRecord, getDnsRecord } = require('../../services/cloudflare');
const { getZoneIdForDomain, getConfiguredDomains } = require('../../utils/domain');
const { DNS_RECORDS_PAGE_SIZE } = require('../../config');
const { t } = require('../../i18n');

function proxyStatusText(proxied) {
  return proxied ? t('getdns.proxyEnabled') : t('getdns.proxyDisabled');
}

function recordContentLabel(type) {
  if (type === 'A' || type === 'AAAA') return t('getdns.ipLabel');
  if (type === 'CNAME') return t('getdns.targetDomainLabel');
  if (type === 'TXT') return t('getdns.textContentLabel');
  return t('getdns.contentLabel');
}

function recordTypeDisplay(type) {
  if (type === 'A') return '4️⃣ IPv4 (A)';
  if (type === 'AAAA') return '6️⃣ IPv6 (AAAA)';
  if (type === 'CNAME') return '🔗 CNAME';
  if (type === 'TXT') return '📄 TXT';
  return type;
}

function updatePromptForRecord(record) {
  const params = { domain: record.name, content: record.content };
  if (record.type === 'A') return t('getdns.promptNewA', params);
  if (record.type === 'AAAA') return t('getdns.promptNewAAAA', params);
  if (record.type === 'CNAME') return t('getdns.promptNewCNAME', params);
  if (record.type === 'TXT') return t('getdns.promptNewTXT', params);
  return t('getdns.promptNewContent', params);
}

function withStatusCode(message, error) {
  if (!error.response) {
    return message;
  }
  return message + t('getdns.statusCode', { status: error.response.status });
}

function setupCallbacks(bot) {
  bot.action(/^select_domain_query_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_QUERY) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_INPUT;

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      t('getdns.domainSelected', { domain: rootDomain }),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('getdns.queryRootDomain'), callback_data: 'query_root_domain' },
            { text: t('common.cancelOperation'), callback_data: 'cancel_getdns' }
          ]]
        }
      }
    );
  });

  // 处理查询根域名的回调
  bot.action('query_root_domain', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_SUBDOMAIN_INPUT) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    await ctx.answerCbQuery();
    await queryDomainRecords(ctx, session.rootDomain);
  });

  bot.action('cancel_getdns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText(t('getdns.cancelled'));
    
    // 获取当前回调消息的ID，以便在删除时排除它
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    // 删除其他相关消息，但排除当前消息
    await deleteGetDnsProcessMessages(ctx, currentMessageId);
    
    userSessions.delete(chatId);
  });

  // 处理DNS记录点击
  bot.action(/^dns_r_r(\d+)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    // 允许在查看记录和管理记录状态下点击
    if (!session || (session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 从回调数据中提取记录索引
    const recordKey = `r${ctx.match[1]}`;
    const recordIndex = session.pageRecordIndices[recordKey];

    // 查找完整的记录信息
    const record = session.dnsRecords[recordIndex];
    if (!record) {
      await ctx.answerCbQuery(t('getdns.recordNotFound'));
      return;
    }

    // 保存记录信息到会话
    session.selectedRecord = record;
    session.state = SessionState.MANAGING_DNS_RECORD;

    let recordDetails =
      `${t('getdns.domainLabel')}: ${record.name}\n` +
      `${recordContentLabel(record.type)}: ${record.content}\n` +
      `${t('getdns.typeLabel')}: ${recordTypeDisplay(record.type)}\n`;
    
    // 只对支持代理的记录类型显示代理状态
    if (record.type === 'A' || record.type === 'AAAA' || record.type === 'CNAME') {
      recordDetails += `${t('getdns.proxyStatusLabel')}: ${proxyStatusText(record.proxied)}`;
    } else {
      recordDetails += `${t('getdns.proxyStatusLabel')}: ${t('getdns.proxyUnsupported')}`;
    }

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      t('getdns.recordDetails', { details: recordDetails }),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('getdns.updateRecord'), callback_data: 'dns_update_record' },
              { text: t('getdns.deleteRecord'), callback_data: 'dns_delete_record' }
            ],
            [
              { text: t('getdns.backToList'), callback_data: 'dns_back_to_list' }
            ]
          ]
        }
      }
    );
  });



  bot.action('dns_prev_page', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || (session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS &&
      session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    if (session.currentPage > 0) {
      session.currentPage--;
      await displayDnsRecordsPage(ctx, session);
    }

    await ctx.answerCbQuery();
  });

  bot.action('dns_next_page', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || (session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS &&
      session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    if (session.currentPage < session.totalPages - 1) {
      session.currentPage++;
      await displayDnsRecordsPage(ctx, session);
    }

    await ctx.answerCbQuery();
  });

  bot.action('dns_page_info', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    await ctx.answerCbQuery(t('getdns.pageInfoCallback', {
      page: session.currentPage + 1,
      totalPages: session.totalPages
    }));
  });

  // 返回列表
  bot.action('dns_back_to_list', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;

    await ctx.answerCbQuery();

    await displayDnsRecordsPage(ctx, session);
  });

  // 处理更新记录请求
  bot.action('dns_update_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    session.state = SessionState.WAITING_UPDATE_CHOICE;

    await ctx.answerCbQuery();
    
    const record = session.selectedRecord;
    let contentLabel = t('getdns.currentContentLabel');
    let updateContentLabel = t('getdns.updateContent');
    
    if (record.type === 'A' || record.type === 'AAAA') {
      contentLabel = t('getdns.currentIpLabel');
      updateContentLabel = t('getdns.updateIp');
    } else if (record.type === 'CNAME') {
      contentLabel = t('getdns.currentTargetLabel');
      updateContentLabel = t('getdns.updateTarget');
    } else if (record.type === 'TXT') {
      contentLabel = t('getdns.currentTextLabel');
      updateContentLabel = t('getdns.updateText');
    }
    
    let proxyLine = '';
    
    // 构建按钮
    const buttons = [[{ text: updateContentLabel, callback_data: 'dns_update_ip' }]];
    
    // 只对支持代理的记录类型显示代理状态和相关按钮
    if (record.type === 'A' || record.type === 'AAAA' || record.type === 'CNAME') {
      proxyLine = `${t('getdns.proxyCurrentStatusLabel')}: ${proxyStatusText(record.proxied)}`;
      buttons[0].push({ text: t('getdns.updateProxyOnly'), callback_data: 'dns_update_proxy_only' });
    } else {
      proxyLine = `${t('getdns.proxyStatusLabel')}: ${t('getdns.proxyUnsupported')}`;
    }
    
    buttons.push([{ text: t('common.cancelOperation'), callback_data: 'cancel_update_dns' }]);
    
    await createGetDnsReply(ctx)(
      t('getdns.updateChoice', {
        domain: record.name,
        contentLabel,
        content: record.content,
        proxyLine
      }),
      {
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
  });

  // 新增：处理选择修改IP地址
  bot.action('dns_update_ip', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_UPDATE_CHOICE) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 立即更新状态以避免竞态条件
    session.state = SessionState.WAITING_DNS_UPDATE_NEW_IP;
    session.lastUpdate = Date.now();

    await ctx.answerCbQuery();
    
    const record = session.selectedRecord;
    const promptMessage = updatePromptForRecord(record);
    
    await createGetDnsReply(ctx)(
      promptMessage,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('common.cancelOperation'), callback_data: 'cancel_update_dns' }
          ]]
        }
      }
    );
  });

  // 新增：处理选择仅修改代理状态
  bot.action('dns_update_proxy_only', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_UPDATE_CHOICE) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const record = session.selectedRecord;
    const currentProxyStatus = proxyStatusText(record.proxied);
    const suggestedStatus = proxyStatusText(!record.proxied);

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      t('getdns.proxyUpdatePrompt', {
        domain: record.name,
        currentStatus: currentProxyStatus,
        suggestedStatus
      }),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('getdns.proxySetNo'), callback_data: 'dns_proxy_only_no' },
              { text: t('getdns.proxySetYes'), callback_data: 'dns_proxy_only_yes' }
            ],
            [
              { text: t('common.cancelOperation'), callback_data: 'cancel_update_dns' }
            ]
          ]
        }
      }
    );
  });

  // 处理仅修改代理状态的通用函数
  async function handleProxyOnlyUpdate(ctx, proxied) {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_UPDATE_CHOICE) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const record = session.selectedRecord;
    const proxyStatus = proxied ? t('getdns.enableProxy') : t('getdns.disableProxy');

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      t('getdns.updatingProxy', { domain: record.name, proxyStatus })
    );

    try {
      // 检查记录是否包含必要的字段
      if (!record.zone_id || !record.id) {
        throw new Error(t('getdns.incompleteRecord', {
          zoneId: record.zone_id,
          recordId: record.id
        }));
      }

      console.log(`更新代理状态记录信息: ${JSON.stringify(record)}`);

      // 只修改代理状态，IP地址保持不变
      await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        record.content, // 保持原IP不变
        record.type,
        proxied,
        record // 传递完整的原始记录
      );
      
      const statusText = proxied ? t('getdns.proxyEnabledDone') : t('getdns.proxyDisabledDone');
      await ctx.reply(t('getdns.proxyUpdated', { domain: record.name, status: statusText }));
      deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      const errorMessage = withStatusCode(t('getdns.proxyUpdateError', { message: error.message }), error);
      await ctx.reply(errorMessage);
      console.error('更新DNS记录代理状态时出错:', error);
    }

    userSessions.delete(chatId);
  }

  // 重构后的代理状态处理器 - 启用
  bot.action('dns_proxy_only_yes', async (ctx) => {
    await handleProxyOnlyUpdate(ctx, true);
  });

  // 重构后的代理状态处理器 - 禁用
  bot.action('dns_proxy_only_no', async (ctx) => {
    await handleProxyOnlyUpdate(ctx, false);
  });

  // 处理删除记录请求
  bot.action('dns_delete_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      t('getdns.deleteConfirm', {
        domain: record.name,
        content: record.content,
        type: record.type
      }),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('getdns.confirmDelete'), callback_data: 'confirm_delete_record' },
              { text: t('common.cancel'), callback_data: 'cancel_delete_record' }
            ]
          ]
        }
      }
    );
  });

  // 确认删除记录
  bot.action('confirm_delete_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(t('getdns.deleting', { domain: record.name }));

    try {
      // 修改：传递完整的记录信息作为第三个参数
      await deleteSingleDnsRecord(record.zone_id, record.id, record);
      await ctx.reply(t('getdns.deleted', { domain: record.name }));
      await deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      await ctx.reply(t('getdns.deleteError', { message: error.message }));
    }

    userSessions.delete(chatId);
  });

  // 取消删除记录
  bot.action('cancel_delete_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(t('getdns.deleteCancelled'));
    await displayDnsRecordsPage(ctx, session);
  });

  // 取消更新DNS
  bot.action('cancel_update_dns', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(t('getdns.updateCancelled'));
    await displayDnsRecordsPage(ctx, session);
  });

  // 处理新代理设置
  bot.action('dns_update_proxy_yes', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_NEW_PROXY) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      t('getdns.updatingRecord', {
        domain: record.name,
        content: session.newIpAddress,
        type: record.type,
        proxyStatus: t('getdns.proxyEnabled')
      })
    );

    try {
      // 检查记录是否包含必要的字段
      if (!record.zone_id || !record.id) {
        throw new Error(t('getdns.incompleteRecord', {
          zoneId: record.zone_id,
          recordId: record.id
        }));
      }

      console.log(`更新记录信息: ${JSON.stringify(record)}`);

      // 修改：传递原始记录作为最后一个参数
      await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        session.newIpAddress,
        record.type,
        true,
        record // 传递完整的原始记录
      );
      await ctx.reply(t('getdns.updated', { domain: record.name }));
      deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      const errorMessage = withStatusCode(t('getdns.updateError', { message: error.message }), error);
      await ctx.reply(errorMessage);
      console.error('更新DNS记录时出错:', error);
    }

    userSessions.delete(chatId);
  });

  bot.action('dns_update_proxy_no', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_NEW_PROXY) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      t('getdns.updatingRecord', {
        domain: record.name,
        content: session.newIpAddress,
        type: record.type,
        proxyStatus: t('getdns.proxyDisabled')
      })
    );

    try {
      // 检查记录是否包含必要的字段
      if (!record.zone_id || !record.id) {
        throw new Error(t('getdns.incompleteRecord', {
          zoneId: record.zone_id,
          recordId: record.id
        }));
      }

      console.log(`更新记录信息: ${JSON.stringify(record)}`);

      // 修改：传递原始记录作为最后一个参数
      await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        session.newIpAddress,
        record.type,
        false,
        record // 传递完整的原始记录
      );
      await ctx.reply(t('getdns.updated', { domain: record.name }));
      deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      const errorMessage = withStatusCode(t('getdns.updateError', { message: error.message }), error);
      await ctx.reply(errorMessage);
      console.error('更新DNS记录时出错:', error);
    }

    userSessions.delete(chatId);
  });

  bot.action('dns_done', async (ctx) => {
    const chatId = ctx.chat.id;
    // 先回答回调查询
    await ctx.answerCbQuery(t('getdns.doneAnswer'));
    // 发送完成提示
    await ctx.reply(t('getdns.doneMessage'));

    await deleteGetDnsProcessMessages(ctx);
    // 最后删除会话
    userSessions.delete(chatId);
  });

  
  // getdnsall处理域名选择回调
  bot.action(/^select_domain_all_(.+)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    // 检查会话是否存在，并且状态是选择域名、查看记录或管理记录
    if (!session || (session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS &&
      session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 从回调数据中提取域名
    const domainName = ctx.match[1];
    const zoneId = await getZoneIdForDomain(domainName);

    if (!zoneId) {
      await createGetDnsReply(ctx)(t('getdns.zoneNotFound'));
      userSessions.delete(chatId);
      return;
    }
    await ctx.answerCbQuery();

    // 显示正在查询的提示
    await createGetDnsReply(ctx)(t('getdns.queryingAll', { domain: domainName }));

    try {
      const { records } = await getDnsRecord(domainName, true);

      if (records && records.length > 0) {
        // 保存记录到会话中
        session.dnsRecords = records;
        session.domain = domainName;
        session.currentPage = 0;
        session.pageSize = DNS_RECORDS_PAGE_SIZE;
        session.totalPages = Math.ceil(records.length / session.pageSize);
        session.state = SessionState.VIEWING_DNS_RECORDS;
        session.getAllRecords = true;

        // 显示第一页记录
        await displayDnsRecordsPage(ctx, session);
      }
      else {
        await createGetDnsReply(ctx)(t('getdns.noRecords', { domain: domainName }));
      }
    } catch (error) {
      await createGetDnsReply(ctx)(t('getdns.queryError', { message: error.message }));
    }
  });

  // 域名列表分页导航 - 上一页
  bot.action(/^domains_prev_page_(query|all)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    const commandType = ctx.match[1];

    const expectedState = commandType === 'query' ? 
      SessionState.SELECTING_DOMAIN_FOR_QUERY : 
      SessionState.SELECTING_DOMAIN_FOR_ALL_DNS;

    if (!session || session.state !== expectedState) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    if (session.currentPage > 0) {
      session.currentPage--;
      session.lastUpdate = Date.now();
      
      try {
        const domains = await getConfiguredDomains();
        await displayDomainsPage(ctx, domains, session.currentPage, commandType, session.searchKeyword);
      } catch (error) {
        await createGetDnsReply(ctx)(t('getdns.fetchDomainsFailed', { message: error.message }));
      }
    }

    await ctx.answerCbQuery();
  });

  // 域名列表分页导航 - 下一页
  bot.action(/^domains_next_page_(query|all)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    const commandType = ctx.match[1];

    const expectedState = commandType === 'query' ? 
      SessionState.SELECTING_DOMAIN_FOR_QUERY : 
      SessionState.SELECTING_DOMAIN_FOR_ALL_DNS;

    if (!session || session.state !== expectedState) {
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
        
        await displayDomainsPage(ctx, domains, session.currentPage, commandType, session.searchKeyword);
      }
    } catch (error) {
      await createGetDnsReply(ctx)(t('getdns.fetchDomainsFailed', { message: error.message }));
    }

    await ctx.answerCbQuery();
  });

  // 域名列表页码信息
  bot.action('domains_page_info', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (session) {
      try {
        const domains = await getConfiguredDomains();
        const { DOMAINS_PAGE_SIZE } = require('../../config');
        const totalPages = Math.ceil(domains.length / DOMAINS_PAGE_SIZE);
        await ctx.answerCbQuery(t('getdns.pageInfoCallback', {
          page: session.currentPage + 1,
          totalPages
        }));
      } catch (error) {
        await ctx.answerCbQuery(t('getdns.pageInfoFallback'));
      }
    } else {
      await ctx.answerCbQuery(t('common.sessionExpired'));
    }
  });

  // 搜索域名功能
  bot.action(/^search_domains_(query|all)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    const commandType = ctx.match[1];

    const expectedState = commandType === 'query' ? 
      SessionState.SELECTING_DOMAIN_FOR_QUERY : 
      SessionState.SELECTING_DOMAIN_FOR_ALL_DNS;

    if (!session || session.state !== expectedState) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 更新会话状态
    session.state = commandType === 'query' ? 
      SessionState.WAITING_SEARCH_KEYWORD_FOR_QUERY : 
      SessionState.WAITING_SEARCH_KEYWORD_FOR_ALL;
    session.lastUpdate = Date.now();

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      t('getdns.searchPrompt'),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: t('getdns.cancelSearch'), callback_data: 'cancel_search_domains' }
          ]]
        }
      }
    );
  });

  // 显示全部域名功能
  bot.action(/^show_all_domains_(query|all)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    const commandType = ctx.match[1];

    const expectedSearchState = commandType === 'query' ? 
      SessionState.WAITING_SEARCH_KEYWORD_FOR_QUERY : 
      SessionState.WAITING_SEARCH_KEYWORD_FOR_ALL;
    const expectedSelectState = commandType === 'query' ? 
      SessionState.SELECTING_DOMAIN_FOR_QUERY : 
      SessionState.SELECTING_DOMAIN_FOR_ALL_DNS;

    if (!session || (session.state !== expectedSearchState && session.state !== expectedSelectState)) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 重置搜索关键字和页码
    session.searchKeyword = '';
    session.currentPage = 0;
    session.state = expectedSelectState;
    session.lastUpdate = Date.now();

    try {
      const domains = await getConfiguredDomains();
      await displayDomainsPage(ctx, domains, 0, commandType);
    } catch (error) {
      await createGetDnsReply(ctx)(t('getdns.fetchDomainsFailed', { message: error.message }));
    }

    await ctx.answerCbQuery();
  });

  // 取消搜索域名功能
  bot.action('cancel_search_domains', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery(t('common.sessionExpired'));
      return;
    }

    // 根据当前状态判断回到哪个状态
    if (session.state === SessionState.WAITING_SEARCH_KEYWORD_FOR_QUERY) {
      session.state = SessionState.SELECTING_DOMAIN_FOR_QUERY;
      const commandType = 'query';
      
      try {
        const domains = await getConfiguredDomains();
        await displayDomainsPage(ctx, domains, session.currentPage, commandType, session.searchKeyword);
      } catch (error) {
        await createGetDnsReply(ctx)(t('getdns.fetchDomainsFailed', { message: error.message }));
      }
    } else if (session.state === SessionState.WAITING_SEARCH_KEYWORD_FOR_ALL) {
      session.state = SessionState.SELECTING_DOMAIN_FOR_ALL_DNS;
      const commandType = 'all';
      
      try {
        const domains = await getConfiguredDomains();
        await displayDomainsPage(ctx, domains, session.currentPage, commandType, session.searchKeyword);
      } catch (error) {
        await createGetDnsReply(ctx)(t('getdns.fetchDomainsFailed', { message: error.message }));
      }
    }

    session.lastUpdate = Date.now();
    await ctx.answerCbQuery();
  });

}

module.exports = { setupCallbacks };
