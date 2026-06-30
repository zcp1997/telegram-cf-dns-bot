const { getHelpButtons, getHelpMessage, getLanguageButtons } = require('./utils');
const { setLanguage, t } = require('../../i18n');

function setupCallbacks(bot) {

  bot.action('help_dns_management', (ctx) => {
    ctx.editMessageText(t('admin.help.dnsManagementDetail'), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: t('common.back'), callback_data: 'help_back' }]]
      }
    });
  });

  // 处理DDNS管理帮助回调
  bot.action('help_ddns_management', async (ctx) => {
    await ctx.editMessageText(t('admin.help.ddnsManagementDetail'), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: t('common.back'), callback_data: 'help_back' }]]
      }
    });
  });

  bot.action('help_system_info', (ctx) => {
    ctx.editMessageText(t('admin.help.systemInfoDetail'), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: t('common.back'), callback_data: 'help_back' }]]
      }
    });
  });

  bot.action('help_general', (ctx) => {
    ctx.editMessageText(t('admin.help.generalDetail'), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: t('common.back'), callback_data: 'help_back' }]]
      }
    });
  });

  bot.action('help_language', (ctx) => {
    ctx.editMessageText(t('admin.language.prompt'), {
      reply_markup: {
        inline_keyboard: getLanguageButtons()
      }
    });
  });

  bot.action(/^set_language_(zh-CN|en-US)$/, async (ctx) => {
    const language = setLanguage(ctx.match[1]);

    await ctx.answerCbQuery(t('admin.language.updated', { language }));
    await ctx.editMessageText(
      `${t('admin.language.updated', { language })}\n\n${getHelpMessage()}`,
      {
        reply_markup: {
          inline_keyboard: getHelpButtons()
        }
      }
    );
  });

  bot.action('help_back', (ctx) => {
    ctx.editMessageText(getHelpMessage(), {
      reply_markup: {
        inline_keyboard: getHelpButtons()
      }
    });
  });

}

module.exports = { setupCallbacks };
