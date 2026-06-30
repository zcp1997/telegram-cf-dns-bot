const { userSessions } = require('../core/session');
const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { getCurrentIPv4, getCurrentIPv6 } = require('../../utils/ip');
const { startDDNS } = require('../../services/ddns');
const { t } = require('../../i18n');

const commands = [
  { command: 'ddns', description: t('ddns.command.setup.description') },
  { command: 'ddnsstatus', description: t('ddns.command.status.description') },
  { command: 'stopddns', description: t('ddns.command.stop.description') },
];

// 为数组添加命令引用
commands.forEach(cmd => {
  commands[cmd.command + '_command'] = cmd;
});

// 创建命令特定的跟踪函数
function trackDDNSMessage(ctx) {
  return trackContextMessage(ctx, commands.ddns_command.command);
}

// 创建命令特定的回复函数
function createDDNSTrackedReply(ctx) {
  return createTrackedReply(ctx, commands.ddns_command.command);
}

function deleteDDNSProcessMessages(ctx, excludeMessageId = null) {
  return deleteProcessMessages(ctx.telegram, ctx.chat.id, commands.ddns_command.command, excludeMessageId);
}

// 设置DDNS的通用函数
async function setupDDNS(ctx, session, interval) {
  let statusMessage = null;
  
  try {
    // 发送初始状态消息
    statusMessage = await ctx.reply(t('ddns.setupStarting'));

    // 并行获取IPv4和IPv6
    const [ipv4Promise, ipv6Promise] = [
      getCurrentIPv4(),
      getCurrentIPv6().catch(() => t('ddns.ipv6Unavailable')) // 如果获取IPv6失败，返回"不可用"
    ];
    
    // 更新状态消息
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      t('ddns.setupPreparing')
    );

    // 等待IP获取完成
    const [currentIP, currentIPv6] = await Promise.all([ipv4Promise, ipv6Promise]);
    
    // 更新状态
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      t('ddns.setupLaunching')
    );
    
    // 启动DDNS服务
    startDDNS(ctx.chat.id, session.domain, interval, ctx.telegram);
    
    // 更新为完成状态
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      t('ddns.setupComplete', {
        domain: session.domain,
        ipv4: currentIP,
        ipv6: currentIPv6,
        interval,
      })
    );

    await deleteDDNSProcessMessages(ctx, statusMessage.message_id);
    // 清除会话
    userSessions.delete(ctx.chat.id);
  } catch (error) {
    // 错误处理，更新状态消息或发送新消息
    if (statusMessage) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        null,
        t('ddns.setupFailed', { message: error.message })
      ).catch(() => {
        // 如果编辑失败，发送新消息
        ctx.reply(t('ddns.setupFailed', { message: error.message }));
      });
    } else {
      await ctx.reply(t('ddns.setupFailed', { message: error.message }));
    }
    userSessions.delete(ctx.chat.id);
  }
}

module.exports = {
  commands,
  trackDDNSMessage,
  createDDNSTrackedReply,
  deleteDDNSProcessMessages,
  setupDDNS
};
