const { userSessions, SessionState } = require('../utils/session');
const { getZoneIdForDomain } = require('../utils/domain');
const { getDnsRecord } = require('../services/cloudflare');
const { validateIpAddress } = require('../services/validation');

function setupMessageHandlers(bot) {
  bot.on('text', async (ctx) => {
    console.log('收到文本消息:', ctx.message.text);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session) {
      console.log('未找到会话，忽略消息');
      return;
    }
    
    session.lastUpdate = Date.now();
    
    switch (session.state) {
      case SessionState.WAITING_DOMAIN:
        await handleDomainInput(ctx, session);
        break;
      
      case SessionState.WAITING_IP:
        await handleIpInput(ctx, session);
        break;
      
      case SessionState.WAITING_DOMAIN_TO_DELETE:
        await handleDeleteDomainInput(ctx, session);
        break;
      
      case SessionState.WAITING_DOMAIN_TO_QUERY:
        await handleQueryDomainInput(ctx, session, false);
        break;

      case SessionState.WAITING_DOMAIN_TO_QUERY_ALL:
        await handleQueryDomainInput(ctx, session, true);
        break;
    }
  });
}

// 处理域名输入
async function handleDomainInput(ctx, session) {
  const domainName = ctx.message.text.trim();
  const zoneId = getZoneIdForDomain(domainName);
  
  if (!zoneId) {
    await ctx.reply(
      '无法找到此域名对应的Zone ID。请确保输入了正确的域名。\n' +
      '使用 /domains 查看可配置的域名列表。'
    );
    return;
  }
  
  session.domain = domainName;
  session.state = SessionState.WAITING_IP;
  
  await ctx.reply(
    '请输入IP地址。\n' +
    '支持IPv4（例如：192.168.1.1）\n' +
    '或IPv6（例如：2001:db8::1）',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '取消操作', callback_data: 'cancel_setdns' }
        ]]
      }
    }
  );
}

// 处理IP地址输入
async function handleIpInput(ctx, session) {
  const ipAddress = ctx.message.text.trim();

  const validationResult = validateIpAddress(ipAddress);
  if (!validationResult.success) {
    await ctx.reply(validationResult.message);
    return;
  }

  const recordType = validationResult.type;
  
  session.ipAddress = ipAddress;
  session.recordType = recordType;
  session.state = SessionState.WAITING_PROXY;
  
  await ctx.reply(
    `是否启用 Cloudflare 代理？\n\n` +
    `注意：某些服务（如 SSH、FTP 等）可能需要关闭代理才能正常使用。`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ 不启用代理', callback_data: 'proxy_no' },
            { text: '✅ 启用代理', callback_data: 'proxy_yes' }
          ],
          [
            { text: '取消操作', callback_data: 'cancel_setdns' }
          ]
        ]
      }
    }
  );
}

// 处理删除域名输入
async function handleDeleteDomainInput(ctx, session) {
  const domainName = ctx.message.text.trim();
  const zoneId = getZoneIdForDomain(domainName);
  
  if (!zoneId) {
    await ctx.reply(
      '无法找到此域名对应的Zone ID。请确保输入了正确的域名。\n' +
      '使用 /domains 查看可配置的域名列表。'
    );
    return;
  }
  
  try {
    const { records } = await getDnsRecord(domainName);
    if (!records || records.length === 0) {
      await ctx.reply(`未找到域名 ${domainName} 的DNS记录。`);
      userSessions.delete(ctx.chat.id);
      return;
    }
    
    session.domain = domainName;
    session.state = SessionState.WAITING_CONFIRM_DELETE;
    
    const recordsInfo = records.map(record => 
      `类型: ${record.type}\n内容: ${record.content}`
    ).join('\n\n');
    
    await ctx.reply(
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
    await ctx.reply(`查询DNS记录时发生错误: ${error.message}`);
    userSessions.delete(ctx.chat.id);
  }
}

// 处理查询域名输入
async function handleQueryDomainInput(ctx, session, getAllRecords = false) {
  const domainName = ctx.message.text.trim();
  const zoneId = getZoneIdForDomain(domainName);
  
  if (!zoneId) {
    await ctx.reply(
      '无法找到此域名对应的Zone ID。请确保输入了正确的域名。\n' +
      '使用 /domains 查看可配置的域名列表。'
    );
    return;
  }
  
  await ctx.reply(`正在查询 ${domainName} 的DNS记录...`);
  
  try {
    const { records } = await getDnsRecord(domainName, getAllRecords);
    if (records && records.length > 0) {
      // 保存记录到会话中
      session.dnsRecords = records;
      session.currentPage = 0;
      session.pageSize = 5; // 每页显示5条记录
      session.totalPages = Math.ceil(records.length / session.pageSize);
      session.state = SessionState.VIEWING_DNS_RECORDS;
      
      // 显示第一页记录
      await displayDnsRecordsPage(ctx, session, domainName, getAllRecords);
    } else {
      await ctx.reply(`未找到 ${domainName} 的DNS记录`);
      userSessions.delete(ctx.chat.id);
    }
  } catch (error) {
    await ctx.reply(`查询过程中发生错误: ${error.message}`);
    userSessions.delete(ctx.chat.id);
  }
}

// 显示DNS记录分页
async function displayDnsRecordsPage(ctx, session, domainName, getAllRecords = false) {
  // 确保域名被保存到会话中
  if (domainName) {
    session.domain = domainName;
  }
  
  const startIdx = session.currentPage * session.pageSize;
  const endIdx = Math.min(startIdx + session.pageSize, session.dnsRecords.length);
  const pageRecords = session.dnsRecords.slice(startIdx, endIdx);
  
  const recordsText = pageRecords.map(record => {
    // 根据记录类型显示更友好的描述
    let typeDisplay = record.type;
    if (record.type === 'A') {
      typeDisplay = 'IPv4 (A)';
    } else if (record.type === 'AAAA') {
      typeDisplay = 'IPv6 (AAAA)';
    }
    
    return `域名: ${record.name}\n` +
           `IP地址: ${record.content}\n` +
           `类型: ${typeDisplay}\n` +
           `代理状态: ${record.proxied ? '已启用' : '未启用'}`;
  }).join('\n\n');
  
  // 如果是查询所有记录，则显示分页导航
  if (getAllRecords) {
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
    const actionButtons = [{ text: '完成', callback_data: 'dns_done' }];
    
    await ctx.reply(
      `${session.domain} 的DNS记录 (${startIdx + 1}-${endIdx}/${session.dnsRecords.length}):\n\n${recordsText}`,
      {
        reply_markup: {
          inline_keyboard: [
            navigationButtons,
            actionButtons
          ]
        }
      }
    );
  } else {
    // 如果不是查询所有记录，则不显示分页导航
    await ctx.reply(`${session.domain} 的DNS记录:\n\n${recordsText}`);
    // 查询完成后直接删除会话
    userSessions.delete(ctx.chat.id);
  }
}

module.exports = { setupMessageHandlers, displayDnsRecordsPage };
