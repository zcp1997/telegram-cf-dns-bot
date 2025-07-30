const { userSessions, SessionState } = require('../core/session');
const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { DNS_RECORDS_PAGE_SIZE, DOMAINS_PAGE_SIZE } = require('../../config');
const { getDnsRecord } = require('../../services/cloudflare');

const command = {
  command: 'getdns',
  description: '查询DNS记录'
};

const commandAll = {
  command: 'getdnsall',
  description: '查询所有DNS记录'
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
    navigationButtons.push({ text: '⬅️ 上一页', callback_data: 'dns_prev_page' });
  }

  // 页码信息
  navigationButtons.push({
    text: `${session.currentPage + 1}/${session.totalPages}`,
    callback_data: 'dns_page_info'
  });

  // 下一页按钮
  if (session.currentPage < session.totalPages - 1) {
    navigationButtons.push({ text: '下一页 ➡️', callback_data: 'dns_next_page' });
  }

  // 完成按钮
  const actionButtons = [{ text: '完成查询', callback_data: 'dns_done' }];

  // 合并所有按钮
  const inlineKeyboard = [...recordButtons, navigationButtons, actionButtons];

  const messageText =
    `${session.domain} 的DNS记录 (第${startIdx + 1}条-第${endIdx}条/共${session.dnsRecords.length}条记录):\n\n` +
    `点击记录可以更新或删除。\n\n` +
    `记录类型: 4️⃣IPv4 6️⃣IPv6 🔗CNAME 📄TXT\n` +
    `代理状态: 🟢已代理 🔴未代理 ⚪不支持`;

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
          `未找到 ${domainName} 的DNS记录\n\n` +
          `请重新输入子域名前缀（如：www），或直接发送 "." 查询根域名。\n\n` +
          `例如：输入 "www" 将查询 www.${session.rootDomain}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '查询根域名', callback_data: 'query_root_domain' },
                { text: '取消操作', callback_data: 'cancel_getdns' }
              ]]
            }
          }
        );
      } else {
        // 如果没有根域名信息，则结束会话
        await createGetDnsReply(ctx)(`未找到 ${domainName} 的DNS记录`);
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
        `查询过程中发生错误: ${error.message}\n\n` +
        `请重新输入子域名前缀（如：www），或直接发送 "." 查询根域名。\n\n` +
        `例如：输入 "www" 将查询 www.${session.rootDomain}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '查询根域名', callback_data: 'query_root_domain' },
              { text: '取消操作', callback_data: 'cancel_getdns' }
            ]]
          }
        }
      );
    } else {
      // 如果没有根域名信息，则结束会话
      await createGetDnsReply(ctx)(`查询过程中发生错误: ${error.message}`);
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
      `没有找到包含关键字 "${searchKeyword}" 的域名。` : 
      '未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。';
    
    await createGetDnsReply(ctx)(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '取消操作', callback_data: 'cancel_getdns' }]
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
      text: '⬅️ 上一页', 
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
      text: '下一页 ➡️', 
      callback_data: `domains_next_page_${commandType}` 
    });
  }
  
  // 操作按钮
  const actionButtons = [];
  
  // 搜索按钮
  actionButtons.push({ 
    text: '🔍 搜索域名', 
    callback_data: `search_domains_${commandType}` 
  });
  
  if (searchKeyword) {
    actionButtons.push({ 
      text: '🔄 显示全部', 
      callback_data: `show_all_domains_${commandType}` 
    });
  }
  
  // 取消按钮
  actionButtons.push({ text: '取消操作', callback_data: 'cancel_getdns' });
  
  // 合并所有按钮
  const inlineKeyboard = [...domainButtons];
  if (navigationButtons.length > 0) {
    inlineKeyboard.push(navigationButtons);
  }
  inlineKeyboard.push(actionButtons);
  
  // 构建消息文本
  let message = searchKeyword ? 
    `搜索结果 (关键字: "${searchKeyword}"):\n` :
    '请选择要查询的域名：\n';
  
  message += `\n第${startIdx + 1}-${endIdx}条，共${filteredDomains.length}个域名`;
  
  if (totalPages > 1) {
    message += ` (第${currentPage + 1}页/共${totalPages}页)`;
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