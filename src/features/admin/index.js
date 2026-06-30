const { getConfiguredDomains } = require('../../utils/domain');
const { ALLOWED_CHAT_IDS, CF_API_TOKEN, EXCLUDE_DOMAINS } = require('../../config');
const { commands, getHelpButtons, getHelpMessage, getLanguageButtons } = require('./utils');
const { setupCallbacks } = require('./callbacks');
const { getZoneIdForDomain } = require('../../utils/domain');
const { getLanguage, t } = require('../../i18n');

function setup(bot) {
  // 基础命令
  bot.command(commands.start_command.command, (ctx) => {
    ctx.reply(getHelpMessage(), {
      reply_markup: {
        inline_keyboard: getHelpButtons()
      }
    });
  });

  bot.command(commands.help_command.command, (ctx) => {
    ctx.reply(getHelpMessage(), {
      reply_markup: {
        inline_keyboard: getHelpButtons()
      }
    });
  });

  bot.command(commands.language_command.command, (ctx) => {
    ctx.reply(
      `${t('admin.language.current', { language: getLanguage() })}\n\n${t('admin.language.prompt')}`,
      {
        reply_markup: {
          inline_keyboard: getLanguageButtons()
        }
      }
    );
  });

  // 域名列表命令
  bot.command(commands.domains_command.command, async (ctx) => {
    try {
      const domains = await getConfiguredDomains();
      if (domains.length > 0) {
        ctx.reply(t('admin.domainsList', { domains: domains.join('\n') }));
      } else {
        ctx.reply(t('admin.noDomains'));
      }
    } catch (error) {
      ctx.reply(t('admin.fetchDomainsFailed', { message: error.message }));
    }
  });

  bot.command(commands.listusers_command.command, async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (ALLOWED_CHAT_IDS[0] === chatId) {
      ctx.reply(t('admin.allowedUsers', { users: ALLOWED_CHAT_IDS.join('\n') }));
    } else {
      ctx.reply(t('admin.listUsersAdminOnly'));
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
            ? `\n\n${t('admin.excludedDomains', { domains: EXCLUDE_DOMAINS.join('\n') })}`
            : `\n\n${t('admin.noExcludedDomains')}`;

          await ctx.reply(
            `${t('admin.zoneMapTitle')}\n\n` +
            mappings.join('\n') +
            excludeInfo + '\n\n' +
            `${t('admin.configStatus')}\n` +
            `${t('admin.apiTokenStatus', {
              status: CF_API_TOKEN ? t('admin.apiTokenConfigured') : t('admin.apiTokenNotConfigured')
            })}\n` +
            `${t('admin.manageableDomainsCount', { count: domains.length })}\n` +
            t('admin.excludedDomainsCount', { count: EXCLUDE_DOMAINS ? EXCLUDE_DOMAINS.length : 0 })
          );
        } else {
          // 构建排除域名信息
          const excludeInfo = EXCLUDE_DOMAINS && EXCLUDE_DOMAINS.length > 0
            ? `\n\n${t('admin.currentExcludedDomains', { domains: EXCLUDE_DOMAINS.join('\n') })}`
            : `\n\n${t('admin.noExcludedDomains')}`;

          await ctx.reply(t('admin.noDomains') + excludeInfo);
        }
      } catch (error) {
        await ctx.reply(t('admin.fetchZoneMapFailed', { message: error.message }));
      }
    } else {
      await ctx.reply(t('admin.zoneMapAdminOnly'));
    }
  });

  setupCallbacks(bot);
}

module.exports = {
  setup,
  commands
};
