const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeBot, createCtx, mockModule, clearModules } = require('./helpers/fakes');

const modulesToReset = [
  './src/features/getdns',
  './src/features/getdns/index',
  './src/features/getdns/utils',
  './src/features/getdns/callbacks',
  './src/utils/domain',
  './src/services/cloudflare',
  './src/i18n',
];

function loadGetDnsFlow(records = []) {
  clearModules(modulesToReset);

  mockModule('./src/utils/domain', {
    getConfiguredDomains: async () => ['961009.xyz', 'chriswu.de', 'example.com'],
  });

  mockModule('./src/services/cloudflare', {
    getDnsRecord: async () => ({ records }),
  });

  const i18n = require('../src/i18n');
  i18n.setLanguage('en-US');

  const getdns = require('../src/features/getdns');
  return { getdns, i18n };
}

test('/getdns domain picker follows runtime language', async () => {
  const { getdns } = loadGetDnsFlow();
  const bot = new FakeBot();
  getdns.setup(bot);

  const ctx = createCtx({ text: '/getdns' });
  await bot.runCommand('getdns', ctx);

  const message = ctx.calls.reply.at(-1).text;
  assert.match(message, /Choose a domain to query DNS records/);
  assert.match(message, /Items 1-3, 3 domains total/);
  assert.match(message, /Supported record types/);
  assert.doesNotMatch(message, /请选择要查询DNS记录的域名/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard.at(-1)[0].text, '🔍 Search domain');
});

test('/getdns search prompt follows runtime language', async () => {
  const { getdns } = loadGetDnsFlow();
  const bot = new FakeBot();
  getdns.setup(bot);

  const ctx = createCtx({ text: '/getdns' });
  await bot.runCommand('getdns', ctx);
  await bot.runAction('search_domains_query', ctx);

  const message = ctx.calls.reply.at(-1).text;
  assert.match(message, /Enter a domain search keyword/);
  assert.match(message, /Supported record types/);
  assert.doesNotMatch(message, /请输入域名搜索关键字/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Cancel search');
});

test('/getdns record list follows runtime language', async () => {
  const { getdns } = loadGetDnsFlow([
    { id: 'a1', zone_id: 'z1', name: 'example.com', type: 'A', content: '192.0.2.1', proxied: true },
    { id: 't1', zone_id: 'z1', name: 'txt.example.com', type: 'TXT', content: 'demo', proxied: false },
  ]);
  const bot = new FakeBot();
  getdns.setup(bot);

  const ctx = createCtx({ text: '/getdns' });
  await bot.runCommand('getdns', ctx);
  await bot.runAction('select_domain_query_example.com', ctx);
  await bot.runAction('query_root_domain', ctx);

  const message = ctx.calls.reply.at(-1).text;
  assert.match(message, /DNS records for example\.com/);
  assert.match(message, /Tap a record to update or delete it/);
  assert.match(message, /Proxy status/);
  assert.doesNotMatch(message, /的DNS记录/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard.at(-1)[0].text, 'Done');
});

test('/getdns record management prompts follow runtime language', async () => {
  const { getdns } = loadGetDnsFlow([
    { id: 'a1', zone_id: 'z1', name: 'example.com', type: 'A', content: '192.0.2.1', proxied: true },
  ]);
  const bot = new FakeBot();
  getdns.setup(bot);

  const ctx = createCtx({ text: '/getdns' });
  await bot.runCommand('getdns', ctx);
  await bot.runAction('select_domain_query_example.com', ctx);
  await bot.runAction('query_root_domain', ctx);
  await bot.runAction('dns_r_r0', ctx);

  const details = ctx.calls.reply.at(-1).text;
  assert.match(details, /DNS record details/);
  assert.match(details, /Domain: example\.com/);
  assert.match(details, /Proxy status: Enabled/);
  assert.doesNotMatch(details, /DNS记录详情/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Update record');

  await bot.runAction('dns_update_record', ctx);
  const updateChoice = ctx.calls.reply.at(-1).text;
  assert.match(updateChoice, /Choose what to update/);
  assert.match(updateChoice, /Current IP: 192\.0\.2\.1/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, '🔄 Update IP address');

  await bot.runAction('dns_update_ip', ctx);
  const updatePrompt = ctx.calls.reply.at(-1).text;
  assert.match(updatePrompt, /Enter the new IPv4 address for example\.com/);
  assert.doesNotMatch(updatePrompt, /请输入/);

  await bot.runAction('cancel_update_dns', ctx);
  await bot.runAction('dns_r_r0', ctx);
  await bot.runAction('dns_delete_record', ctx);

  const deletePrompt = ctx.calls.reply.at(-1).text;
  assert.match(deletePrompt, /Delete this DNS record/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].text, 'Confirm delete');
});
