const { userSessions, SessionState } = require('../core/session');
const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { DNS_RECORDS_PAGE_SIZE } = require('../../config');
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

module.exports = {
  command,
  commandAll,
  trackGetDnsMessage,
  createGetDnsReply,
  deleteGetDnsProcessMessages,
  displayDnsRecordsPage,
  queryDomainRecords
};