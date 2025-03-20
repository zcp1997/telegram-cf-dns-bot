const { getConfiguredDomains } = require('../../utils/domain');
const { ALLOWED_CHAT_IDS, CF_API_TOKEN, EXCLUDE_DOMAINS } = require('../../config');
const { helpButtons, commands, helpMessage } = require('./utils');
const { setupCallbacks } = require('./callbacks');
const { getZoneIdForDomain } = require('../../utils/domain');

function setup(bot) {
  // 基础命令
  bot.command(commands.start_command.command, (ctx) => {
    ctx.reply(helpMessage, {
      reply_markup: {
        inline_keyboard: helpButtons
      }
    });
  });

  bot.command(commands.help_command.command, (ctx) => {
    ctx.reply(helpMessage, {
      reply_markup: {
        inline_keyboard: helpButtons
      }
    });
  });

  // 域名列表命令
  bot.command(commands.domains_command.command, async (ctx) => {
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

  bot.command(commands.listusers_command.command, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (ALLOWED_CHAT_IDS[0] === chatId) {
      ctx.reply(`当前允许访问的用户ID:\n${ALLOWED_CHAT_IDS.join('\n')}`);
    } else {
      ctx.reply('⚠️ 只有管理员可以查看用户列表。');
    }
  });

  bot.command(commands.zonemap_command.command, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (ALLOWED_CHAT_IDS[0] === chatId) {
      try {
        const domains = await getConfiguredDomains();

        if (domains.length > 0) {
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

  setupCallbacks(bot);
}

module.exports = {
  setup,
  commands
};