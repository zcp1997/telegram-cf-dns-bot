const { helpButtons, helpMessage } = require('./utils');

function setupCallbacks(bot) {

  bot.action('help_dns_management', (ctx) => {
    const dnsManagementHelp =
      '📝 <b>DNS 记录管理</b>\n' +
      '➖➖➖➖➖➖➖➖➖➖➖➖\n' +
      '✅ /setdns - 添加或更新 DNS 记录\n' +
      '   • 支持 IPv4 和 IPv6 地址\n' +
      '   • 可选择是否启用代理\n\n' +
      '🔍 /getdns - 查询 DNS 记录\n' +
      '   • 查看域名的详细配置\n\n' +
      '🔍 /getdnsall - 查询所有 DNS 记录\n' +
      '   • 查看根域名下所有记录\n\n' +
      '❌ /deldns - 删除 DNS 记录\n' +
      '   • 删除前会要求确认\n\n';

    ctx.editMessageText(dnsManagementHelp, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '« 返回', callback_data: 'help_back' }]]
      }
    });
  });

  // 处理DDNS管理帮助回调
  bot.action('help_ddns_management', async (ctx) => {
    const ddnsHelpMessage =
      '🔄 <b>DDNS动态域名管理</b>\n\n' +
      '动态DNS服务允许您自动更新域名指向的IP地址，特别适合家庭宽带等动态IP环境。\n\n' +
      '<b>可用命令：</b>\n' +
      '• /ddns - 设置新的DDNS任务\n' +
      '• /ddnsstatus - 查看所有DDNS任务状态\n' +
      '• /stopddns - 停止指定的DDNS任务\n\n' +
      '<b>DDNS功能亮点：</b>\n' +
      '• 自动检测IPv4和IPv6地址变化\n' +
      '• 支持多域名同时监控\n' +
      '• 可自定义更新频率（60秒-24小时）\n' +
      '• IP变更时自动推送通知\n' +
      '• 针对中国大陆优化的动态IP检测';

    await ctx.editMessageText(ddnsHelpMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '« 返回', callback_data: 'help_back' }]]
      }
    });
  });

  bot.action('help_system_info', (ctx) => {
    const systemInfoHelp =
      '📊 <b>系统信息</b>\n' +
      '➖➖➖➖➖➖➖➖➖➖➖➖\n' +
      '🌐 /domains - 查看所有配置的域名\n' +
      '👤 /listusers - 查看白名单用户列表 (仅管理员)\n' +
      '🔧 /zonemap - 查看域名和 Zone ID 映射 (仅管理员)';

    ctx.editMessageText(systemInfoHelp, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '« 返回', callback_data: 'help_back' }]]
      }
    });
  });

  bot.action('help_general', (ctx) => {
    const generalHelp =
      '❓ <b>帮助信息</b>\n' +
      '➖➖➖➖➖➖➖➖➖➖➖➖\n' +
      '💡 提示：本机器人只对接CF官方api。添加、更新、删除操作都可以通过点击"取消"按钮随时终止。\n' +
      '🔄 使用 /start 命令可以重新显示主菜单。';

    ctx.editMessageText(generalHelp, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '« 返回', callback_data: 'help_back' }]]
      }
    });
  });

  bot.action('help_back', (ctx) => {
    ctx.editMessageText(helpMessage, {
      reply_markup: {
        inline_keyboard: helpButtons
      }
    });
  });

}

module.exports = { setupCallbacks };