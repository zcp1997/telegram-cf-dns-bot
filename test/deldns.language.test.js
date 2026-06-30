const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeBot, createCtx, mockModule, clearModules } = require('./helpers/fakes');

const modulesToReset = [
  './src/features/deldns',
  './src/features/deldns/index',
  './src/features/deldns/utils',
  './src/features/deldns/callbacks',
  './src/features/deldns/handlers',
  './src/features/core/session',
  './src/utils/domain',
  './src/services/cloudflare',
  './src/i18n',
];

function loadDelDnsFlow() {
  clearModules(modulesToReset);

  mockModule('./src/utils/domain', {
    getConfiguredDomains: async () => ['961009.xyz', 'chriswu.de', 'example.com'],
  });

  mockModule('./src/services/cloudflare', {
    getDnsRecord: async () => ({
      records: [
        { type: 'A', content: '192.0.2.1' },
        { type: 'TXT', content: 'demo-verification' },
      ],
    }),
    deleteDnsRecord: async () => ({ success: true, message: 'DNS records deleted' }),
  });

  const i18n = require('../src/i18n');
  i18n.setLanguage('en-US');

  const deldns = require('../src/features/deldns');
  const handlers = require('../src/features/deldns/handlers');
  const { userSessions, SessionState } = require('../src/features/core/session');

  function setupDelDnsTextHandler(bot) {
    bot.on('text', async (ctx) => {
      const session = userSessions.get(ctx.chat.id);
      if (!session) return;

      if (session.state === SessionState.WAITING_SEARCH_KEYWORD_FOR_DELETE) {
        await handlers.handleSearchKeywordInputForDelete(ctx, session);
      } else if (session.state === SessionState.WAITING_SUBDOMAIN_FOR_DELETE) {
        await handlers.handleSubdomainForDelete(ctx, session);
      }
    });
  }

  return { deldns, setupDelDnsTextHandler, i18n };
}

test('/deldns domain picker follows runtime language', async () => {
  const { deldns } = loadDelDnsFlow();
  const bot = new FakeBot();
  deldns.setup(bot);

  const ctx = createCtx({ text: '/deldns' });
  await bot.runCommand('deldns', ctx);

  const message = ctx.calls.reply.at(-1).text;
  assert.match(message, /Choose a domain to delete DNS records/);
  assert.match(message, /Items 1-3, 3 domains total/);
  assert.match(message, /Supported record types/);
  assert.doesNotMatch(message, /请选择要删除DNS记录的域名/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard.at(-1)[0].text, '🔍 Search domain');
});

test('/deldns search prompt and results follow runtime language', async () => {
  const { deldns, setupDelDnsTextHandler } = loadDelDnsFlow();
  const bot = new FakeBot();
  deldns.setup(bot);
  setupDelDnsTextHandler(bot);

  const ctx = createCtx({ text: '/deldns' });
  await bot.runCommand('deldns', ctx);
  await bot.runAction('search_domains_del', ctx);

  const prompt = ctx.calls.reply.at(-1).text;
  assert.match(prompt, /Enter a domain search keyword/);
  assert.doesNotMatch(prompt, /请输入域名搜索关键字/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Cancel search');

  await bot.runText('example', ctx);

  const result = ctx.calls.reply.at(-1).text;
  assert.match(result, /Search results/);
  assert.match(result, /keyword: "example"/);
  assert.match(result, /Items 1-1, 1 domains total/);
  assert.doesNotMatch(result, /搜索结果/);
});

test('/deldns delete confirmation follows runtime language', async () => {
  const { deldns, setupDelDnsTextHandler } = loadDelDnsFlow();
  const bot = new FakeBot();
  deldns.setup(bot);
  setupDelDnsTextHandler(bot);

  const ctx = createCtx({ text: '/deldns' });
  await bot.runCommand('deldns', ctx);
  await bot.runAction('select_domain_del_example.com', ctx);

  const domainPrompt = ctx.calls.reply.at(-1).text;
  assert.match(domainPrompt, /Selected domain: example\.com/);
  assert.doesNotMatch(domainPrompt, /已选择域名/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Delete root domain');

  await bot.runText('api', ctx);

  const confirmation = ctx.calls.reply.at(-1).text;
  assert.match(confirmation, /Found these DNS records/);
  assert.match(confirmation, /Type: A/);
  assert.match(confirmation, /Delete these records/);
  assert.doesNotMatch(confirmation, /找到以下DNS记录/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Confirm delete');
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][1].callback_data, 'cancel_deldns');
});
