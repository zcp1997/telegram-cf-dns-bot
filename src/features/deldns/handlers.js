const { trackDelDnsMessage, createDelDnsReply } = require('./utils');
const { getDnsRecord } = require('../../services/cloudflare');
const { SessionState, userSessions } = require('../core/session');

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

module.exports = {
  handleSubdomainForDelete
};