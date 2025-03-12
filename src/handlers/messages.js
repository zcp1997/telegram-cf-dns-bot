const { userSessions, SessionState } = require('../utils/session');
const { getZoneIdForDomain } = require('../utils/domain');
const { getDnsRecord } = require('../services/cloudflare');
const { validateIpAddress } = require('../services/validation');
const { DNS_RECORDS_PAGE_SIZE } = require('../config');

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
        await handleQueryDomainInput(ctx, session);
        break;

      case SessionState.WAITING_DNS_UPDATE_NEW_IP:
        await handleDnsUpdateIpInput(ctx, session);
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
      session.pageSize = DNS_RECORDS_PAGE_SIZE; // 每页显示5条记录
      session.totalPages = Math.ceil(records.length / session.pageSize);
      session.state = SessionState.VIEWING_DNS_RECORDS;
      session.getAllRecords = getAllRecords;
      
      // 显示第一页记录
      await displayDnsRecordsPage(ctx, session, domainName);
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
async function displayDnsRecordsPage(ctx, session, domainName) {
  // 确保域名被保存到会话中
  if (domainName) {
    session.domain = domainName;
  }
  
  const startIdx = session.currentPage * session.pageSize;
  const endIdx = Math.min(startIdx + session.pageSize, session.dnsRecords.length);
  const pageRecords = session.dnsRecords.slice(startIdx, endIdx);
  
  // 创建记录按钮
    // 创建记录按钮
    const recordButtons = pageRecords.map((record, index) => {
      // 根据记录类型显示更友好的描述
      let typeDisplay = record.type;
      if (record.type === 'A') {
        typeDisplay = 'IPv4';
      } else if (record.type === 'AAAA') {
        typeDisplay = 'IPv6';
      }
      
      // 创建按钮文本
      const buttonText = `${record.name} [${typeDisplay}] ${record.proxied ? '🟢' : '🔴'}`;
      
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
  
  await ctx.reply(
    `${session.domain} 的DNS记录 (${startIdx + 1}-${endIdx}/${session.dnsRecords.length}):\n` +
    `点击记录可以更新或删除。🟢=已代理 🔴=未代理`,
    {
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    }
  );
}

// 处理新IP地址输入
async function handleDnsUpdateIpInput(ctx, session) {
  const ipAddress = ctx.message.text.trim();

  const validationResult = validateIpAddress(ipAddress);
  if (!validationResult.success) {
    await ctx.reply(validationResult.message);
    return;
  }

  const recordType = validationResult.type;
  const record = session.selectedRecord;
  
  // 检查IP类型是否与记录类型匹配
  if (record.type !== recordType) {
    await ctx.reply(
      `输入的IP类型 (${recordType}) 与记录类型 (${record.type}) 不匹配。\n` +
      `请输入正确类型的IP地址。`
    );
    return;
  }
  
  // 确保记录包含必要的字段
  if (!record.zone_id || !record.id) {
    console.log('记录信息:', JSON.stringify(record));
    await ctx.reply('记录信息不完整，无法更新。请联系管理员。');
    userSessions.delete(ctx.chat.id);
    return;
  }
  
  session.newIpAddress = ipAddress;
  session.state = SessionState.WAITING_NEW_PROXY;
  
  await ctx.reply(
    `是否为 ${record.name} 启用 Cloudflare 代理？\n\n` +
    `当前状态: ${record.proxied ? '已启用' : '未启用'}\n\n` +
    `注意：某些服务（如 SSH、FTP 等）可能需要关闭代理才能正常使用。`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ 不启用代理', callback_data: 'new_proxy_no' },
            { text: '✅ 启用代理', callback_data: 'new_proxy_yes' }
          ],
          [
            { text: '取消操作', callback_data: 'cancel_update_dns' }
          ]
        ]
      }
    }
  );
}

module.exports = { setupMessageHandlers, displayDnsRecordsPage };
