const { command, createDnsLogsReply } = require('./utils');
const { setupCallbacks } = require('./callbacks');
const { getAvailableLogDates } = require('../../utils/dnsLogger');

// 每页显示的日期数量
const DATES_PER_PAGE = 5;

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    try {
      // 获取可用的日志日期（已经按倒序排列）
      const dates = getAvailableLogDates();

      if (dates.length === 0) {
        await ctx.reply('没有找到任何DNS变更日志。');
        return;
      }

      // 默认显示第一页
      const page = 0;
      const totalPages = Math.ceil(dates.length / DATES_PER_PAGE);
      const startIdx = page * DATES_PER_PAGE;
      const endIdx = Math.min(startIdx + DATES_PER_PAGE, dates.length);
      const pageDates = dates.slice(startIdx, endIdx);

      // 为当前页的每个日期创建按钮
      const dateButtons = pageDates.map(date => {
        return [{ text: date, callback_data: `view_logs:${date}:0` }];
      });

      // 构建分页导航按钮
      const navigationButtons = [];

      // 由于是第一页，只显示下一页按钮（如果有多页的话）
      if (totalPages > 1) {
        navigationButtons.push({
          text: `1/${totalPages}`,
          callback_data: 'dates_page_info'
        });
        navigationButtons.push({ text: '下一页 ➡️', callback_data: `dates_page:1` });
      }

      // 添加取消按钮
      const actionButtons = [{ text: '取消', callback_data: 'cancel_dnschangelogs' }];

      // 合并所有按钮
      const inlineKeyboard = [...dateButtons];
      if (navigationButtons.length > 0) {
        inlineKeyboard.push(navigationButtons);
      }
      inlineKeyboard.push(actionButtons);

      const messageText = totalPages > 1 
        ? `请选择要查看的日志日期 (第${startIdx + 1}-${endIdx}条/共${dates.length}条)：`
        : '请选择要查看的日志日期：';

      await createDnsLogsReply(ctx)(messageText, {
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
    } catch (error) {
      console.error('处理dnschangelogs命令失败:', error);
      await ctx.reply('获取DNS日志失败，请稍后再试。');
    }
  });

  // 注册回调处理
  setupCallbacks(bot);
}

module.exports = {
  setup,
  command
};