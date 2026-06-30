const { trackDelDnsMessage, createDelDnsReply } = require('./utils');
const { getDnsRecord } = require('../../services/cloudflare');
const { SessionState, userSessions } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { t } = require('../../i18n');

function formatRecordsInfo(records) {
  return records.map(record => t('deldns.recordInfo', {
    type: record.type,
    content: record.content
  })).join('\n\n');
}

// 处理删除DNS的子域名输入
async function handleSubdomainForDelete(ctx, session) {
  trackDelDnsMessage(ctx);
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  try {
    const { records } = await getDnsRecord(fullDomain);
    if (!records || records.length === 0) {
      await createDelDnsReply(ctx)(
        t('deldns.noRecordsRetry', {
          domain: fullDomain,
          rootDomain: session.rootDomain
        }),
        {
          reply_markup: {
            inline_keyboard: [[
              { text: t('deldns.deleteRootDomain'), callback_data: 'del_root_domain' },
              { text: t('common.cancelOperation'), callback_data: 'cancel_deldns' }
            ]]
          }
        }
      );
      return;
    }

    session.domain = fullDomain;
    session.state = SessionState.WAITING_CONFIRM_DELETE;

    const recordsInfo = formatRecordsInfo(records);

    await createDelDnsReply(ctx)(
      t('deldns.confirmRecords', { recordsInfo }),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t('deldns.confirmDelete'), callback_data: 'confirm_delete' },
              { text: t('common.cancel'), callback_data: 'cancel_deldns' }
            ]
          ]
        }
      }
    );
  } catch (error) {
    await createDelDnsReply(ctx)(t('deldns.queryError', { message: error.message }));
    userSessions.delete(ctx.chat.id);
  }
}

// 处理搜索关键字输入
async function handleSearchKeywordInputForDelete(ctx, session) {
  trackDelDnsMessage(ctx);
  const searchKeyword = ctx.message.text.trim();

  // 限制搜索关键字长度
  if (searchKeyword.length > 50) {
    await createDelDnsReply(ctx)(t('deldns.keywordTooLong'));
    return;
  }

  // 检查是否为空
  if (searchKeyword === '') {
    await createDelDnsReply(ctx)(t('deldns.keywordEmpty'));
    return;
  }

  // 更新会话状态
  session.searchKeyword = searchKeyword;
  session.currentPage = 0;
  session.state = SessionState.SELECTING_DOMAIN_FOR_DELETE;
  session.lastUpdate = Date.now();

  try {
    const { displayDomainsPage } = require('./utils');
    const domains = await getConfiguredDomains();
    await displayDomainsPage(ctx, domains, 0, searchKeyword);
  } catch (error) {
    await createDelDnsReply(ctx)(t('deldns.searchFailed', { message: error.message }));
  }
}

module.exports = {
  handleSubdomainForDelete,
  handleSearchKeywordInputForDelete
};
