const { userSessions, SessionState } = require('../core/session');
const { handleRecordContentInput, handleSubdomainForSet, handleSearchKeywordInputForSet } = require('../../features/setdns/handlers');
const { handleSubdomainForDDNS, handleIntervalForDDNS } = require('../../features/ddns/handlers');
const { handleSubdomainForDelete, handleSearchKeywordInputForDelete } = require('../../features/deldns/handlers');
const { handleDnsUpdateIpInput, handleSubdomainInput, handleSearchKeywordInput } = require('../../features/getdns/handlers');

function setupTextHandler(bot) {
  bot.on('text', async (ctx) => {
    console.log('收到文本消息:', ctx.message.text);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      console.log('未找到会话，忽略消息');
      return;
    }

    session.lastUpdate = Date.now();

    // 统一的状态路由
    switch (session.state) {
      // setdns 相关状态
      case SessionState.WAITING_RECORD_CONTENT:
        await handleRecordContentInput(ctx, session);
        break;
      case SessionState.WAITING_SUBDOMAIN_FOR_SET:
        await handleSubdomainForSet(ctx, session);
        break;

      // deldns 相关状态
      case SessionState.WAITING_SUBDOMAIN_FOR_DELETE:
        await handleSubdomainForDelete(ctx, session);
        break;

      // getdns/getdnsall 相关状态 
      case SessionState.WAITING_DNS_UPDATE_NEW_IP:
        await handleDnsUpdateIpInput(ctx, session);
        break;

      case SessionState.WAITING_SUBDOMAIN_INPUT:
        await handleSubdomainInput(ctx, session);
        break;

      // 处理搜索关键字输入状态
      case SessionState.WAITING_SEARCH_KEYWORD_FOR_QUERY:
      case SessionState.WAITING_SEARCH_KEYWORD_FOR_ALL:
        await handleSearchKeywordInput(ctx, session);
        break;
      case SessionState.WAITING_SEARCH_KEYWORD_FOR_SET:
        await handleSearchKeywordInputForSet(ctx, session);
        break;
      case SessionState.WAITING_SEARCH_KEYWORD_FOR_DELETE:
        await handleSearchKeywordInputForDelete(ctx, session);
        break;

      // 处理记录类型选择状态（用户应该使用按钮而不是文本输入）
      case SessionState.SELECTING_RECORD_TYPE_FOR_SET:
        await ctx.reply('请使用按钮选择DNS记录类型，而不是输入文本。');
        break;

      // 新增：处理更新选择状态（用户应该使用按钮而不是文本输入）
      case SessionState.WAITING_UPDATE_CHOICE:
        await ctx.reply('请使用按钮选择要修改的内容，而不是输入文本。');
        break;

      // ddns 相关状态
      case SessionState.WAITING_SUBDOMAIN_FOR_DDNS:
        await handleSubdomainForDDNS(ctx, session);
        break;
      case SessionState.WAITING_INTERVAL_FOR_DDNS:
        await handleIntervalForDDNS(ctx, session);
        break;

      default:
        console.log(`未知会话状态: ${session.state}`);
    }
  });
}

module.exports = {
  setupTextHandler
};
