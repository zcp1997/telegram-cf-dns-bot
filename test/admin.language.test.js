const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeBot, createCtx, mockModule, clearModules } = require('./helpers/fakes');

const modulesToReset = [
  './src/features/admin',
  './src/features/admin/index',
  './src/features/admin/callbacks',
  './src/features/admin/utils',
  './src/utils/domain',
  './src/i18n',
];

function loadAdminFlow() {
  clearModules(modulesToReset);

  mockModule('./src/utils/domain', {
    getConfiguredDomains: async () => ['example.com'],
    getZoneIdForDomain: async () => 'zone-id',
  });

  const i18n = require('../src/i18n');
  i18n.setLanguage('zh-CN');

  const admin = require('../src/features/admin');
  return { admin, i18n };
}

test('/language switches runtime language and /help follows it', async () => {
  const { admin, i18n } = loadAdminFlow();
  const bot = new FakeBot();
  admin.setup(bot);

  const ctx = createCtx({ text: '/language' });

  await bot.runCommand('language', ctx);
  assert.match(ctx.calls.reply.at(-1).text, /当前语言：zh-CN/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].callback_data, 'set_language_zh-CN');
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][1].callback_data, 'set_language_en-US');

  await bot.runAction('set_language_en-US', ctx);
  assert.equal(i18n.getLanguage(), 'en-US');
  assert.match(ctx.calls.editMessageText.at(-1).text, /Language switched to: en-US/);
  assert.match(ctx.calls.editMessageText.at(-1).text, /Welcome to the multi-domain Cloudflare DNS management bot/);

  await bot.runCommand('help', ctx);
  assert.match(ctx.calls.reply.at(-1).text, /Welcome to the multi-domain Cloudflare DNS management bot/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[3][0].text, '🌐 Language');
});
