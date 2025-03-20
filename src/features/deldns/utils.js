const { trackContextMessage, createTrackedReply, deleteProcessMessages } = require('../../utils/messageManager');

const command = {
  command: 'deldns',
  description: '删除DNS记录'
};

// 创建命令特定的跟踪函数
function trackDelDnsMessage(ctx) {
  return trackContextMessage(ctx, command.command);
}

// 创建命令特定的回复函数
function createDelDnsReply(ctx) {
  return createTrackedReply(ctx, command.command);
}

function deleteDelDnsProcessMessages(ctx, excludeMessageId = null) {
  return deleteProcessMessages(ctx.telegram, ctx.chat.id, command.command, excludeMessageId);
}

module.exports = {
  command,
  trackDelDnsMessage,
  createDelDnsReply,
  deleteDelDnsProcessMessages
}; 