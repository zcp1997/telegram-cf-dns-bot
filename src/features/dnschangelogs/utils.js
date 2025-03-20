const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');

const command = {
  command: 'dnschangelogs',
  description: '查看DNS记录变更日志'
};

// 创建命令特定的跟踪函数
function trackDnsLogsMessage(ctx) {
  return trackContextMessage(ctx, command.command);
}

// 创建命令特定的回复函数
function createDnsLogsReply(ctx) {
  return createTrackedReply(ctx, command.command);
}

function deleteDnsLogsProcessMessages(ctx, excludeMessageId = null) {
  return deleteProcessMessages(ctx.telegram, ctx.chat.id, command.command, excludeMessageId);
}

module.exports = {
  command,
  trackDnsLogsMessage,
  createDnsLogsReply,
  deleteDnsLogsProcessMessages
}; 