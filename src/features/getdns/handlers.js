const { userSessions, SessionState } = require('../core/session');
const { validateDnsRecordContent } = require('../../services/validation');
const { trackGetDnsMessage, createGetDnsReply, queryDomainRecords, displayDomainsPage } = require('./utils');
const { getConfiguredDomains } = require('../../utils/domain');

// 处理新内容输入（IP地址、域名或文本）
async function handleDnsUpdateIpInput(ctx, session) {
  trackGetDnsMessage(ctx);
  const inputContent = ctx.message.text.trim();
  const record = session.selectedRecord;

  // 根据记录类型验证输入内容
  const validationResult = validateDnsRecordContent(inputContent, record.type);
  if (!validationResult.success) {
    await createGetDnsReply(ctx)(validationResult.message);
    return;
  }

  // 对于IP记录，检查IP类型是否与记录类型匹配
  if ((record.type === 'A' || record.type === 'AAAA') && record.type !== validationResult.type) {
    await createGetDnsReply(ctx)(
      `输入的IP类型 (${validationResult.type}) 与记录类型 (${record.type}) 不匹配。\n` +
      `请输入正确类型的${record.type === 'A' ? 'IPv4' : 'IPv6'}地址。`
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

  session.newIpAddress = inputContent; // 保持变量名不变，但现在可以是IP、域名或文本
  
  // TXT记录不支持代理，直接更新
  if (record.type === 'TXT') {
    session.state = SessionState.WAITING_NEW_PROXY;
    
    // 直接执行更新，TXT记录不需要选择代理状态
    const { updateDnsRecord } = require('../../services/cloudflare');
    
    await createGetDnsReply(ctx)(`正在更新 ${record.name} 的TXT记录...`);
    
    try {
      await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        inputContent,
        record.type,
        false, // TXT记录不支持代理
        record
      );
      await ctx.reply(`DNS记录已成功更新: ${record.name}`);
      const { deleteGetDnsProcessMessages } = require('./utils');
      await deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      let errorMessage = `更新过程中发生错误: ${error.message}`;
      if (error.response) {
        errorMessage += ` (状态码: ${error.response.status})`;
      }
      await ctx.reply(errorMessage);
      console.error('更新DNS记录时出错:', error);
    }
    
    userSessions.delete(ctx.chat.id);
    return;
  }
  
  // 对于支持代理的记录类型，询问代理设置
  session.state = SessionState.WAITING_NEW_PROXY;

  let contentTypeLabel = '内容';
  if (record.type === 'A' || record.type === 'AAAA') {
    contentTypeLabel = 'IP地址';
  } else if (record.type === 'CNAME') {
    contentTypeLabel = '目标域名';
  }

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