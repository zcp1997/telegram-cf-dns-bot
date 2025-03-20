const { command, createDnsLogsReply } = require('./utils');
const { setupCallbacks } = require('./callbacks');
const { getAvailableLogDates } = require('../../utils/dnsLogger');

function setup(bot) {
  bot.command(command.command, async (ctx) => {
    try {

      // 获取可用的日志日期
      const dates = getAvailableLogDates();

      if (dates.length === 0) {
        await ctx.reply('没有找到任何DNS变更日志。');
        return;
      }

      // 为每个日期创建按钮，参考displayDnsRecordsPage方式
      const dateButtons = dates.map(date => {
        return [{ text: date, callback_data: `view_logs:${date}:0` }];
      });

      // 添加取消按钮
      const actionButtons = [{ text: '取消', callback_data: 'cancel_dnschangelogs' }];

      // 合并所有按钮
      const inlineKeyboard = [...dateButtons, actionButtons];

      await createDnsLogsReply(ctx)('请选择要查看的日志日期：', {
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
};

module.exports = { setup, command };