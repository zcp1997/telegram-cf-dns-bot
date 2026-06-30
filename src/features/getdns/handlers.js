const { userSessions, SessionState } = require('../core/session');
const { validateDnsRecordContent } = require('../../services/validation');
const { trackGetDnsMessage, createGetDnsReply, queryDomainRecords, displayDomainsPage } = require('./utils');
const { getConfiguredDomains } = require('../../utils/domain');
const { t } = require('../../i18n');

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
      t('getdns.queryError', {
        message: `IP type ${validationResult.type} does not match record type ${record.type}`
      })
    );
    return;
  }

  // 确保记录包含必要的字段
  if (!record.zone_id || !record.id) {
    console.log('记录信息:', JSON.stringify(record));
    await createGetDnsReply(ctx)(t('getdns.incompleteRecordUser'));
    userSessions.delete(ctx.chat.id);
    return;
  }

  session.newIpAddress = inputContent; // 保持变量名不变，但现在可以是IP、域名或文本
  
  // TXT记录不支持代理，直接更新
  if (record.type === 'TXT') {
    session.state = SessionState.WAITING_NEW_PROXY;
    
    // 直接执行更新，TXT记录不需要选择代理状态
    const { updateDnsRecord } = require('../../services/cloudflare');
    
    await createGetDnsReply(ctx)(t('getdns.updatingTxt', { domain: record.name }));
    
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
      await ctx.reply(t('getdns.updated', { domain: record.name }));
      const { deleteGetDnsProcessMessages } = require('./utils');
      await deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      let errorMessage = t('getdns.updateError', { message: error.message });
      if (error.response) {
        errorMessage += t('getdns.statusCode', { status: error.response.status });
      }
      await ctx.reply(errorMessage);
      console.error('更新DNS记录时出错:', error);
    }
    
    userSessions.delete(ctx.chat.id);
    return;
  }
  
  // 对于支持代理的记录类型，询问代理设置
  session.state = SessionState.WAITING_NEW_PROXY;

  await createGetDnsReply(ctx)(
    t('getdns.proxyPrompt', {
      domain: record.name,
      currentStatus: record.proxied ? t('getdns.proxyEnabled') : t('getdns.proxyDisabled')
    }),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t('getdns.proxyNo'), callback_data: 'dns_update_proxy_no' },
            { text: t('getdns.proxyYes'), callback_data: 'dns_update_proxy_yes' }
          ],
          [
            { text: t('common.cancelOperation'), callback_data: 'cancel_update_dns' }
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
    await createGetDnsReply(ctx)(t('getdns.keywordTooLong'));
    return;
  }

  // 检查是否为空
  if (searchKeyword === '') {
    await createGetDnsReply(ctx)(t('getdns.keywordEmpty'));
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
    await createGetDnsReply(ctx)(t('getdns.invalidSessionState'));
    userSessions.delete(ctx.chat.id);
    return;
  }

  session.state = targetState;
  session.lastUpdate = Date.now();

  try {
    const domains = await getConfiguredDomains();
    await displayDomainsPage(ctx, domains, 0, commandType, searchKeyword);
  } catch (error) {
    await createGetDnsReply(ctx)(t('getdns.searchFailed', { message: error.message }));
  }
}

module.exports = {
  handleDnsUpdateIpInput,
  handleSubdomainInput,
  handleSearchKeywordInput
};
