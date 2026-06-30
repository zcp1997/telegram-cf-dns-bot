const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { DOMAINS_PAGE_SIZE } = require('../../config');
const { t } = require('../../i18n');

const command = {
  command: 'setdns',
  description: t('setdns.command.description')
};

// 创建命令特定的跟踪函数
function trackSetDnsMessage(ctx) {
  return trackContextMessage(ctx, command.command);
}

// 创建命令特定的回复函数
function createSetDnsReply(ctx) {
  return createTrackedReply(ctx, command.command);
}

function deleteSetDnsProcessMessages(ctx, excludeMessageId = null) {
  return deleteProcessMessages(ctx.telegram, ctx.chat.id, command.command, excludeMessageId);
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
async function displayDomainsPage(ctx, domains, currentPage, searchKeyword = '') {
  trackSetDnsMessage(ctx);
  
  // 过滤域名
  const filteredDomains = filterDomains(domains, searchKeyword);
  
  if (filteredDomains.length === 0) {
    const message = searchKeyword ? 
      t('setdns.noSearchResults', { keyword: searchKeyword }) :
      t('setdns.noDomains');
    
    await createSetDnsReply(ctx)(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('common.cancelOperation'), callback_data: 'cancel_setdns' }]
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
    return [{ text: domain, callback_data: `select_domain_set_${domain}` }];
  });
  
  // 创建分页导航按钮
  const navigationButtons = [];
  
  // 上一页按钮
  if (currentPage > 0) {
    navigationButtons.push({
      text: t('common.previousPage'),
      callback_data: `domains_prev_page_set`
    });
  }
  
  // 页码信息
  navigationButtons.push({
    text: `${currentPage + 1}/${totalPages}`,
    callback_data: 'domains_page_info_set'
  });
  
  // 下一页按钮
  if (currentPage < totalPages - 1) {
    navigationButtons.push({
      text: t('common.nextPage'),
      callback_data: `domains_next_page_set`
    });
  }
  
  // 操作按钮
  const actionButtons = [];
  
  // 搜索按钮
  actionButtons.push({
    text: t('setdns.searchDomain'),
    callback_data: `search_domains_set`
  });
  
  if (searchKeyword) {
    actionButtons.push({
      text: t('setdns.showAllDomains'),
      callback_data: `show_all_domains_set`
    });
  }
  
  // 取消按钮
  actionButtons.push({ text: t('common.cancelOperation'), callback_data: 'cancel_setdns' });
  
  // 合并所有按钮
  const inlineKeyboard = [...domainButtons];
  if (navigationButtons.length > 0) {
    inlineKeyboard.push(navigationButtons);
  }
  inlineKeyboard.push(actionButtons);
  
  // 构建消息文本
  let message = searchKeyword ? 
    `${t('setdns.searchResultsTitle', { keyword: searchKeyword })}\n` :
    `${t('setdns.selectDomainTitle')}\n`;
  
  message += `\n${t('setdns.domainRange', {
    start: startIdx + 1,
    end: endIdx,
    total: filteredDomains.length
  })}`;
  
  if (totalPages > 1) {
    message += t('setdns.pageInfo', {
      page: currentPage + 1,
      totalPages
    });
  }
  
  message += `\n\n${t('setdns.supportedRecordTypes')}`;
  
  if (!searchKeyword) {
    message += `\n${t('setdns.searchTip')}`;
  }
  
  await createSetDnsReply(ctx)(message, {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
}

module.exports = {
  command,
  trackSetDnsMessage,
  createSetDnsReply,
  deleteSetDnsProcessMessages,
  displayDomainsPage,
  filterDomains
};
