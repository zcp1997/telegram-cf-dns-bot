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
  let statusMessage = null;
  
  try {
    // 发送初始状态消息
    statusMessage = await ctx.reply(
      `⏳ 正在启动DDNS配置...\n` +
      `步骤1/3: 正在获取当前IP地址...`
    );

    // 并行获取IPv4和IPv6
    const [ipv4Promise, ipv6Promise] = [
      getCurrentIPv4(),
      getCurrentIPv6().catch(() => '不可用') // 如果获取IPv6失败，返回"不可用"
    ];
    
    // 更新状态消息
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      `⏳ 正在启动DDNS配置...\n` +
      `步骤1/3: 正在获取当前IP地址...\n` +
      `步骤2/3: 正在准备DDNS服务...`
    );

    // 等待IP获取完成
    const [currentIP, currentIPv6] = await Promise.all([ipv4Promise, ipv6Promise]);
    
    // 更新状态
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      `⏳ 正在启动DDNS配置...\n` +
      `步骤1/3: IP地址获取成功 ✓\n` +
      `步骤2/3: 准备DDNS服务 ✓\n` +
      `步骤3/3: 正在启动DDNS服务...`
    );
    
    // 启动DDNS服务
    startDDNS(ctx.chat.id, session.domain, interval, ctx.telegram);
    
    // 更新为完成状态
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      null,
      `✅ DDNS配置已完成！\n\n` +
      `域名: ${session.domain}\n` +
      `当前IPv4: ${currentIP}\n` +
      `当前IPv6: ${currentIPv6}\n` +
      `刷新间隔: ${interval}秒\n\n` +
      `系统将自动检测IP变化并更新DNS记录。\n` +
      `使用 /ddnsstatus 查看DDNS状态\n` +
      `使用 /stopddns 停止DDNS任务`
    );

    //await deleteDDNSProcessMessages(ctx, statusMessage.message_id);
    // 清除会话
    userSessions.delete(ctx.chat.id);
  } catch (error) {
    // 错误处理，更新状态消息或发送新消息
    if (statusMessage) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        null,
        `❌ DDNS配置失败: ${error.message}\n`
      ).catch(() => {
        // 如果编辑失败，发送新消息
        ctx.reply(`❌ DDNS配置失败: ${error.message}`);
      });
    } else {
      await ctx.reply(`❌ DDNS配置失败: ${error.message}`);
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