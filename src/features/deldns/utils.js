const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { DOMAINS_PAGE_SIZE } = require('../../config');
const { t } = require('../../i18n');

const command = {
  command: 'deldns',
  description: t('deldns.command.description')
};

// 创建命令特定的跟踪函数
function trackDelDnsMessage(ctx) {
  return trackContextMessage(ctx, command.command);
}

// 创建命令特定的回复函数
function createDelDnsReply(ctx) {
  return createTrackedReply(ctx, command.command);
}

function deleteDelDnsProcessMessages(ctx, excludeMessageId = null) {
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
  trackDelDnsMessage(ctx);
  
  // 过滤域名
  const filteredDomains = filterDomains(domains, searchKeyword);
  
  if (filteredDomains.length === 0) {
    const message = searchKeyword ? 
      t('deldns.noSearchResults', { keyword: searchKeyword }) :
      t('deldns.noDomains');
    
    await createDelDnsReply(ctx)(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('common.cancelOperation'), callback_data: 'cancel_deldns' }]
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
    return [{ text: domain, callback_data: `select_domain_del_${domain}` }];
  });
  
  // 创建分页导航按钮
  const navigationButtons = [];
  
  // 上一页按钮
  if (currentPage > 0) {
    navigationButtons.push({
      text: t('common.previousPage'),
      callback_data: `domains_prev_page_del`
    });
  }
  
  // 页码信息
  navigationButtons.push({
    text: `${currentPage + 1}/${totalPages}`,
    callback_data: 'domains_page_info_del'
  });
  
  // 下一页按钮
  if (currentPage < totalPages - 1) {
    navigationButtons.push({
      text: t('common.nextPage'),
      callback_data: `domains_next_page_del`
    });
  }
  
  // 操作按钮
  const actionButtons = [];
  
  // 搜索按钮
  actionButtons.push({
    text: t('deldns.searchDomain'),
    callback_data: `search_domains_del`
  });
  
  if (searchKeyword) {
    actionButtons.push({
      text: t('deldns.showAllDomains'),
      callback_data: `show_all_domains_del`
    });
  }
  
  // 取消按钮
  actionButtons.push({ text: t('common.cancelOperation'), callback_data: 'cancel_deldns' });
  
  // 合并所有按钮
  const inlineKeyboard = [...domainButtons];
  if (navigationButtons.length > 0) {
    inlineKeyboard.push(navigationButtons);
  }
  inlineKeyboard.push(actionButtons);
  
  // 构建消息文本
  let message = searchKeyword ? 
    `${t('deldns.searchResultsTitle', { keyword: searchKeyword })}\n` :
    `${t('deldns.selectDomainTitle')}\n`;
  
  message += `\n${t('deldns.domainRange', {
    start: startIdx + 1,
    end: endIdx,
    total: filteredDomains.length
  })}`;
  
  if (totalPages > 1) {
    message += t('deldns.pageInfo', {
      page: currentPage + 1,
      totalPages
    });
  }
  
  message += `\n\n${t('deldns.supportedRecordTypes')}`;
  
  if (!searchKeyword) {
    message += `\n${t('deldns.searchTip')}`;
  }
  
  await createDelDnsReply(ctx)(message, {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
}

module.exports = {
  command,
  trackDelDnsMessage,
  createDelDnsReply,
  deleteDelDnsProcessMessages,
  displayDomainsPage,
  filterDomains
};
