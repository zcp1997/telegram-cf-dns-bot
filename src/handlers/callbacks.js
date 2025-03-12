const { userSessions, SessionState } = require('../utils/session');
const { createOrUpdateDns, deleteDnsRecord, getDnsRecord, updateDnsRecord, deleteSingleDnsRecord } = require('../services/cloudflare');
const { displayDnsRecordsPage } = require('./messages');
const { getZoneIdForDomain } = require('../utils/domain');
const { DNS_RECORDS_PAGE_SIZE } = require('../config');

function setupCallbacks(bot) {
  // 取消操作的回调
  bot.action('cancel_setdns', (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    ctx.editMessageText('已取消DNS记录设置操作。');
  });

  bot.action('cancel_getdns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    await ctx.editMessageText('已取消DNS记录查询操作。');
  });

  bot.action('cancel_deldns', (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    ctx.editMessageText('已取消DNS记录删除操作。');
  });

  bot.action('cancel_delete', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    await ctx.editMessageText('已取消删除操作。');
  });

  // 代理设置的回调
  bot.action('proxy_yes', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.WAITING_PROXY) {
      return;
    }
    
    await ctx.editMessageText(
      `正在处理: ${session.domain} -> ${session.ipAddress} ` +
      `(类型: ${session.recordType}, 已启用代理)`
    );
    
    try {
      const result = await createOrUpdateDns(
        session.domain,
        session.ipAddress,
        session.recordType,
        true
      );
      await ctx.reply(result.message);
    } catch (error) {
      await ctx.reply(`处理过程中发生错误: ${error.message}`);
    }
    
    userSessions.delete(chatId);
  });

  bot.action('proxy_no', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.WAITING_PROXY) {
      return;
    }
    
    await ctx.editMessageText(
      `正在处理: ${session.domain} -> ${session.ipAddress} ` +
      `(类型: ${session.recordType}, 未启用代理)`
    );
    
    try {
      const result = await createOrUpdateDns(
        session.domain,
        session.ipAddress,
        session.recordType,
        false
      );
      await ctx.reply(result.message);
    } catch (error) {
      await ctx.reply(`处理过程中发生错误: ${error.message}`);
    }
    
    userSessions.delete(chatId);
  });

  // 确认删除的回调
  bot.action('confirm_delete', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.WAITING_CONFIRM_DELETE) {
      return;
    }
    
    const domainName = session.domain;
    await ctx.editMessageText(`正在删除 ${domainName} 的DNS记录...`);
    
    try {
      const result = await deleteDnsRecord(domainName);
      await ctx.reply(result.message);
    } catch (error) {
      await ctx.reply(`删除过程中发生错误: ${error.message}`);
    }
    
    userSessions.delete(chatId);
  });

  bot.action('dns_prev_page', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.VIEWING_DNS_RECORDS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    if (session.currentPage > 0) {
      session.currentPage--;
      await ctx.deleteMessage();
      await displayDnsRecordsPage(ctx, session);
    }
    
    await ctx.answerCbQuery();
  });

  bot.action('dns_next_page', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.VIEWING_DNS_RECORDS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    if (session.currentPage < session.totalPages - 1) {
      session.currentPage++;
      await ctx.deleteMessage();
      await displayDnsRecordsPage(ctx, session);
    }
    
    await ctx.answerCbQuery();
  });

  bot.action('dns_page_info', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    await ctx.answerCbQuery(`第 ${session.currentPage + 1} 页，共 ${session.totalPages} 页`);
  });

  bot.action('dns_done', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.delete(chatId);
    await ctx.answerCbQuery('查询完成');
    await ctx.reply('DNS记录查询已完成。');
  });

   // 处理域名选择回调
  bot.action(/^select_domain_all_(.+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.SELECTING_DOMAIN_FOR_ALL_DNS) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    // 从回调数据中提取域名
    const domainName = ctx.match[1];
    const zoneId = getZoneIdForDomain(domainName);
    
    if (!zoneId) {
      await ctx.answerCbQuery('无法找到此域名对应的Zone ID');
      await ctx.reply('无法找到此域名对应的Zone ID，请联系管理员');
      userSessions.delete(chatId);
      return;
    }
    
    await ctx.answerCbQuery();
    await ctx.reply(`正在查询 ${domainName} 的所有DNS记录...`);
    
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
      } else {
        await ctx.reply(`未找到 ${domainName} 的DNS记录`);
        userSessions.delete(chatId);
      }
    } catch (error) {
      await ctx.reply(`查询过程中发生错误: ${error.message}`);
      userSessions.delete(chatId);
    }
  });

  // 处理DNS记录点击
  bot.action(/^dns_r_r(\d+)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.VIEWING_DNS_RECORDS) {
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
    await ctx.reply(
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
  
  // 处理更新记录请求
  bot.action('dns_update_record', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    session.state = SessionState.WAITING_DNS_UPDATE_NEW_IP;
    
    await ctx.answerCbQuery();
    await ctx.reply(
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
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session || session.state !== SessionState.MANAGING_DNS_RECORD) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    const record = session.selectedRecord;
    
    await ctx.answerCbQuery();
    await ctx.reply(
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
  
  // 返回列表
  bot.action('dns_back_to_list', async (ctx) => {
    const chatId = ctx.chat.id;
    const session = userSessions.get(chatId);
    
    if (!session) {
      await ctx.answerCbQuery('会话已过期');
      return;
    }
    
    session.state = SessionState.VIEWING_DNS_RECORDS;
    delete session.selectedRecord;
    
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    await displayDnsRecordsPage(ctx, session);
  });
  
  // 确认删除记录
  bot.action('confirm_delete_record', async (ctx) => {
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
      const result = await deleteSingleDnsRecord(record.zone_id, record.id);
      await ctx.reply(`DNS记录已成功删除: ${record.name}`);
    } catch (error) {
      await ctx.reply(`删除过程中发生错误: ${error.message}`);
    }
    
    userSessions.delete(chatId);
  });
  
  // 取消删除记录
  bot.action('cancel_delete_record', async (ctx) => {
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
  bot.action('new_proxy_yes', async (ctx) => {
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
      const result = await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        session.newIpAddress,
        record.type,
        true
      );
      await ctx.reply(`DNS记录已成功更新: ${record.name}`);
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

  bot.action('new_proxy_no', async (ctx) => {
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
      const result = await updateDnsRecord(
        record.zone_id,
        record.id,
        record.name,
        session.newIpAddress,
        record.type,
        false
      );
      await ctx.reply(`DNS记录已成功更新: ${record.name}`);
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
}

module.exports = { setupCallbacks };
