const { SessionState } = require('../core/session');
const { validateDnsRecordContent } = require('../../services/validation');
const { trackSetDnsMessage, createSetDnsReply } = require('./utils');
const { getConfiguredDomains } = require('../../utils/domain');
const { t } = require('../../i18n');

function getRecordTypeKeyboard() {
  return [
    [
      { text: t('setdns.recordType.a'), callback_data: 'select_record_type_A' },
      { text: t('setdns.recordType.aaaa'), callback_data: 'select_record_type_AAAA' }
    ],
    [
      { text: t('setdns.recordType.cname'), callback_data: 'select_record_type_CNAME' },
      { text: t('setdns.recordType.txt'), callback_data: 'select_record_type_TXT' }
    ],
    [
      { text: t('common.cancelOperation'), callback_data: 'cancel_setdns' }
    ]
  ];
}

function getRecordTypeLabel(recordType, compact = false) {
  if (recordType === 'A') return compact ? '4️⃣ IPv4' : '4️⃣ IPv4';
  if (recordType === 'AAAA') return compact ? '6️⃣ IPv6' : '6️⃣ IPv6';
  if (recordType === 'CNAME') return '🔗 CNAME';
  if (recordType === 'TXT') return '📄 TXT';
  return recordType;
}

// 处理记录内容输入
async function handleRecordContentInput(ctx, session) {
  trackSetDnsMessage(ctx);
  const inputContent = ctx.message.text.trim();
  const recordType = session.recordType;

  // 根据记录类型验证输入内容
  const validationResult = validateDnsRecordContent(inputContent, recordType);
  if (!validationResult.success) {
    await createSetDnsReply(ctx)(validationResult.message);
    return;
  }

  // 对于CNAME记录，使用验证后清理的域名
  if (recordType === 'CNAME' && validationResult.domain) {
    session.recordContent = validationResult.domain;
  } else {
    session.recordContent = inputContent;
  }
  
  // TXT记录不支持代理，直接设置
  if (recordType === 'TXT') {
    session.proxied = false;
    await executeSetDns(ctx, session);
    return;
  }

  // 对于支持代理的记录类型，询问代理设置
  session.state = SessionState.WAITING_PROXY;

  let typeLabel = recordType;
  if (recordType === 'A') typeLabel = '4️⃣ IPv4';
  else if (recordType === 'AAAA') typeLabel = '6️⃣ IPv6';
  else if (recordType === 'CNAME') typeLabel = '🔗 CNAME';

  await createSetDnsReply(ctx)(
    t('setdns.proxyPrompt', {
      typeLabel,
      content: inputContent,
      domain: session.domain
    }),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t('setdns.proxyNo'), callback_data: 'proxy_no' },
            { text: t('setdns.proxyYes'), callback_data: 'proxy_yes' }
          ],
          [
            { text: t('common.cancelOperation'), callback_data: 'cancel_setdns' }
          ]
        ]
      }
    }
  );
}

// 执行DNS设置的通用函数
async function executeSetDns(ctx, session) {
  const { createOrUpdateDns } = require('../../services/cloudflare');
  const { deleteSetDnsProcessMessages } = require('./utils');
  
  const typeLabel = getRecordTypeLabel(session.recordType, true);
  const proxyStatus = session.proxied ? t('setdns.proxyEnabled') : t('setdns.proxyDisabled');

  await createSetDnsReply(ctx)(
    t('setdns.setting', {
      domain: session.domain,
      typeLabel,
      content: session.recordContent,
      proxyStatus
    })
  );

  try {
    const result = await createOrUpdateDns(
      session.domain,
      session.recordContent,
      session.recordType,
      session.proxied
    );
    
    await ctx.reply(
      t('setdns.success', {
        domain: session.domain,
        typeLabel,
        content: session.recordContent,
        proxyStatus,
        message: result.message || t('setdns.defaultSuccessMessage')
      })
    );
    
    await deleteSetDnsProcessMessages(ctx);
  } catch (error) {
    let errorMessage = t('setdns.failed', { message: error.message });
    if (error.response) {
      errorMessage += t('setdns.statusCode', { status: error.response.status });
    }
    await ctx.reply(errorMessage);
    console.error('Failed to set DNS record:', error);
  }

  const { userSessions } = require('../core/session');
  userSessions.delete(ctx.chat.id);
}


// 处理设置DNS的子域名输入
async function handleSubdomainForSet(ctx, session) {
  trackSetDnsMessage(ctx);
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  session.domain = fullDomain;
  session.state = SessionState.SELECTING_RECORD_TYPE_FOR_SET;

  await createSetDnsReply(ctx)(
    t('setdns.selectRecordType', { domain: fullDomain }),
    {
      reply_markup: {
        inline_keyboard: getRecordTypeKeyboard()
      }
    }
  );
}


// 处理搜索关键字输入
async function handleSearchKeywordInputForSet(ctx, session) {
  trackSetDnsMessage(ctx);
  const searchKeyword = ctx.message.text.trim();

  // 限制搜索关键字长度
  if (searchKeyword.length > 50) {
    await createSetDnsReply(ctx)(t('setdns.keywordTooLong'));
    return;
  }

  // 检查是否为空
  if (searchKeyword === '') {
    await createSetDnsReply(ctx)(t('setdns.keywordEmpty'));
    return;
  }

  // 更新会话状态
  session.searchKeyword = searchKeyword;
  session.currentPage = 0;
  session.state = SessionState.SELECTING_DOMAIN_FOR_SET;
  session.lastUpdate = Date.now();

  try {
    const { displayDomainsPage } = require('./utils');
    const domains = await getConfiguredDomains();
    await displayDomainsPage(ctx, domains, 0, searchKeyword);
  } catch (error) {
    await createSetDnsReply(ctx)(t('setdns.searchFailed', { message: error.message }));
  }
}

module.exports = {
  handleRecordContentInput,
  handleSubdomainForSet,
  executeSetDns,
  handleSearchKeywordInputForSet
};
