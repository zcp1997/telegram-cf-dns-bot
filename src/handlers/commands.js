const { getConfiguredDomains } = require('../utils/domain');
const { userSessions, SessionState } = require('../utils/session');
const { ALLOWED_CHAT_IDS, CF_API_TOKEN } = require('../config');

const helpMessage = '🤖 欢迎使用多域名 Cloudflare DNS 管理机器人！\n\n' +
  '请选择以下操作类别：';

function setupCommands(bot) {
  // 基础命令
  bot.command('start', (ctx) => {
    const helpButtons = [
      [{ text: '📝 DNS记录管理', callback_data: 'help_dns_management' }],
      [{ text: '📊 系统信息', callback_data: 'help_system_info' }],
      [{ text: '❓ 帮助信息', callback_data: 'help_general' }]
    ];
    
    ctx.reply(helpMessage, {
      reply_markup: {
        inline_keyboard: helpButtons
      }
    });
  });

  bot.command('help', (ctx) => {
    const helpButtons = [
      [{ text: '📝 DNS记录管理', callback_data: 'help_dns_management' }],
      [{ text: '📊 系统信息', callback_data: 'help_system_info' }],
      [{ text: '❓ 帮助信息', callback_data: 'help_general' }]
    ];
    
    ctx.reply(helpMessage, {
      reply_markup: {
        inline_keyboard: helpButtons
      }
    });
  });

  // 域名列表命令
  bot.command('domains', async (ctx) => {
    try {
      const domains = await getConfiguredDomains();
      if (domains.length > 0) {
        ctx.reply(`可管理的域名:\n${domains.join('\n')}`);
      } else {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
      }
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });

  // 设置DNS记录命令
  bot.command('setdns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_SET,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }
      
      let message = '请选择要设置的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_set_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_setdns' }]);

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });

  // 查询DNS记录命令
  bot.command('getdns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_QUERY,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }
      
      let message = '请选择要查询的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_query_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_getdns' }]);

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });

  // 查询所有DNS记录命令
  bot.command('getdnsall', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_ALL_DNS,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }
      
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
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
  });

  // 删除DNS记录命令
  bot.command('deldns', async (ctx) => {
    const chatId = ctx.chat.id;
    userSessions.set(chatId, {
      state: SessionState.SELECTING_DOMAIN_FOR_DELETE,
      lastUpdate: Date.now()
    });

    try {
      const domains = await getConfiguredDomains();
      if (domains.length === 0) {
        ctx.reply('未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。');
        return;
      }
      
      let message = '请选择要删除记录的域名：';

      // 创建域名选择按钮
      const domainButtons = domains.map(domain => {
        return [{ text: domain, callback_data: `select_domain_del_${domain}` }];
      });

      // 添加取消按钮
      domainButtons.push([{ text: '取消操作', callback_data: 'cancel_deldns' }]);

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: domainButtons
        }
      });
    } catch (error) {
      ctx.reply(`获取域名列表失败: ${error.message}`);
    }
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
      try {
        const domains = await getConfiguredDomains();
        const { EXCLUDE_DOMAINS } = require('../config');
        
        if (domains.length > 0) {
          const { getZoneIdForDomain } = require('../utils/domain');
          
          // 获取每个域名对应的Zone ID
          const mappingPromises = domains.map(async domain => {
            const zoneId = await getZoneIdForDomain(domain);
            return `${domain} -> ${zoneId}`;
          });
          
          const mappings = await Promise.all(mappingPromises);
          
          // 构建排除域名信息
          const excludeInfo = EXCLUDE_DOMAINS && EXCLUDE_DOMAINS.length > 0 
            ? `\n\n排除的域名:\n${EXCLUDE_DOMAINS.join('\n')}`
            : '\n\n未配置排除域名';
          
          await ctx.reply(
            '域名到Zone ID的映射:\n\n' +
            mappings.join('\n') + 
            excludeInfo + '\n\n' +
            '当前配置状态：\n' +
            `• API Token: ${CF_API_TOKEN ? '已配置' : '未配置'}\n` +
            `• 可管理域名数量: ${domains.length}\n` +
            `• 排除域名数量: ${EXCLUDE_DOMAINS ? EXCLUDE_DOMAINS.length : 0}`
          );
        } else {
          // 构建排除域名信息
          const excludeInfo = EXCLUDE_DOMAINS && EXCLUDE_DOMAINS.length > 0 
            ? `\n\n当前排除的域名:\n${EXCLUDE_DOMAINS.join('\n')}`
            : '\n\n未配置排除域名';
          
          await ctx.reply('⚠️ 未找到可管理的域名，请检查API Token权限或EXCLUDE_DOMAINS配置。' + excludeInfo);
        }
      } catch (error) {
        await ctx.reply(`获取域名映射失败: ${error.message}`);
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
  commands,
  helpMessage
};
