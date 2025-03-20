const { userSessions, SessionState } = require('../core/session');
const { trackGetDnsMessage, createGetDnsReply, deleteGetDnsProcessMessages, queryDomainRecords, displayDnsRecordsPage } = require('./utils');
const { deleteSingleDnsRecord, updateDnsRecord, getDnsRecord } = require('../../services/cloudflare');
const { getZoneIdForDomain } = require('../../utils/domain');
const { DNS_RECORDS_PAGE_SIZE } = require('../../config');

function setupCallbacks(bot) {
  bot.action(/^select_domain_query_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_QUERY) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const rootDomain = ctx.match[1];
    session.rootDomain = rootDomain;
    session.state = SessionState.WAITING_SUBDOMAIN_INPUT;

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      `已选择域名: ${rootDomain}\n\n` +
      `请输入子域名前缀（如：www），或直接发送 "." 查询根域名。\n\n` +
      `例如：输入 "www" 将查询 www.${rootDomain}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '查询根域名', callback_data: 'query_root_domain' },
            { text: '取消操作', callback_data: 'cancel_getdns' }
          ]]
        }
      }
    );
  });

  // 处理查询根域名的回调
  bot.action('query_root_domain', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_SUBDOMAIN_INPUT) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    await ctx.answerCbQuery();
    await queryDomainRecords(ctx, session.rootDomain);
  });

  bot.action('cancel_getdns', async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 先编辑当前消息
    await ctx.editMessageText('已取消DNS记录查询操作。');
    
    // 获取当前回调消息的ID，以便在删除时排除它
    const currentMessageId = ctx.callbackQuery.message.message_id;
    
    // 删除其他相关消息，但排除当前消息
    await deleteGetDnsProcessMessages(ctx, currentMessageId);
    
    userSessions.delete(chatId);
  });

  // 处理DNS记录点击
  bot.action(/^dns_r_r(\d+)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    // 允许在查看记录和管理记录状态下点击
    if (!session || (session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 从回调数据中提取记录索引
    const recordKey = `r${ctx.match[1]}`;
    const recordIndex = session.pageRecordIndices[recordKey];

    // 查找完整的记录信息
    const record = session.dnsRecords[recordIndex];
    if (!record) {
      await ctx.answerCbQuery('找不到记录信息');
      return;
    }

    // 保存记录信息到会话
    session.selectedRecord = record;
    session.state = SessionState.MANAGING_DNS_RECORD;

    // 显示记录详情和操作选项
    let recordTypeDisplay = record.type;
    if (record.type === 'A') {
      recordTypeDisplay = 'IPv4 (A)';
    } else if (record.type === 'AAAA') {
      recordTypeDisplay = 'IPv6 (AAAA)';
    }

    const recordDetails =
      `域名: ${record.name}\n` +
      `IP地址: ${record.content}\n` +
      `类型: ${recordTypeDisplay}\n` +
      `代理状态: ${record.proxied ? '已启用' : '未启用'}`;

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      `DNS记录详情:\n\n${recordDetails}\n\n请选择操作:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '更新记录', callback_data: 'dns_update_record' },
              { text: '删除记录', callback_data: 'dns_delete_record' }
            ],
            [
              { text: '返回列表', callback_data: 'dns_back_to_list' }
            ]
          ]
        }
      }
    );
  });



  bot.action('dns_prev_page', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || (session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS &&
      session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    if (session.currentPage > 0) {
      session.currentPage--;
      await displayDnsRecordsPage(ctx, session);
    }

    await ctx.answerCbQuery();
  });

  bot.action('dns_next_page', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || (session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS &&
      session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    if (session.currentPage < session.totalPages - 1) {
      session.currentPage++;
      await displayDnsRecordsPage(ctx, session);
    }

    await ctx.answerCbQuery();
  });

  bot.action('dns_page_info', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    await ctx.answerCbQuery(`第 ${session.currentPage + 1} 页，共 ${session.totalPages} 页`);
  });

  // 返回列表
  bot.action('dns_back_to_list', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;

    await ctx.answerCbQuery();

    await displayDnsRecordsPage(ctx, session);
  });

  // 处理更新记录请求
  bot.action('dns_update_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.state = SessionState.WAITING_DNS_UPDATE_NEW_IP;

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      `请输入 ${session.selectedRecord.name} 的新IP地址。\n` +
      `当前IP: ${session.selectedRecord.content}\n` +
      `支持IPv4（例如：192.168.1.1）\n` +
      `或IPv6（例如：2001:db8::1）`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '取消操作', callback_data: 'cancel_update_dns' }
          ]]
        }
      }
    );
  });

  // 处理删除记录请求
  bot.action('dns_delete_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await createGetDnsReply(ctx)(
      `确定要删除以下DNS记录吗？\n\n` +
      `域名: ${record.name}\n` +
      `IP地址: ${record.content}\n` +
      `类型: ${record.type}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '确认删除', callback_data: 'confirm_delete_record' },
              { text: '取消', callback_data: 'cancel_delete_record' }
            ]
          ]
        }
      }
    );
  });

  // 确认删除记录
  bot.action('confirm_delete_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(`正在删除 ${record.name} 的DNS记录...`);

    try {
      // 调用删除单条记录的API
      await deleteSingleDnsRecord(record.zone_id, record.id);
      await ctx.reply(`DNS记录已成功删除: ${record.name}`);
      await deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      await ctx.reply(`删除过程中发生错误: ${error.message}`);
    }

    userSessions.delete(chatId);
  });

  // 取消删除记录
  bot.action('cancel_delete_record', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText('已取消删除操作');
    await displayDnsRecordsPage(ctx, session);
  });

  // 取消更新DNS
  bot.action('cancel_update_dns', async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText('已取消更新操作');
    await displayDnsRecordsPage(ctx, session);
  });

  // 处理新代理设置
  bot.action('dns_update_proxy_yes', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_NEW_PROXY) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `正在更新: ${record.name} -> ${session.newIpAddress} ` +
      `(类型: ${record.type}, 已启用代理)`
    );

    try {
      // 检查记录是否包含必要的字段
      if (!record.zone_id || !record.id) {
        throw new Error(`记录信息不完整: zone_id=${record.zone_id}, id=${record.id}`);
      }

      console.log(`更新记录信息: ${JSON.stringify(record)}`);

      // 调用更新记录的API
      await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        session.newIpAddress,
        record.type,
        true
      );
      await ctx.reply(`DNS记录已成功更新: ${record.name}`);
      deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      let errorMessage = `更新过程中发生错误: ${error.message}`;
      if (error.response) {
        errorMessage += ` (状态码: ${error.response.status})`;
      }
      await ctx.reply(errorMessage);
      console.error('更新DNS记录时出错:', error);
    }

    userSessions.delete(chatId);
  });

  bot.action('dns_update_proxy_no', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    if (!session || session.state !== SessionState.WAITING_NEW_PROXY) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    const record = session.selectedRecord;

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `正在更新: ${record.name} -> ${session.newIpAddress} ` +
      `(类型: ${record.type}, 未启用代理)`
    );

    try {
      // 检查记录是否包含必要的字段
      if (!record.zone_id || !record.id) {
        throw new Error(`记录信息不完整: zone_id=${record.zone_id}, id=${record.id}`);
      }

      console.log(`更新记录信息: ${JSON.stringify(record)}`);

      // 调用更新记录的API
      await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        session.newIpAddress,
        record.type,
        false
      );
      await ctx.reply(`DNS记录已成功更新: ${record.name}`);
      deleteGetDnsProcessMessages(ctx);
    } catch (error) {
      let errorMessage = `更新过程中发生错误: ${error.message}`;
      if (error.response) {
        errorMessage += ` (状态码: ${error.response.status})`;
      }
      await ctx.reply(errorMessage);
      console.error('更新DNS记录时出错:', error);
    }

    userSessions.delete(chatId);
  });

  bot.action('dns_done', async (ctx) => {
    const chatId = ctx.chat.id;
    // 先回答回调查询
    await ctx.answerCbQuery('查询完成');
    // 发送完成提示
    await ctx.reply('DNS记录查询已完成。');

    await deleteGetDnsProcessMessages(ctx);
    // 最后删除会话
    userSessions.delete(chatId);
  });

  
  // getdnsall处理域名选择回调
  bot.action(/^select_domain_all_(.+)$/, async (ctx) => {
    trackGetDnsMessage(ctx);
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);

    // 检查会话是否存在，并且状态是选择域名、查看记录或管理记录
    if (!session || (session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS &&
      session.state !== SessionState.VIEWING_DNS_RECORDS &&
      session.state !== SessionState.MANAGING_DNS_RECORD)) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }

    // 从回调数据中提取域名
    const domainName = ctx.match[1];
    const zoneId = await getZoneIdForDomain(domainName);

    if (!zoneId) {
      await createGetDnsReply(ctx)(`无法找到此域名对应的Zone ID，请联系管理员`);
      userSessions.delete(chatId);
      return;
    }
    await ctx.answerCbQuery();

    // 显示正在查询的提示
    await createGetDnsReply(ctx)(`正在查询 ${domainName} 的所有DNS记录...`);

    try {
      const { records } = await getDnsRecord(domainName, true);

      if (records && records.length > 0) {
        // 保存记录到会话中
        session.dnsRecords = records;
        session.domain = domainName;
        session.currentPage = 0;
        session.pageSize = DNS_RECORDS_PAGE_SIZE;
        session.totalPages = Math.ceil(records.length / session.pageSize);
        session.state = SessionState.VIEWING_DNS_RECORDS;
        session.getAllRecords = true;

        // 显示第一页记录
        await displayDnsRecordsPage(ctx, session);
      }
      else {
        await createGetDnsReply(ctx)(`未找到 ${domainName} 的DNS记录`);
      }
    } catch (error) {
      await createGetDnsReply(ctx)(`查询过程中发生错误: ${error.message}`);
    }
  });

}

module.exports = { setupCallbacks };