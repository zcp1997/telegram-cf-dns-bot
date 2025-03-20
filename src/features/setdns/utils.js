const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');

const command = {
  command: 'setdns',
  description: '添加/更新DNS记录'
};

// 创建命令特定的跟踪函数
function trackSetDnsMessage(ctx) {
  return trackContextMessage(ctx, command.command);
}

// 创建命令特定的回复函数
function createSetDnsReply(ctx) {
  return createTrackedReply(ctx, command.command);
}

function deleteSetDnsProcessMessages(ctx, excludeMessageId = null) {
  return deleteProcessMessages(ctx.telegram, ctx.chat.id, command.command, excludeMessageId);
}

module.exports = {
  command,
  trackSetDnsMessage,
  createSetDnsReply,
  deleteSetDnsProcessMessages
}; 