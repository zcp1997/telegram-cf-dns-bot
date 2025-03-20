const { userSessions } = require('../core/session');
const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');
const { getCurrentIPv4, getCurrentIPv6 } = require('../../utils/ip');
const { startDDNS } = require('../../services/ddns');

const commands = [
  { command: 'ddns', description: '设置自动DDNS' },
  { command: 'ddnsstatus', description: '查看DDNS任务状态' },
  { command: 'stopddns', description: '停止DDNS任务' },
  { command: 'delddns', description: '删除DDNS任务' },
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
  try {
    // 获取当前IP
    const currentIP = await getCurrentIPv4();
    let currentIPv6 = null;
    try {
      currentIPv6 = await getCurrentIPv6();
    } catch (error) {
      // IPv6可能不可用，忽略错误
    }
    
    // 启动DDNS服务，传递telegram对象而不是bot
    startDDNS(ctx.chat.id, session.domain, interval, ctx.telegram);
    
    await ctx.reply(
      `✅ DDNS已设置成功！\n\n` +
      `域名: ${session.domain}\n` +
      `当前IPv4: ${currentIP}\n` +
      `当前IPv6: ${currentIPv6}\n` +
      `刷新间隔: ${interval}秒\n\n` +
      `系统将自动检测IP变化并更新DNS记录。\n` +
      `使用 /ddnsstatus 查看DDNS状态\n` +
      `使用 /stopddns 停止DDNS任务`
    );

    await deleteDDNSProcessMessages(ctx);
    // 清除会话
    userSessions.delete(ctx.chat.id);
  } catch (error) {
    await ctx.reply(`设置DDNS失败: ${error.message}`);
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