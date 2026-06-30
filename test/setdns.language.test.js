const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeBot, createCtx, mockModule, clearModules } = require('./helpers/fakes');

const modulesToReset = [
  './src/features/setdns',
  './src/features/setdns/index',
  './src/features/setdns/utils',
  './src/features/setdns/callbacks',
  './src/features/setdns/handlers',
  './src/features/core/session',
  './src/utils/domain',
  './src/services/cloudflare',
  './src/services/validation',
  './src/i18n',
];

function loadSetDnsFlow() {
  clearModules(modulesToReset);

  mockModule('./src/utils/domain', {
    getConfiguredDomains: async () => ['961009.xyz', 'chriswu.de', 'example.com'],
  });

  mockModule('./src/services/cloudflare', {
    createOrUpdateDns: async () => ({ success: true, message: 'Record added to Cloudflare' }),
  });

  mockModule('./src/services/validation', {
    validateDnsRecordContent: () => ({ success: true }),
  });

  const i18n = require('../src/i18n');
  i18n.setLanguage('en-US');

  const setdns = require('../src/features/setdns');
  const handlers = require('../src/features/setdns/handlers');
  const { userSessions, SessionState } = require('../src/features/core/session');

  function setupSetDnsTextHandler(bot) {
    bot.on('text', async (ctx) => {
      const session = userSessions.get(ctx.chat.id);
      if (!session) return;

      if (session.state === SessionState.WAITING_SEARCH_KEYWORD_FOR_SET) {
        await handlers.handleSearchKeywordInputForSet(ctx, session);
      } else if (session.state === SessionState.WAITING_RECORD_CONTENT) {
        await handlers.handleRecordContentInput(ctx, session);
      } else if (session.state === SessionState.WAITING_SUBDOMAIN_FOR_SET) {
        await handlers.handleSubdomainForSet(ctx, session);
      }
    });
  }

  return { setdns, setupSetDnsTextHandler, i18n };
}

test('/setdns domain picker follows runtime language', async () => {
  const { setdns } = loadSetDnsFlow();
  const bot = new FakeBot();
  setdns.setup(bot);

  const ctx = createCtx({ text: '/setdns' });
  await bot.runCommand('setdns', ctx);

  const message = ctx.calls.reply.at(-1).text;
  assert.match(message, /Choose a domain to set DNS records/);
  assert.match(message, /Items 1-3, 3 domains total/);
  assert.match(message, /Supported record types/);
  assert.doesNotMatch(message, /请选择要设置DNS记录的域名/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard.at(-1)[0].text, '🔍 Search domain');
});

test('/setdns search prompt and results follow runtime language', async () => {
  const { setdns, setupSetDnsTextHandler } = loadSetDnsFlow();
  const bot = new FakeBot();
  setdns.setup(bot);
  setupSetDnsTextHandler(bot);

  const ctx = createCtx({ text: '/setdns' });
  await bot.runCommand('setdns', ctx);
  await bot.runAction('search_domains_set', ctx);

  const prompt = ctx.calls.reply.at(-1).text;
  assert.match(prompt, /Enter a domain search keyword/);
  assert.doesNotMatch(prompt, /请输入域名搜索关键字/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Cancel search');

  await bot.runText('chris', ctx);

  const result = ctx.calls.reply.at(-1).text;
  assert.match(result, /Search results/);
  assert.match(result, /keyword: "chris"/);
  assert.match(result, /Items 1-1, 1 domains total/);
  assert.doesNotMatch(result, /搜索结果/);
});

test('/setdns record type and content prompts follow runtime language', async () => {
  const { setdns, setupSetDnsTextHandler } = loadSetDnsFlow();
  const bot = new FakeBot();
  setdns.setup(bot);
  setupSetDnsTextHandler(bot);

  const ctx = createCtx({ text: '/setdns' });
  await bot.runCommand('setdns', ctx);
  await bot.runAction('select_domain_set_example.com', ctx);

  const domainPrompt = ctx.calls.reply.at(-1).text;
  assert.match(domainPrompt, /Selected domain: example\.com/);
  assert.doesNotMatch(domainPrompt, /已选择域名/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Use root domain');

  await bot.runAction('set_root_domain', ctx);
  const typePrompt = ctx.calls.reply.at(-1).text;
  assert.match(typePrompt, /Choose the DNS record type to set for example\.com/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, '4️⃣ A record (IPv4)');

  await bot.runAction('select_record_type_A', ctx);
  const contentPrompt = ctx.calls.reply.at(-1).text;
  assert.match(contentPrompt, /Enter the IPv4 address for example\.com/);
  assert.doesNotMatch(contentPrompt, /请输入/);

  await bot.runText('192.0.2.1', ctx);
  const proxyPrompt = ctx.calls.reply.at(-1).text;
  assert.match(proxyPrompt, /Enable Cloudflare proxy for example\.com/);
  assert.match(proxyPrompt, /Proxy hides the origin IP/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, '❌ Disable proxy');
});
