const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeBot, createCtx, mockModule, clearModules } = require('./helpers/fakes');

const modulesToReset = [
  './src/features/ddns',
  './src/features/ddns/index',
  './src/features/ddns/callbacks',
  './src/features/ddns/handlers',
  './src/features/ddns/utils',
  './src/features/core/texthandler',
  './src/utils/domain',
  './src/utils/ip',
  './src/services/ddns',
  './src/features/core/session',
  './src/features/setdns/handlers',
  './src/features/deldns/handlers',
  './src/features/getdns/handlers',
  './src/features/dnschangelogs/handlers',
];

function loadDDNSFlow({ domains = ['example.com'], startCalls = [] } = {}) {
  clearModules(modulesToReset);

  mockModule('./src/utils/domain', {
    getConfiguredDomains: async () => domains,
  });

  mockModule('./src/utils/ip', {
    getCurrentIPv4: async () => '203.0.113.8',
    getCurrentIPv6: async () => '2001:db8::8',
  });

  mockModule('./src/services/ddns', {
    startDDNS: (chatId, domain, interval, telegram) => {
      startCalls.push({ chatId, domain, interval, telegram });
      return { chatId, domain, interval };
    },
    stopDDNS: () => true,
    getAllDDNSTasks: () => [],
  });

  mockModule('./src/features/setdns/handlers', {
    handleRecordContentInput: async () => {},
    handleSubdomainForSet: async () => {},
    handleSearchKeywordInputForSet: async () => {},
  });
  mockModule('./src/features/deldns/handlers', {
    handleSubdomainForDelete: async () => {},
    handleSearchKeywordInputForDelete: async () => {},
  });
  mockModule('./src/features/getdns/handlers', {
    handleDnsUpdateIpInput: async () => {},
    handleSubdomainInput: async () => {},
    handleSearchKeywordInput: async () => {},
  });
  mockModule('./src/features/dnschangelogs/handlers', {
    handleDnsLogsSearchKeywordInput: async () => {},
  });

  const ddns = require('../src/features/ddns');
  const { setupTextHandler } = require('../src/features/core/texthandler');
  const { userSessions, SessionState } = require('../src/features/core/session');
  return { ddns, setupTextHandler, userSessions, SessionState };
}

test('DDNS setup flow runs without Telegram client', async () => {
  const startCalls = [];
  const { ddns, setupTextHandler, userSessions, SessionState } = loadDDNSFlow({ startCalls });
  const bot = new FakeBot();
  ddns.setup(bot);
  setupTextHandler(bot);

  const ctx = createCtx({ text: '/ddns' });

  await bot.runCommand('ddns', ctx);
  assert.equal(userSessions.get(ctx.chat.id).state, SessionState.SELECTING_DOMAIN_FOR_DDNS);
  assert.match(ctx.calls.reply.at(-1).text, /请选择要设置DDNS的域名/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard[0][0].callback_data, 'select_domain_ddns_example.com');

  await bot.runAction('select_domain_ddns_example.com', ctx);
  assert.equal(userSessions.get(ctx.chat.id).state, SessionState.WAITING_SUBDOMAIN_FOR_DDNS);
  assert.match(ctx.calls.reply.at(-1).text, /已选择域名: example\.com/);

  await bot.runText('api', ctx);
  assert.equal(userSessions.get(ctx.chat.id).state, SessionState.WAITING_INTERVAL_FOR_DDNS);
  assert.match(ctx.calls.reply.at(-1).text, /api\.example\.com 的DDNS刷新间隔/);

  await bot.runText('30', ctx);
  assert.equal(startCalls.length, 1);
  assert.deepEqual(
    { chatId: startCalls[0].chatId, domain: startCalls[0].domain, interval: startCalls[0].interval },
    { chatId: ctx.chat.id, domain: 'api.example.com', interval: 30 }
  );
  assert.equal(userSessions.has(ctx.chat.id), false);
  assert.match(ctx.calls.telegramEditMessageText.at(-1).text, /DDNS配置已完成/);
});
