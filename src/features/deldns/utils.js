const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { DOMAINS_PAGE_SIZE } = require('../../config');

const command = {
  command: 'deldns',
  description: '删除DNS记录 (A/AAAA/CNAME/TXT)'
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
      `没有找到包含关键字 "${searchKeyword}" 的域名。` : 
      '未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。';
    
    await createDelDnsReply(ctx)(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '取消操作', callback_data: 'cancel_deldns' }]
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
      text: '⬅️ 上一页', 
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
      text: '下一页 ➡️', 
      callback_data: `domains_next_page_del` 
    });
  }
  
  // 操作按钮
  const actionButtons = [];
  
  // 搜索按钮
  actionButtons.push({ 
    text: '🔍 搜索域名', 
    callback_data: `search_domains_del` 
  });
  
  if (searchKeyword) {
    actionButtons.push({ 
      text: '🔄 显示全部', 
      callback_data: `show_all_domains_del` 
    });
  }
  
  // 取消按钮
  actionButtons.push({ text: '取消操作', callback_data: 'cancel_deldns' });
  
  // 合并所有按钮
  const inlineKeyboard = [...domainButtons];
  if (navigationButtons.length > 0) {
    inlineKeyboard.push(navigationButtons);
  }
  inlineKeyboard.push(actionButtons);
  
  // 构建消息文本
  let message = searchKeyword ? 
    `🔍 搜索结果 (关键字: "${searchKeyword}"):\n` :
    '📋 请选择要删除DNS记录的域名：\n';
  
  message += `\n🌐 第${startIdx + 1}-${endIdx}条，共${filteredDomains.length}个域名`;
  
  if (totalPages > 1) {
    message += ` (第${currentPage + 1}页/共${totalPages}页)`;
  }
  
  message += `\n\n支持记录类型: 4️⃣A 6️⃣AAAA 🔗CNAME 📄TXT`;
  
  if (!searchKeyword) {
    message += `\n💡 点击 🔍搜索域名 可快速查找特定域名`;
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