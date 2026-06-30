const { userSessions, SessionState } = require('../core/session');
const { getConfiguredDomains } = require('../../utils/domain');
const { getAllDDNSTasks } = require('../../services/ddns');
const { commands, createDDNSTrackedReply } = require('./utils');
const { setupCallbacks } = require('./callbacks');
const { t } = require('../../i18n');

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
        ctx.reply(t('ddns.noDomains'));
        return;
      }

      let message = t('ddns.selectDomain');

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_ddns_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: t('common.cancelOperation'), callback_data: 'cancel_ddns' }]);

      await createDDNSTrackedReply(ctx)(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      ctx.reply(t('ddns.fetchDomainsFailed', { message: error.message }));
    }
  });

  // 查看DDNS状态命令
  bot.command(commands.ddnsstatus_command.command, async (ctx) => {
    const tasks = getAllDDNSTasks();

    if (tasks.length === 0) {
      await ctx.reply(t('ddns.noRunningTasks'));
      return;
    }

    const tasksInfo = tasks.map(task => {
      const lastUpdateStr = task.lastUpdate
        ? task.lastUpdate.toLocaleString()
        : t('ddns.neverUpdated');

      // 根据IPv6启用状态显示不同信息
      let ipv6Info;
      if (task.enableIPv6) {
        ipv6Info = `${task.lastIPv6 || t('ddns.loading')} (${t('ddns.enabled')})`;
      } else {
        ipv6Info = t('ddns.disabled');
      }

      return t('ddns.taskItem', {
        domain: task.domain,
        interval: task.interval,
        lastIPv4: task.lastIPv4 || t('ddns.unknown'),
        lastIPv6: ipv6Info,
        lastUpdate: lastUpdateStr,
        updateCount: task.updateCount,
        errorCount: task.errorCount,
      });
    }).join('\n\n');

    await ctx.reply(t('ddns.statusTitle', { count: tasks.length, tasksInfo }));
  });

  // 停止DDNS命令
  bot.command(commands.stopddns_command.command, async (ctx) => {
    const tasks = getAllDDNSTasks();

    if (tasks.length === 0) {
      await ctx.reply(t('ddns.noRunningTasks'));
      return;
    }

    // 创建域名选择按钮
    const ddnsButtons = tasks.map(task => {
      return [{ text: task.domain, callback_data: `stop_ddns_${task.domain}` }];
    });

    // 添加全部停止按钮
    ddnsButtons.push([{ text: t('ddns.stopAllTasks'), callback_data: 'stop_all_ddns' }]);

    // 添加取消按钮
    ddnsButtons.push([{ text: t('common.cancelOperation'), callback_data: 'cancel_stop_ddns' }]);

    await createDDNSTrackedReply(ctx)(t('ddns.selectTaskToStop'), {
      reply_markup: {
        inline_keyboard: ddnsButtons
      }
    });
  });
  
  setupCallbacks(bot);
}

module.exports = { setup, commands };
