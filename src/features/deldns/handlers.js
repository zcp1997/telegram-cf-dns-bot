const { trackDelDnsMessage, createDelDnsReply } = require('./utils');
const { getDnsRecord } = require('../../services/cloudflare');
const { SessionState, userSessions } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');

// 处理删除DNS的子域名输入
async function handleSubdomainForDelete(ctx, session) {
  trackDelDnsMessage(ctx);
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  try {
    const { records } = await getDnsRecord(fullDomain);
    if (!records || records.length === 0) {
      await createDelDnsReply(ctx)(
        `未找到 ${fullDomain} 的DNS记录\n\n` +
        `请重新输入要删除的域名，或直接发送 "." 删除根域名。\n\n` +
        `支持的记录类型: 4️⃣A 6️⃣AAAA 🔗CNAME 📄TXT\n\n` +
        `示例：\n` +
        `• 输入 "api" → 删除 api.${session.rootDomain}\n` +
        `• 输入 "." → 删除 ${session.rootDomain}`,
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

    await createDelDnsReply(ctx)(
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
    await createDelDnsReply(ctx)(`查询DNS记录时发生错误: ${error.message}`);
    userSessions.delete(ctx.chat.id);
  }
}

// 处理搜索关键字输入
async function handleSearchKeywordInputForDelete(ctx, session) {
  trackDelDnsMessage(ctx);
  const searchKeyword = ctx.message.text.trim();

  // 限制搜索关键字长度
  if (searchKeyword.length > 50) {
    await createDelDnsReply(ctx)('搜索关键字过长，请输入不超过50个字符的关键字。');
    return;
  }

  // 检查是否为空
  if (searchKeyword === '') {
    await createDelDnsReply(ctx)('搜索关键字不能为空，请重新输入。');
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
    await createDelDnsReply(ctx)(`搜索域名失败: ${error.message}`);
  }
}

module.exports = {
  handleSubdomainForDelete,
  handleSearchKeywordInputForDelete
};