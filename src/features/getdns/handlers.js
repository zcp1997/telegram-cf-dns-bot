const { userSessions, SessionState } = require('../core/session');
const { validateIpAddress } = require('../../services/validation');
const { trackGetDnsMessage, createGetDnsReply, queryDomainRecords, displayDomainsPage } = require('./utils');
const { getConfiguredDomains } = require('../../utils/domain');

// 处理新IP地址输入
async function handleDnsUpdateIpInput(ctx, session) {
  trackGetDnsMessage(ctx);
  const ipAddress = ctx.message.text.trim();

  const validationResult = validateIpAddress(ipAddress);
  if (!validationResult.success) {
    await createGetDnsReply(ctx)(validationResult.message);
    return;
  }

  const recordType = validationResult.type;
  const record = session.selectedRecord;

  // 检查IP类型是否与记录类型匹配
  if (record.type !== recordType) {
    await createGetDnsReply(ctx)(
      `输入的IP类型 (${recordType}) 与记录类型 (${record.type}) 不匹配。\n` +
      `请输入正确类型的IP地址。`
    );
    return;
  }

  // 确保记录包含必要的字段
  if (!record.zone_id || !record.id) {
    console.log('记录信息:', JSON.stringify(record));
    await createGetDnsReply(ctx)('记录信息不完整，无法更新。请联系管理员。');
    userSessions.delete(ctx.chat.id);
    return;
  }

  session.newIpAddress = ipAddress;
  session.state = SessionState.WAITING_NEW_PROXY;

  await createGetDnsReply(ctx)(
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

async function handleSubdomainInput(ctx, session) {
  const prefix = ctx.message.text.trim();

  // 如果用户输入点号，直接查询根域名
  if (prefix === '.') {
    await queryDomainRecords(ctx, session.rootDomain);
    return;
  }

  // 构建完整域名
  const fullDomain = prefix === '' ? session.rootDomain : `${prefix}.${session.rootDomain}`;
  await queryDomainRecords(ctx, fullDomain);
}

// 处理搜索关键字输入
async function handleSearchKeywordInput(ctx, session) {
  trackGetDnsMessage(ctx);
  const searchKeyword = ctx.message.text.trim();

  // 限制搜索关键字长度
  if (searchKeyword.length > 50) {
    await createGetDnsReply(ctx)('搜索关键字过长，请输入不超过50个字符的关键字。');
    return;
  }

  // 检查是否为空
  if (searchKeyword === '') {
    await createGetDnsReply(ctx)('搜索关键字不能为空，请重新输入。');
    return;
  }

  // 更新会话状态
  session.searchKeyword = searchKeyword;
  session.currentPage = 0;

  // 根据当前状态判断是哪种命令类型
  let commandType, targetState;
  if (session.state === SessionState.WAITING_SEARCH_KEYWORD_FOR_QUERY) {
    commandType = 'query';
    targetState = SessionState.SELECTING_DOMAIN_FOR_QUERY;
  } else if (session.state === SessionState.WAITING_SEARCH_KEYWORD_FOR_ALL) {
    commandType = 'all';
    targetState = SessionState.SELECTING_DOMAIN_FOR_ALL_DNS;
  } else {
    await createGetDnsReply(ctx)('会话状态错误，请重新开始。');
    userSessions.delete(ctx.chat.id);
    return;
  }

  session.state = targetState;
  session.lastUpdate = Date.now();

  try {
    const domains = await getConfiguredDomains();
    await displayDomainsPage(ctx, domains, 0, commandType, searchKeyword);
  } catch (error) {
    await createGetDnsReply(ctx)(`搜索域名失败: ${error.message}`);
  }
}

module.exports = {
  handleDnsUpdateIpInput,
  handleSubdomainInput,
  handleSearchKeywordInput
};