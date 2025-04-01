const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { getAllDDNSTasks } = require('../../services/ddns');
const { commands, createDDNSTrackedReply } = require('./utils');
const { setupCallbacks } = require('./callbacks');

function setup(bot) {

  // 添加DDNS命令
  bot.command(commands.ddns_command.command, async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_DDNS,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }

      let message = '请选择要设置DDNS的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_ddns_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_ddns' }]);

      await createDDNSTrackedReply(ctx)(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });

  // 查看DDNS状态命令
  bot.command(commands.ddnsstatus_command.command, async (ctx) => {
    const tasks = getAllDDNSTasks();

    if (tasks.length === 0) {
      await ctx.reply('当前没有运行中的DDNS任务。');
      return;
    }

    const tasksInfo = tasks.map(task => {
      const lastUpdateStr = task.lastUpdate
        ? task.lastUpdate.toLocaleString()
        : '尚未更新';

      // 根据IPv6启用状态显示不同信息
      let ipv6Info;
      if (task.enableIPv6) {
        ipv6Info = `IPv6: ${task.lastIPv6 || '获取中...'} (已启用)`;
      } else {
        ipv6Info = `IPv6: 未启用`;
      }

      return `域名: ${task.domain}\n` +
        `刷新间隔: ${task.interval}秒\n` +
        `IPv4: ${task.lastIPv4 || '未知'}\n` +
        `IPv6: ${task.lastIPv6 || '未配置'}\n` +
        `最后更新: ${lastUpdateStr}\n` +
        `更新次数: ${task.updateCount}\n` +
        `错误次数: ${task.errorCount}`;
    }).join('\n\n');

    await ctx.reply(
      `🔄 DDNS任务状态 (共${tasks.length}个):\n\n${tasksInfo}`
    );
  });

  // 停止DDNS命令
  bot.command(commands.stopddns_command.command, async (ctx) => {
    const tasks = getAllDDNSTasks();

    if (tasks.length === 0) {
      await ctx.reply('当前没有运行中的DDNS任务。');
      return;
    }

    // 创建域名选择按钮
    const ddnsButtons = tasks.map(task => {
      return [{ text: task.domain, callback_data: `stop_ddns_${task.domain}` }];
    });

    // 添加全部停止按钮
    ddnsButtons.push([{ text: '停止所有DDNS任务', callback_data: 'stop_all_ddns' }]);

    // 添加取消按钮
    ddnsButtons.push([{ text: '取消操作', callback_data: 'cancel_stop_ddns' }]);

    await createDDNSTrackedReply(ctx)('请选择要停止的DDNS任务：', {
      reply_markup: {
        inline_keyboard: ddnsButtons
      }
    });
  });
  
  setupCallbacks(bot);
}

module.exports = { setup, commands };