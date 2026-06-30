const { userSessions, SessionState } = require('../core/session');
const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { DNS_RECORDS_PAGE_SIZE, DOMAINS_PAGE_SIZE } = require('../../config');
const { getDnsRecord } = require('../../services/cloudflare');
const { t } = require('../../i18n');

const command = {
  command: 'getdns',
  description: t('getdns.command.description')
};

const commandAll = {
  command: 'getdnsall',
  description: t('getdns.commandAll.description')
};

const commands = [command, commandAll];

// 创建命令特定的跟踪函数
function trackGetDnsMessage(ctx) {
  return trackContextMessage(ctx, commands);
}

// 创建命令特定的回复函数
function createGetDnsReply(ctx) {
  return createTrackedReply(ctx, commands);
}

function deleteGetDnsProcessMessages(ctx, excludeMessageId = null) {
  return deleteProcessMessages(ctx.telegram, ctx.chat.id, commands, excludeMessageId);
}

// 显示DNS记录分页
async function displayDnsRecordsPage(ctx, session, domainName) {
  trackGetDnsMessage(ctx);

  // 确保域名被保存到会话中
  if (domainName) {
    session.domain = domainName;
  }

  const startIdx = session.currentPage * session.pageSize;
  const endIdx = Math.min(startIdx + session.pageSize, session.dnsRecords.length);
  const pageRecords = session.dnsRecords.slice(startIdx, endIdx);

  // 创建记录按钮
  const recordButtons = pageRecords.map((record, index) => {
    // 根据记录类型显示更友好的描述和图标
    let typeDisplay = record.type;
    let typeIcon = '📝';
    
    if (record.type === 'A') {
      typeDisplay = 'IPv4';
      typeIcon = '4️⃣';
    } else if (record.type === 'AAAA') {
      typeDisplay = 'IPv6';
      typeIcon = '6️⃣';
    } else if (record.type === 'CNAME') {
      typeDisplay = 'CNAME';
      typeIcon = '🔗';
    } else if (record.type === 'TXT') {
      typeDisplay = 'TXT';
      typeIcon = '📄';
    }

    // 创建按钮文本，对于CNAME和TXT记录，代理状态显示可能不适用
    let proxyStatus = '';
    if (record.type === 'A' || record.type === 'AAAA' || record.type === 'CNAME') {
      proxyStatus = record.proxied ? '🟢' : '🔴';
    } else {
      proxyStatus = '⚪'; // TXT记录不支持代理
    }

    const buttonText = `${record.name} [${typeIcon} ${typeDisplay}] ${proxyStatus}`;

    // 使用索引而不是完整的ID和名称，将记录索引保存在会话中
    session.pageRecordIndices = session.pageRecordIndices || {};
    const recordKey = `r${index}`;
    session.pageRecordIndices[recordKey] = startIdx + index;

    // 创建回调数据，只包含索引标识符
    const callbackData = `dns_r_${recordKey}`;

    return [{ text: buttonText, callback_data: callbackData }];
  });


  // 构建分页导航按钮
  const navigationButtons = [];

  // 上一页按钮
  if (session.currentPage > 0) {
    navigationButtons.push({ text: t('common.previousPage'), callback_data: 'dns_prev_page' });
  }

  // 页码信息
  navigationButtons.push({
    text: `${session.currentPage + 1}/${session.totalPages}`,
    callback_data: 'dns_page_info'
  });

  // 下一页按钮
  if (session.currentPage < session.totalPages - 1) {
    navigationButtons.push({ text: t('common.nextPage'), callback_data: 'dns_next_page' });
  }

  // 完成按钮
  const actionButtons = [{ text: t('getdns.done'), callback_data: 'dns_done' }];

  // 合并所有按钮
  const inlineKeyboard = [...recordButtons, navigationButtons, actionButtons];

  const messageText =
    `${t('getdns.recordsTitle', {
      domain: session.domain,
      start: startIdx + 1,
      end: endIdx,
      total: session.dnsRecords.length
    })}\n\n` +
    `${t('getdns.recordsClickHint')}\n\n` +
    `${t('getdns.recordsTypeLegend')}\n` +
    t('getdns.recordsProxyLegend');

  await createGetDnsReply(ctx)(
    messageText,
    {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    }
  );
}


// 查询域名记录的通用函数
async function queryDomainRecords(ctx, domainName) {
  try {
    const { records } = await getDnsRecord(domainName);
    if (records && records.length > 0) {
      // 保存记录到会话中
      const session = userSessions.get(ctx.chat.id);
      session.dnsRecords = records;
      session.domain = domainName;
      session.currentPage = 0;
      session.pageSize = DNS_RECORDS_PAGE_SIZE;
      session.totalPages = Math.ceil(records.length / session.pageSize);
      session.state = SessionState.VIEWING_DNS_RECORDS;
      session.getAllRecords = false;

      // 显示记录
      await displayDnsRecordsPage(ctx, session);
    }
    else {
      // 获取会话
      const session = userSessions.get(ctx.chat.id);

      // 检查是否有根域名信息
      if (session && session.rootDomain) {
        // 保持当前状态，让用户重新输入
        session.state = SessionState.WAITING_SUBDOMAIN_INPUT;

        await createGetDnsReply(ctx)(
          t('getdns.noRecordsRetry', {
            domain: domainName,
            rootDomain: session.rootDomain
          }),
          {
            reply_markup: {
              inline_keyboard: [[
                { text: t('getdns.queryRootDomain'), callback_data: 'query_root_domain' },
                { text: t('common.cancelOperation'), callback_data: 'cancel_getdns' }
              ]]
            }
          }
        );
      } else {
        // 如果没有根域名信息，则结束会话
        await createGetDnsReply(ctx)(t('getdns.noRecords', { domain: domainName }));
        userSessions.delete(ctx.chat.id);
      }
    }
  } catch (error) {
    // 获取会话
    const session = userSessions.get(ctx.chat.id);

    // 检查是否有根域名信息
    if (session && session.rootDomain) {
      // 保持当前状态，让用户重新输入
      session.state = SessionState.WAITING_SUBDOMAIN_INPUT;

      await createGetDnsReply(ctx)(
        t('getdns.queryErrorRetry', {
          message: error.message,
          rootDomain: session.rootDomain
        }),
        {
          reply_markup: {
            inline_keyboard: [[
              { text: t('getdns.queryRootDomain'), callback_data: 'query_root_domain' },
              { text: t('common.cancelOperation'), callback_data: 'cancel_getdns' }
            ]]
          }
        }
      );
    } else {
      // 如果没有根域名信息，则结束会话
      await createGetDnsReply(ctx)(t('getdns.queryError', { message: error.message }));
      userSessions.delete(ctx.chat.id);
    }
  }
}

// 过滤域名函数
function filterDomains(domains, searchKeyword) {
  if (!searchKeyword || searchKeyword.trim() === '') {
    return domains;
  }
  
  const keyword = searchKeyword.toLowerCase().trim();
  return domains.filter(domain => 
    domain.toLowerCase().includes(keyword)
  );
}

// 显示域名列表分页
async function displayDomainsPage(ctx, domains, currentPage, commandType, searchKeyword = '') {
  trackGetDnsMessage(ctx);
  
  // 过滤域名
  const filteredDomains = filterDomains(domains, searchKeyword);
  
  if (filteredDomains.length === 0) {
    const message = searchKeyword ? 
      t('getdns.noSearchResults', { keyword: searchKeyword }) :
      t('getdns.noDomains');
    
    await createGetDnsReply(ctx)(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('common.cancelOperation'), callback_data: 'cancel_getdns' }]
        ]
      }
    });
    return;
  }
  
  // 计算分页
  const totalPages = Math.ceil(filteredDomains.length / DOMAINS_PAGE_SIZE);
  const startIdx = currentPage * DOMAINS_PAGE_SIZE;
  const endIdx = Math.min(startIdx + DOMAINS_PAGE_SIZE, filteredDomains.length);
  const pageDomains = filteredDomains.slice(startIdx, endIdx);
  
  // 创建域名按钮
  const domainButtons = pageDomains.map(domain => {
    const callbackPrefix = commandType === 'query' ? 'select_domain_query_' : 'select_domain_all_';
    return [{ text: domain, callback_data: `${callbackPrefix}${domain}` }];
  });
  
  // 创建分页导航按钮
  const navigationButtons = [];
  
  // 上一页按钮
  if (currentPage > 0) {
    navigationButtons.push({ 
      text: t('common.previousPage'),
      callback_data: `domains_prev_page_${commandType}` 
    });
  }
  
  // 页码信息
  navigationButtons.push({
    text: `${currentPage + 1}/${totalPages}`,
    callback_data: 'domains_page_info'
  });
  
  // 下一页按钮
  if (currentPage < totalPages - 1) {
    navigationButtons.push({ 
      text: t('common.nextPage'),
      callback_data: `domains_next_page_${commandType}` 
    });
  }
  
  // 操作按钮
  const actionButtons = [];
  
  // 搜索按钮
  actionButtons.push({ 
    text: t('getdns.searchDomain'),
    callback_data: `search_domains_${commandType}` 
  });
  
  if (searchKeyword) {
    actionButtons.push({ 
      text: t('getdns.showAllDomains'),
      callback_data: `show_all_domains_${commandType}` 
    });
  }
  
  // 取消按钮
  actionButtons.push({ text: t('common.cancelOperation'), callback_data: 'cancel_getdns' });
  
  // 合并所有按钮
  const inlineKeyboard = [...domainButtons];
  if (navigationButtons.length > 0) {
    inlineKeyboard.push(navigationButtons);
  }
  inlineKeyboard.push(actionButtons);
  
  // 构建消息文本
  let message = searchKeyword ? 
    `${t('getdns.searchResultsTitle', { keyword: searchKeyword })}\n` :
    `${t('getdns.selectDomainTitle')}\n`;
  
  message += `\n${t('getdns.domainRange', {
    start: startIdx + 1,
    end: endIdx,
    total: filteredDomains.length,
  })}`;
  
  if (totalPages > 1) {
    message += t('getdns.pageInfo', { page: currentPage + 1, totalPages });
  }
  
  message += `\n\n${t('getdns.supportedRecordTypes')}`;
  
  if (!searchKeyword) {
    message += `\n${t('getdns.searchTip')}`;
  }
  
  await createGetDnsReply(ctx)(message, {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
}

module.exports = {
  command,
  commandAll,
  trackGetDnsMessage,
  createGetDnsReply,
  deleteGetDnsProcessMessages,
  displayDnsRecordsPage,
  queryDomainRecords,
  displayDomainsPage,
  filterDomains
};
