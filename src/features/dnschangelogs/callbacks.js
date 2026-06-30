const { userSessions, SessionState } = require('../core/session');
const { deleteDnsLogsProcessMessages, createDnsLogsReply, trackDnsLogsMessage } = require('./utils');
const { getDnsLogs, getAvailableLogDates, searchDnsLogsByDomain } = require('../../utils/dnsLogger');
const { t } = require('../../i18n');

// 每页显示的日志条数
const LOGS_PER_PAGE = 5;

// 每页显示的日期数量
const DATES_PER_PAGE = 5;

// 格式化操作类型
function formatOperation(operation) {
  const key = `dnsLogs.operation.${operation}`;
  const translated = t(key);
  return translated === key ? operation : translated;
}

// 格式化日志条目
function formatLogEntry(log, options = {}) {
  let message = `⏰ ${log.timestamp}\n`;

  if (options.showDate && log.date) {
    message += `📅 ${log.date}\n`;
  }
  
  // 根据操作类型使用不同的emoji
  let operationEmoji = '🔄';
  if (log.operation === 'create') {
    operationEmoji = '➕';
  } else if (log.operation === 'delete') {
    operationEmoji = '🗑️';
  } else if (log.operation === 'update') {
    operationEmoji = '✏️';
  }
  
  message += `${operationEmoji} ${t('dnsLogs.operation')}: ${formatOperation(log.operation)}\n`;
  message += `🌐 ${t('dnsLogs.domain')}: ${log.domain}\n`;
  
  // 根据记录类型使用不同的emoji
  let typeEmoji = '📝';
  if (log.recordType === 'A') {
    typeEmoji = '4️⃣';  // IPv4
  } else if (log.recordType === 'AAAA') {
    typeEmoji = '6️⃣';  // IPv6
  }
  message += `${typeEmoji} ${t('dnsLogs.recordType')}: ${log.recordType || t('dnsLogs.na')}\n`;
  
  message += `🔢 ${t('dnsLogs.ipAddress')}: ${log.ipAddress || t('dnsLogs.na')}\n`;
  message += `☁️ ${t('dnsLogs.cfProxy')}: ${log.proxied ? t('dnsLogs.yes') : t('dnsLogs.no')}\n`;

  // 更新操作展示旧值
  if (log.operation === 'update') {
    message += `\n📜 ${t('dnsLogs.changeDetails')}:\n`;
    
    if (log.oldIpAddress && log.oldIpAddress !== log.ipAddress) {
      message += `  🔢 IP: ${log.oldIpAddress} ➡️ ${log.ipAddress}\n`;
    }
    
    if (log.oldProxied !== undefined && log.oldProxied !== log.proxied) {
      const oldProxyStatus = log.oldProxied ? t('dnsLogs.yes') : t('dnsLogs.no');
      const newProxyStatus = log.proxied ? t('dnsLogs.yes') : t('dnsLogs.no');
      message += `  ☁️ ${t('dnsLogs.proxy')}: ${oldProxyStatus} ➡️ ${newProxyStatus}\n`;
    }
  }
  
  return message;
}

function getKeywordFromSession(ctx) {
  const session = userSessions.get(ctx.chat.id);
  return session ? session.dnsLogsSearchKeyword : '';
}

function setKeywordSession(ctx, keyword) {
  userSessions.set(ctx.chat.id, {
    state: SessionState.WAITING_DOMAIN_FOR_DNS_LOGS,
    dnsLogsSearchKeyword: keyword,
    lastUpdate: Date.now(),
  });
}

function buildDateListKeyboard(dates, page, totalPages) {
  const startIdx = page * DATES_PER_PAGE;
  const endIdx = Math.min(startIdx + DATES_PER_PAGE, dates.length);
  const pageDates = dates.slice(startIdx, endIdx);

  const dateButtons = pageDates.map(date => {
    return [{ text: date, callback_data: `view_logs:${date}:0` }];
  });

  const navigationButtons = [];
  if (page > 0) {
    navigationButtons.push({ text: t('common.previousPage'), callback_data: `dates_page:${page - 1}` });
  }

  if (totalPages > 1) {
    navigationButtons.push({
      text: `${page + 1}/${totalPages}`,
      callback_data: 'dates_page_info'
    });
  }

  if (page < totalPages - 1) {
    navigationButtons.push({ text: t('common.nextPage'), callback_data: `dates_page:${page + 1}` });
  }

  const inlineKeyboard = [...dateButtons];
  if (navigationButtons.length > 0) {
    inlineKeyboard.push(navigationButtons);
  }
  inlineKeyboard.push([{ text: t('dnsLogs.searchByDomain'), callback_data: 'dnslogs_search_domain' }]);
  inlineKeyboard.push([{ text: t('common.cancel'), callback_data: 'cancel_dnschangelogs' }]);

  return {
    startIdx,
    endIdx,
    inlineKeyboard,
  };
}

async function showDateList(ctx, page = 0, options = {}) {
  const dates = getAvailableLogDates();

  if (dates.length === 0) {
    if (options.reply) {
      await ctx.reply(t('dnsLogs.noLogs'));
      return;
    }
    await ctx.editMessageText(t('dnsLogs.noLogs'));
    return;
  }

  const totalPages = Math.ceil(dates.length / DATES_PER_PAGE);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const { startIdx, endIdx, inlineKeyboard } = buildDateListKeyboard(dates, safePage, totalPages);

  const messageText = totalPages > 1
    ? t('dnsLogs.selectDatePaged', { start: startIdx + 1, end: endIdx, total: dates.length })
    : t('dnsLogs.selectDate');

  const payload = {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };

  if (options.reply) {
    await createDnsLogsReply(ctx)(messageText, payload);
    return;
  }

  await ctx.editMessageText(messageText, payload);
}

function buildLogsMessage(title, logs, options = {}) {
  let message = `📋 ${title}\n\n`;
  logs.forEach((log, idx) => {
    message += `${formatLogEntry(log, options)}\n`;
    if (idx < logs.length - 1) {
      message += '➖➖➖➖➖➖➖➖➖➖\n\n';
    }
  });
  return message;
}

async function showDomainSearchResults(ctx, keyword, page = 0, options = {}) {
  const trimmedKeyword = String(keyword || '').trim();

  if (!trimmedKeyword) {
    const message = t('dnsLogs.emptyKeyword');
    if (options.reply) {
      await ctx.reply(message);
    } else {
      await ctx.answerCbQuery(message);
    }
    return;
  }

  setKeywordSession(ctx, trimmedKeyword);

  const logs = searchDnsLogsByDomain(trimmedKeyword);
  if (logs.length === 0) {
    const message = t('dnsLogs.noSearchResults', { keyword: trimmedKeyword });
    const payload = {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('dnsLogs.newSearch'), callback_data: 'dnslogs_search_domain' }],
          [
            { text: t('dnsLogs.backToDates'), callback_data: 'back_to_dates' },
            { text: t('dnsLogs.done'), callback_data: 'cancel_dnschangelogs' }
          ]
        ]
      }
    };

    if (options.edit) {
      await ctx.editMessageText(message, payload);
    } else {
      await createDnsLogsReply(ctx)(message, payload);
    }
    return;
  }

  const totalPages = Math.ceil(logs.length / LOGS_PER_PAGE);
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const startIdx = safePage * LOGS_PER_PAGE;
  const endIdx = Math.min(startIdx + LOGS_PER_PAGE, logs.length);
  const pageItems = logs.slice(startIdx, endIdx);
  const pageTitle = t('dnsLogs.searchTitle', {
    keyword: trimmedKeyword,
    start: startIdx + 1,
    end: endIdx,
    total: logs.length,
  });

  const message = buildLogsMessage(pageTitle, pageItems, { showDate: true });

  const navigationButtons = [];
  if (safePage > 0) {
    navigationButtons.push({ text: t('common.previousPage'), callback_data: `search_logs:${safePage - 1}` });
  }
  navigationButtons.push({
    text: `${safePage + 1}/${totalPages}`,
    callback_data: 'search_logs_page_info'
  });
  if (safePage < totalPages - 1) {
    navigationButtons.push({ text: t('common.nextPage'), callback_data: `search_logs:${safePage + 1}` });
  }

  const inlineKeyboard = [
    navigationButtons,
    [{ text: t('dnsLogs.newSearch'), callback_data: 'dnslogs_search_domain' }],
    [
      { text: t('dnsLogs.backToDates'), callback_data: 'back_to_dates' },
      { text: t('dnsLogs.done'), callback_data: 'cancel_dnschangelogs' }
    ]
  ];

  const payload = {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };

  if (options.edit) {
    await ctx.editMessageText(message, payload);
    return;
  }

  await createDnsLogsReply(ctx)(message, payload);
}

function setupCallbacks(bot) {
  // 处理查看日志回调
  bot.action(/view_logs:(.+):(\d+)/, async (ctx) => {
    trackDnsLogsMessage(ctx);
    try {
      const date = ctx.match[1];
      const page = parseInt(ctx.match[2], 10);

      // 获取指定日期的日志
      const logs = getDnsLogs(date);

      if (logs.length === 0) {
        await ctx.editMessageText(t('dnsLogs.noDateLogs', { date }));
        await ctx.answerCbQuery(t('dnsLogs.noRecordsFound'));
        return;
      }

      // 计算分页信息
      const totalPages = Math.ceil(logs.length / LOGS_PER_PAGE);
      const safePage = Math.min(Math.max(page, 0), totalPages - 1);
      const startIdx = safePage * LOGS_PER_PAGE;
      const endIdx = Math.min(startIdx + LOGS_PER_PAGE, logs.length);
      const pageTitle = t('dnsLogs.dateTitle', {
        date,
        start: startIdx + 1,
        end: endIdx,
        total: logs.length,
      });

      // 获取当前页的日志
      const pageItems = logs.slice(startIdx, endIdx);
      const message = buildLogsMessage(pageTitle, pageItems);

      // 创建分页按钮
      const navigationButtons = [];

      // 上一页按钮
      if (safePage > 0) {
        navigationButtons.push({ text: t('common.previousPage'), callback_data: `view_logs:${date}:${safePage - 1}` });
      }

      // 页码信息
      navigationButtons.push({
        text: `${safePage + 1}/${totalPages}`,
        callback_data: 'logs_page_info'
      });

      // 下一页按钮
      if (safePage < totalPages - 1) {
        navigationButtons.push({ text: t('common.nextPage'), callback_data: `view_logs:${date}:${safePage + 1}` });
      }

      // 返回和取消按钮
      const actionButtons = [
        { text: t('dnsLogs.backToDates'), callback_data: 'back_to_dates' },
        { text: t('dnsLogs.done'), callback_data: 'cancel_dnschangelogs' }
      ];

      // 合并所有按钮
      const inlineKeyboard = [navigationButtons, actionButtons];

      await createDnsLogsReply(ctx)(message, {
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
      
      // 添加这一行来停止加载状态
      await ctx.answerCbQuery(t('dnsLogs.loadedDate', { date }));

    } catch (error) {
      console.error('处理查看日志回调失败:', error);
      await ctx.reply(t('dnsLogs.fetchFailed'));
      await ctx.answerCbQuery(t('dnsLogs.loadFailed'));
    }
  });

  // 处理日期列表分页
  bot.action(/dates_page:(\d+)/, async (ctx) => {
    trackDnsLogsMessage(ctx);
    try {
      const page = parseInt(ctx.match[1], 10);
      await showDateList(ctx, page);
      await ctx.answerCbQuery(t('dnsLogs.switchedToPage', { page: page + 1 }));
    } catch (error) {
      console.error('处理日期分页失败:', error);
      await ctx.answerCbQuery(t('dnsLogs.switchDatePageFailed'));
    }
  });

  // 处理域名查询入口
  bot.action('dnslogs_search_domain', async (ctx) => {
    trackDnsLogsMessage(ctx);
    userSessions.set(ctx.chat.id, {
      state: SessionState.WAITING_DOMAIN_FOR_DNS_LOGS,
      lastUpdate: Date.now(),
    });

    await ctx.editMessageText(t('dnsLogs.searchPrompt'), {
      reply_markup: {
        inline_keyboard: [[
          { text: t('common.cancel'), callback_data: 'cancel_dnschangelogs' }
        ]]
      }
    });
    await ctx.answerCbQuery();
  });

  // 处理查询结果分页
  bot.action(/search_logs:(\d+)/, async (ctx) => {
    trackDnsLogsMessage(ctx);
    try {
      const page = parseInt(ctx.match[1], 10);
      const keyword = getKeywordFromSession(ctx);
      await showDomainSearchResults(ctx, keyword, page, { edit: true });
      await ctx.answerCbQuery(t('dnsLogs.loadedSearch'));
    } catch (error) {
      console.error('处理域名日志查询分页失败:', error);
      await ctx.answerCbQuery(t('dnsLogs.loadFailed'));
    }
  });

  // 新增：处理日期列表页码信息回调
  bot.action('dates_page_info', async (ctx) => {
    await ctx.answerCbQuery(t('dnsLogs.datePageInfo'));
  });

  // 处理页码信息回调
  bot.action('logs_page_info', async (ctx) => {
    await ctx.answerCbQuery(t('dnsLogs.logsPageInfo'));
  });

  // 处理查询结果页码信息回调
  bot.action('search_logs_page_info', async (ctx) => {
    await ctx.answerCbQuery(t('dnsLogs.searchPageInfo'));
  });

  // 处理返回日期列表回调
  bot.action('back_to_dates', async (ctx) => {
    trackDnsLogsMessage(ctx);
    
    try {
      await showDateList(ctx, 0);
      await ctx.answerCbQuery(t('dnsLogs.returnedToDates'));
    } catch (error) {
      console.error('返回日期列表失败:', error);
      await ctx.answerCbQuery(t('dnsLogs.returnFailed'));
    }
  });

  // 处理取消回调
  bot.action('cancel_dnschangelogs', async (ctx) => {
    const currentMessageId = ctx.callbackQuery.message.message_id;

    // 先编辑当前消息
    await ctx.editMessageText(t('dnsLogs.closed'));

    // 删除其他相关消息，但排除当前消息
    await deleteDnsLogsProcessMessages(ctx, currentMessageId);
    userSessions.delete(ctx.chat.id);
  });
}

module.exports = {
  setupCallbacks,
  showDateList,
  showDomainSearchResults,
};
