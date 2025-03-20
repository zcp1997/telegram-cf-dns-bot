const { SessionState } = require('../core/session');
const { validateIpAddress } = require('../../services/validation');
const { trackSetDnsMessage, createSetDnsReply } = require('./utils');

// 处理IP地址输入
async function handleIpInput(ctx, session) {
  // 跟踪用户输入消息
  trackSetDnsMessage(ctx);
  const ipAddress = ctx.message.text.trim();

  const validationResult = validateIpAddress(ipAddress);
  if (!validationResult.success) {
    await createSetDnsReply(ctx)(validationResult.message);
    return;
  }

  const recordType = validationResult.type;

  session.ipAddress = ipAddress;
  session.recordType = recordType;
  session.state = SessionState.WAITING_PROXY;

  await createSetDnsReply(ctx)(
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


// 处理设置DNS的子域名输入
async function handleSubdomainForSet(ctx, session) {
  trackSetDnsMessage(ctx);
  const prefix = ctx.message.text.trim();
  const fullDomain = prefix === '.' ? session.rootDomain : `${prefix}.${session.rootDomain}`;

  session.domain = fullDomain;
  session.state = SessionState.WAITING_IP;

  await createSetDnsReply(ctx)(
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
}


module.exports = {
  handleIpInput,
  handleSubdomainForSet
};