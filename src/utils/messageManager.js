/**
 * 消息管理器
 * 用于跟踪和管理对话中的消息，方便在流程结束时清理
 */

// 存储每个聊天的消息ID
const chatMessages = new Map();

/**
 * 添加消息到跟踪列表
 * @param {number} chatId - 聊天ID
 * @param {number} messageId - 消息ID
 * @param {string} [operationType] - 操作类型，如 'setdns', 'getdns' 等
 */
function trackMessage(chatId, messageId, operationType = 'default') {
  if (!chatMessages.has(chatId)) {
    chatMessages.set(chatId, new Map());
  }
  
  const chatOperations = chatMessages.get(chatId);
  
  if (!chatOperations.has(operationType)) {
    chatOperations.set(operationType, new Set());
  }
  
  chatOperations.get(operationType).add(messageId);
}

/**
 * 从特定操作中删除消息ID
 * @param {number} chatId - 聊天ID
 * @param {number} messageId - 消息ID
 * @param {string} [operationType] - 操作类型
 */
function untrackMessage(chatId, messageId, operationType = 'default') {
  if (!chatMessages.has(chatId)) return;
  
  const chatOperations = chatMessages.get(chatId);
  if (!chatOperations.has(operationType)) return;
  
  chatOperations.get(operationType).delete(messageId);
  
  // 如果操作类型下没有消息了，清理它
  if (chatOperations.get(operationType).size === 0) {
    chatOperations.delete(operationType);
  }
  
  // 如果聊天没有任何操作了，清理它
  if (chatOperations.size === 0) {
    chatMessages.delete(chatId);
  }
}

/**
 * 删除一个聊天中特定操作类型的所有消息
 * @param {object} telegram - Telegram 实例
 * @param {number} chatId - 聊天ID
 * @param {string} [operationType] - 操作类型
 * @param {number} [excludeMessageId] - 要排除的消息ID（通常是当前回调消息）
 * @returns {Promise<{success: number, failed: number}>} - 删除结果统计
 */
async function deleteProcessMessages(telegram, chatId, operationType = 'default', excludeMessageId = null) {
  if (!chatMessages.has(chatId)) return { success: 0, failed: 0 };
  
  const chatOperations = chatMessages.get(chatId);
  if (!chatOperations.has(operationType)) return { success: 0, failed: 0 };
  
  const messageIds = chatOperations.get(operationType);
  let successCount = 0;
  let failedCount = 0;
  
  for (const msgId of messageIds) {
    // 跳过被排除的消息ID
    if (excludeMessageId === msgId) continue;
    
    try {
      await telegram.deleteMessage(chatId, msgId);
      successCount++;
    } catch (error) {
      console.log(`删除消息ID ${msgId} 失败: ${error.message}`);
      failedCount++;
    }
  }
  
  // 清理这个操作类型的所有消息跟踪
  chatOperations.delete(operationType);
  
  // 如果聊天没有任何操作了，清理它
  if (chatOperations.size === 0) {
    chatMessages.delete(chatId);
  }
  
  return { success: successCount, failed: failedCount };
}

/**
 * 为特定上下文和操作创建一个增强版的reply方法
 * 这个方法会自动跟踪发送的消息
 * @param {object} ctx - Telegram 上下文
 * @param {string} operationType - 操作类型
 * @returns {Function} - 增强版的reply方法
 */
function createTrackedReply(ctx, operationType) {
  return async function trackedReply(text, extra = {}) {
    const sentMsg = await ctx.reply(text, extra);
    trackMessage(ctx.chat.id, sentMsg.message_id, operationType);
    return sentMsg;
  };
}

module.exports = {
  trackMessage,
  untrackMessage,
  deleteProcessMessages,
  createTrackedReply
}; 