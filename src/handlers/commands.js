const { getConfiguredDomains } = require('../utils/domain');
const { userSessions, SessionState } = require('../utils/session');
const { ALLOWED_CHAT_IDS, DOMAIN_ZONE_MAP, CF_API_TOKEN } = require('../config');

const helpMessage = '🤖 欢迎使用多域名 Cloudflare DNS 管理机器人！\n\n' +
    '📋 可用命令：\n\n' +
    '📝 DNS 记录管理\n' +
    '➖➖➖➖➖➖➖➖➖➖➖➖\n' +
    '✅ /setdns - 添加或更新 DNS 记录\n' +
    '   • 支持 IPv4 和 IPv6 地址\n' +
    '   • 可选择是否启用代理\n\n' +
    '🔍 /getdns - 查询 DNS 记录\n' +
    '   • 查看域名的详细配置\n\n' +
    '🔍 /getdnsall - 查询所有 DNS 记录\n' +
    '   • 查看根域名下所有记录\n\n' +
    '❌ /deldns - 删除 DNS 记录\n' +
    '   • 删除前会要求确认\n\n' +
    '📊 系统信息\n' +
    '➖➖➖➖➖➖➖➖➖➖➖➖\n' +
    '🌐 /domains - 查看所有配置的域名\n' +
    '👤 /listusers - 查看白名单用户列表 (仅管理员)\n' +
    '🔧 /zonemap - 查看域名和 Zone ID 映射 (仅管理员)\n\n' +
    '❓ /help - 显示此帮助信息\n' +
    '💡 提示：添加、更新、删除操作都可以通过点击"取消"按钮随时终止。\n' +
    '🔄 使用 /start 命令可以重新显示主菜单。';

function setupCommands(bot) {
  // 基础命令
  bot.command('start', (ctx) => ctx.reply(helpMessage));
  bot.command('help', (ctx) => ctx.reply(helpMessage));

  // 域名列表命令
  bot.command('domains', (ctx) => {
    const domains = getConfiguredDomains();
    if (domains.length > 0) {
      ctx.reply(`已配置的域名:\n${domains.join('\n')}`);
    } else {
      ctx.reply('尚未配置任何域名，请检查环境变量DOMAIN_ZONE_MAP。');
    }
  });

  // 设置DNS记录命令
  bot.command('setdns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.WAITING_DOMAIN,
      lastUpdate: Date.now()
    });
    
    const domains = getConfiguredDomains();
    let message = '请输入要设置的域名。\n\n可配置的域名列表：\n';
    domains.forEach(domain => {
      message += `- ${domain} 及其子域名\n`;
    });
    message += '\n例如：test.example.com';
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '取消操作', callback_data: 'cancel_setdns' }
        ]]
      }
    });
  });

  // 查询DNS记录命令
  bot.command('getdns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.WAITING_DOMAIN_TO_QUERY,
      lastUpdate: Date.now()
    });
    
    const domains = getConfiguredDomains();
    let message = '请输入要查询的域名。\n\n可查询的域名列表：\n';
    domains.forEach(domain => {
      message += `- ${domain} 及其子域名\n`;
    });
    message += '\n例如：test.example.com';
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '取消操作', callback_data: 'cancel_getdns' }
        ]]
      }
    });
  });

  // 查询所有DNS记录命令
  bot.command('getdnsall', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_ALL_DNS,
      lastUpdate: Date.now()
    });

    const domains = getConfiguredDomains();
    let message = '请选择要查询的域名：';
    
    // 创建域名选择按钮
    const domainButtons = domains.map(domain => {
      return [{ text: domain, callback_data: `select_domain_all_${domain}` }];
    });
    
    // 添加取消按钮
    domainButtons.push([{ text: '取消操作', callback_data: 'cancel_getalldns' }]);

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: domainButtons
      }
    });
  });

  // 删除DNS记录命令
  bot.command('deldns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.WAITING_DOMAIN_TO_DELETE,
      lastUpdate: Date.now()
    });
    
    const domains = getConfiguredDomains();
    let message = '请输入要删除DNS记录的域名。\n\n可操作的域名列表：\n';
    domains.forEach(domain => {
      message += `- ${domain} 及其子域名\n`;
    });
    message += '\n例如：test.example.com';
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '取消操作', callback_data: 'cancel_deldns' }
        ]]
      }
    });
  });

  // 管理员命令
  bot.command('listusers', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (ALLOWED_CHAT_IDS[0] === chatId) {
      ctx.reply(`当前允许访问的用户ID:\n${ALLOWED_CHAT_IDS.join('\n')}`);
    } else {
      ctx.reply('⚠️ 只有管理员可以查看用户列表。');
    }
  });

  bot.command('zonemap', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (ALLOWED_CHAT_IDS[0] === chatId) {
      const mappings = Object.entries(DOMAIN_ZONE_MAP)
        .map(([domain, zoneId]) => `${domain}: ${zoneId}`)
        .join('\n');
      
      if (mappings) {
        await ctx.reply(
          '域名到Zone ID的映射:\n\n' + 
          mappings + '\n\n' +
          '当前配置状态：\n' +
          `• API Token: ${CF_API_TOKEN ? '已配置' : '未配置'}\n` +
          `• 域名映射数量: ${Object.keys(DOMAIN_ZONE_MAP).length}`
        );
      } else {
        await ctx.reply('⚠️ 尚未配置任何域名映射。请检查环境变量DOMAIN_ZONE_MAP。');
      }
    } else {
      await ctx.reply('⚠️ 只有管理员可以查看域名映射。');
    }
  });
}

const commands = [
    { command: 'start', description: '开始使用机器人' },
    { command: 'setdns', description: '添加/更新DNS记录' },
    { command: 'getdns', description: '查询DNS记录' },
    { command: 'getdnsall', description: '查询所有DNS记录' },
    { command: 'deldns', description: '删除DNS记录' },
    { command: 'domains', description: '查看所有已配置的域名' },
    { command: 'help', description: '显示帮助信息' },
    { command: 'listusers', description: '查看白名单用户列表 (仅管理员)' },
    { command: 'zonemap', description: '查看域名和Zone ID映射 (仅管理员)' }
  ];
  
  module.exports = { 
    setupCommands,
    commands
  };
