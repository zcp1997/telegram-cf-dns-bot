const { userSessions, SessionState } = require('../utils/session');
const { getDnsRecord } = require('../services/cloudflare');
const { validateIpAddress } = require('../services/validation');
const { DNS_RECORDS_PAGE_SIZE } = require('../config');
const { trackMessage, createTrackedReply } = require('../utils/messageManager');

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
      case SessionState.WAITING_SUBDOMAIN_INPUT:
        await handleSubdomainInput(ctx, session);
        break;

      case SessionState.WAITING_IP:
        await handleIpInput(ctx, session);
        break;

      case SessionState.WAITING_DNS_UPDATE_NEW_IP:
        await handleDnsUpdateIpInput(ctx, session);
        break;

      case SessionState.WAITING_SUBDOMAIN_FOR_SET:
        await handleSubdomainForSet(ctx, session);
        break;
      case SessionState.WAITING_SUBDOMAIN_FOR_DELETE:
        await handleSubdomainForDelete(ctx, session);
        break;
        
      case SessionState.WAITING_SUBDOMAIN_FOR_DDNS:
        await handleSubdomainForDDNS(ctx, session);
        break;
      case SessionState.WAITING_INTERVAL_FOR_DDNS:
        await handleIntervalForDDNS(ctx, session);
        break;
    }
  });
}

// 处理IP地址输入
async function handleIpInput(ctx, session) {
  const ipAddress = ctx.message.text.trim();
  const chatId = ctx.chat.id;
  
  // 跟踪用户输入消息
  trackMessage(chatId, ctx.message.message_id, 'setdns');

  const validationResult = validateIpAddress(ipAddress);
  if (!validationResult.success) {
    const errorMsg = await ctx.reply(validationResult.message);
    trackMessage(chatId, errorMsg.message_id, 'setdns');
    return;
  }

  const recordType = validationResult.type;

  session.ipAddress = ipAddress;
  session.recordType = recordType;
  session.state = SessionState.WAITING_PROXY;

  await createTrackedReply(ctx, 'setdns')(
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

// 显示DNS记录分页
async function displayDnsRecordsPage(ctx, session, domainName) {
  // 确保域名被保存到会话中
  if (domainName) {
    session.domain = domainName;
  }

  // 初始化消息ID数组（如果不存在）
  if (!session.viewingRecordsMessageIds) {
    session.viewingRecordsMessageIds = [];
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

  const messageText =
    `${session.domain} 的DNS记录 (第${startIdx + 1}条-第${endIdx}条/共${session.dnsRecords.length}条记录):\n\n` +
    `点击记录可以更新或删除。\n\n` +
    `🟢=已代理 🔴=未代理`;

  // 发送新消息
  const sentMsg = await ctx.reply(messageText, {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });

  session.viewingRecordsMessageIds.push(sentMsg.message_id);
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
            { text: '❌ 不启用代理', callback_data: 'dns_update_proxy_no' },
            { text: '✅ 启用代理', callback_data: 'dns_update_proxy_yes' }
          ],
          [
            { text: '取消操作', callback_data: 'cancel_update_dns' }
          ]
        ]
      }
    }
  );
}

// 处理子域名输入
async function handleSubdomainInput(ctx, session) {
  const prefix = ctx.message.text.trim();
  
  // 跟踪用户输入消息
  trackMessage(ctx.chat.id, ctx.message.message_id, 'setdns');

  // 如果用户输入点号，直接查询根域名
  if (prefix === '.') {
    await queryDomainRecords(ctx, session.rootDomain);
    return;
  }

  // 构建完整域名
  const fullDomain = prefix === '' ? session.rootDomain : `${prefix}.${session.rootDomain}`;
  await queryDomainRecords(ctx, fullDomain);
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

      // 删除消息
      await ctx.deleteMessage();
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

        await ctx.reply(
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
        await ctx.reply(`未找到 ${domainName} 的DNS记录`);
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

      await ctx.reply(
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
      await ctx.reply(`查询过程中发生错误: ${error.message}`);
      userSessions.delete(ctx.chat.id);
    }
  }
}

// 处理设置DNS的子域名输入
async function handleSubdomainForSet(ctx, session) {
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;
  const chatId = ctx.chat.id;
  trackMessage(chatId, ctx.message.message_id, 'setdns');

  session.domain = fullDomain;
  session.state = SessionState.WAITING_IP;

  const ipMsg = await ctx.reply(
    `请输入 ${fullDomain} 的IP地址。\n` +
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
  
  trackMessage(chatId, ipMsg.message_id, 'setdns');
}

// 处理删除DNS的子域名输入
async function handleSubdomainForDelete(ctx, session) {
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;
  const chatId = ctx.chat.id;
  trackMessage(chatId, ctx.message.message_id, 'setdns');


  try {
    const { records } = await getDnsRecord(fullDomain);
    if (!records || records.length === 0) {
      await ctx.reply(
        `未找到 ${fullDomain} 的DNS记录\n\n` +
        `请重新输入子域名前缀（如：www），或直接发送 "." 删除根域名。\n\n` +
        `例如：输入 "www" 将删除 www.${session.rootDomain}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '删除根域名', callback_data: 'del_root_domain' },
              { text: '取消操作', callback_data: 'cancel_deldns' }
            ]]
          }
        }
      );
      return;
    }

    session.domain = fullDomain;
    session.state = SessionState.WAITING_CONFIRM_DELETE;

    const recordsInfo = records.map(record =>
      `类型: ${record.type}\n内容: ${record.content}`
    ).join('\n\n');

    await createTrackedReply(ctx, 'deldns')(
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

// 处理DDNS的子域名输入
async function handleSubdomainForDDNS(ctx, session) {
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  session.domain = fullDomain;
  session.state = SessionState.WAITING_INTERVAL_FOR_DDNS;

  await ctx.reply(
    `请输入 ${session.domain} 的DDNS刷新间隔（秒）。\n或选择预设事件间隔：`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '60秒', callback_data: 'ddns_interval_60' },
            { text: '5分钟', callback_data: 'ddns_interval_300' },
            { text: '10分钟', callback_data: 'ddns_interval_600' }
          ],
          [
            { text: '取消操作', callback_data: 'cancel_ddns' }
          ]
        ]
      }
    }
  );
}

// 处理DDNS的间隔输入
async function handleIntervalForDDNS(ctx, session) {
  const intervalText = ctx.message.text.trim();
  let interval = 60; // 默认60秒
  
  if (intervalText !== '') {
    const parsedInterval = parseInt(intervalText);
    if (isNaN(parsedInterval) || parsedInterval < 10) {
      await ctx.reply('请输入有效的间隔时间，最小为10秒。');
      return;
    }
    interval = parsedInterval;
  }
  
  await setupDDNS(ctx, session, interval);
}

// 设置DDNS的通用函数
async function setupDDNS(ctx, session, interval) {
  try {
    const { getCurrentIPv4, getCurrentIPv6 } = require('../utils/ip');
    const { startDDNS } = require('../services/ddns');
    
    // 获取当前IP
    const currentIP = await getCurrentIPv4();
    let currentIPv6 = null;
    try {
      currentIPv6 = await getCurrentIPv6();
    } catch (error) {
      // IPv6可能不可用，忽略错误
    }
    
    // 启动DDNS服务，传递telegram对象而不是bot
    const ddnsSession = startDDNS(ctx.chat.id, session.domain, interval, ctx.telegram);
    
    await ctx.reply(
      `✅ DDNS已设置成功！\n\n` +
      `域名: ${session.domain}\n` +
      `当前IPv4: ${currentIP}\n` +
      `当前IPv6: ${currentIPv6}\n` +
      `刷新间隔: ${interval}秒\n\n` +
      `系统将自动检测IP变化并更新DNS记录。\n` +
      `使用 /ddnsstatus 查看DDNS状态\n` +
      `使用 /stopddns 停止DDNS任务`
    );
    
    // 清除会话
    userSessions.delete(ctx.chat.id);
  } catch (error) {
    await ctx.reply(`设置DDNS失败: ${error.message}`);
    userSessions.delete(ctx.chat.id);
  }
}

module.exports = { setupMessageHandlers, displayDnsRecordsPage, queryDomainRecords, setupDDNS };
