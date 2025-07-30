const { SessionState } = require('../core/session');
const { validateDnsRecordContent } = require('../../services/validation');
const { trackSetDnsMessage, createSetDnsReply } = require('./utils');

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

  session.recordContent = inputContent;
  
  // TXT记录不支持代理，直接设置
  if (recordType === 'TXT') {
    session.proxied = false;
    await executeSetDns(ctx, session);
    return;
  }

  // 对于支持代理的记录类型，询问代理设置
  session.state = SessionState.WAITING_PROXY;

  let typeLabel = recordType;
  if (recordType === 'A') typeLabel = '4️⃣ IPv4地址';
  else if (recordType === 'AAAA') typeLabel = '6️⃣ IPv6地址';
  else if (recordType === 'CNAME') typeLabel = '🔗 域名别名';

  await createSetDnsReply(ctx)(
    `✅ ${typeLabel}已设置为: ${inputContent}\n\n` +
    `是否为 ${session.domain} 启用 Cloudflare 代理？\n\n` +
    `🔒 代理功能可以隐藏真实IP并提供DDoS防护\n` +
    `⚠️ 某些服务（如SSH、FTP等）需要关闭代理才能正常使用`,
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

// 执行DNS设置的通用函数
async function executeSetDns(ctx, session) {
  const { createOrUpdateDns } = require('../../services/cloudflare');
  const { deleteSetDnsProcessMessages } = require('./utils');
  
  let typeLabel = session.recordType;
  if (session.recordType === 'A') typeLabel = '4️⃣ IPv4';
  else if (session.recordType === 'AAAA') typeLabel = '6️⃣ IPv6';
  else if (session.recordType === 'CNAME') typeLabel = '🔗 CNAME';
  else if (session.recordType === 'TXT') typeLabel = '📄 TXT';

  await createSetDnsReply(ctx)(
    `⏳ 正在设置DNS记录...\n\n` +
    `📍 域名: ${session.domain}\n` +
    `📋 类型: ${typeLabel}\n` +
    `📝 内容: ${session.recordContent}\n` +
    `🔒 代理: ${session.proxied ? '已启用' : '未启用'}`
  );

  try {
    const result = await createOrUpdateDns(
      session.domain,
      session.recordContent,
      session.recordType,
      session.proxied
    );
    
    await ctx.reply(
      `🎉 DNS记录设置成功！\n\n` +
      `📍 域名: ${session.domain}\n` +
      `📋 类型: ${typeLabel}\n` +
      `📝 内容: ${session.recordContent}\n` +
      `🔒 代理: ${session.proxied ? '已启用' : '未启用'}\n\n` +
      `${result.message || '记录已添加到Cloudflare'}`
    );
    
    await deleteSetDnsProcessMessages(ctx);
  } catch (error) {
    let errorMessage = `❌ 设置DNS记录失败: ${error.message}`;
    if (error.response) {
      errorMessage += ` (状态码: ${error.response.status})`;
    }
    await ctx.reply(errorMessage);
    console.error('设置DNS记录时出错:', error);
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
    `📋 请选择要为 ${fullDomain} 设置的DNS记录类型：\n\n` +
    `4️⃣ A记录 - IPv4地址（如：192.168.1.1）\n` +
    `6️⃣ AAAA记录 - IPv6地址（如：2001:db8::1）\n` +
    `🔗 CNAME记录 - 域名别名（如：example.com）\n` +
    `📄 TXT记录 - 文本记录（如：验证码、SPF等）`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '4️⃣ A记录 (IPv4)', callback_data: 'select_record_type_A' },
            { text: '6️⃣ AAAA记录 (IPv6)', callback_data: 'select_record_type_AAAA' }
          ],
          [
            { text: '🔗 CNAME记录', callback_data: 'select_record_type_CNAME' },
            { text: '📄 TXT记录', callback_data: 'select_record_type_TXT' }
          ],
          [
            { text: '取消操作', callback_data: 'cancel_setdns' }
          ]
        ]
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
    await createSetDnsReply(ctx)('搜索关键字过长，请输入不超过50个字符的关键字。');
    return;
  }

  // 检查是否为空
  if (searchKeyword === '') {
    await createSetDnsReply(ctx)('搜索关键字不能为空，请重新输入。');
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
    await createSetDnsReply(ctx)(`搜索域名失败: ${error.message}`);
  }
}

module.exports = {
  handleRecordContentInput,
  handleSubdomainForSet,
  executeSetDns,
  handleSearchKeywordInputForSet
};