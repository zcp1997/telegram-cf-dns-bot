/**
 * 消息管理器
 * 用于跟踪和管理对话中的消息，方便在流程结束时清理
 */

// 存储每个聊天的消息ID
const chatMessages = new Map();

/**
 * 跟踪上下文中的消息（处理消息可能不存在的情况）
 * @param {object} ctx - Telegram上下文
 * @param {string|string[]} operationType - 操作类型
 */
function trackContextMessage(ctx, operationType) {
  // 只有当消息存在时才跟踪
   if (ctx.message) {
    trackMessage(ctx.chat.id, ctx.message.message_id, operationType);
  }
  
  // 或者，如果您也想跟踪回调消息
  // if (ctx.callbackQuery && ctx.callbackQuery.message) {
  //   trackMessage(ctx.chat.id, ctx.callbackQuery.message.message_id, operationType);
  // }
}

/**
 * 添加消息到跟踪列表
 * @param {number} chatId - 聊天ID
 * @param {number} messageId - 消息ID
 * @param {string|string[]} operationType - 操作类型，如 'setdns', 'getdns' 等，或者操作类型数组
 */
function trackMessage(chatId, messageId, operationType = 'default') {
  // 如果 messageId 无效，直接返回
  if (!messageId) return;
  
  if (!chatMessages.has(chatId)) {
    chatMessages.set(chatId, new Map());
  }

  const chatOperations = chatMessages.get(chatId);

  // 处理操作类型数组
  const operationTypes = Array.isArray(operationType) ? operationType : [operationType];

  for (const type of operationTypes) {
    if (!chatOperations.has(type)) {
      chatOperations.set(type, new Set());
    }

    chatOperations.get(type).add(messageId);
  }
}

/**
 * 从特定操作中删除消息ID
 * @param {number} chatId - 聊天ID
 * @param {number} messageId - 消息ID
 * @param {string|string[]} operationType - 操作类型或操作类型数组
 */
function untrackMessage(chatId, messageId, operationType = 'default') {
  if (!chatMessages.has(chatId)) return;

  const chatOperations = chatMessages.get(chatId);
  const operationTypes = Array.isArray(operationType) ? operationType : [operationType];

  for (const type of operationTypes) {
    if (chatOperations.has(type)) {
      chatOperations.get(type).delete(messageId);

      // 如果操作类型下没有消息了，清理它
      if (chatOperations.get(type).size === 0) {
        chatOperations.delete(type);
      }
    }
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
 * @param {string|string[]} operationType - 操作类型或操作类型数组
 * @param {number} [excludeMessageId] - 要排除的消息ID（通常是当前回调消息）
 * @returns {Promise<{success: number, failed: number}>} - 删除结果统计
 */
async function deleteProcessMessages(telegram, chatId, operationType = 'default', excludeMessageId = null) {
  if (!chatMessages.has(chatId)) return { success: 0, failed: 0 };

  const chatOperations = chatMessages.get(chatId);
  const operationTypes = Array.isArray(operationType) ? operationType : [operationType];

  // 收集所有要删除的消息ID（去重）
  const allMessageIdsToDelete = new Set();

  for (const type of operationTypes) {
    if (chatOperations.has(type)) {
      const messageIds = chatOperations.get(type);
      for (const msgId of messageIds) {
        if (msgId !== excludeMessageId) {
          allMessageIdsToDelete.add(msgId);
        }
      }

      // 清理这个操作类型的所有消息跟踪
      chatOperations.delete(type);
    }
  }

  // 如果聊天没有任何操作了，清理它
  if (chatOperations.size === 0) {
    chatMessages.delete(chatId);
  }

  // 执行删除操作
  let successCount = 0;
  let failedCount = 0;
  
  try {
    // 将Set转换为数组再传递给API
    await telegram.deleteMessages(chatId, Array.from(allMessageIdsToDelete));
    successCount = allMessageIdsToDelete.size;
    console.log(`删除消息ID ${Array.from(allMessageIdsToDelete).join(', ')} 成功`);
  } catch (error) {
    failedCount = allMessageIdsToDelete.size;
    console.log(`删除消息ID ${Array.from(allMessageIdsToDelete).join(', ')} 失败: ${error.message}`);
  }

  return { success: successCount, failed: failedCount };
}

/**
 * 为特定上下文和操作创建一个增强版的reply方法
 * 这个方法会自动跟踪发送的消息
 * @param {object} ctx - Telegram 上下文
 * @param {string|string[]} operationType - 操作类型或操作类型数组
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
  trackContextMessage,
  deleteProcessMessages,
  createTrackedReply,
  untrackMessage
}; 