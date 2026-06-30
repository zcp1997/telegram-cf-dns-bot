const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeBot, createCtx, mockModule, clearModules } = require('./helpers/fakes');

const sampleLogs = [
  {
    date: '2026-06-30',
    timestamp: '2026-06-30 12:00:00',
    operation: 'update',
    domain: 'api.example.com',
    recordType: 'A',
    ipAddress: '203.0.113.10',
    oldIpAddress: '203.0.113.9',
    proxied: true,
    oldProxied: false,
  },
  {
    date: '2026-06-29',
    timestamp: '2026-06-29 12:00:00',
    operation: 'create',
    domain: 'www.example.com',
    recordType: 'CNAME',
    ipAddress: 'target.example.net',
    proxied: false,
  },
  {
    date: '2026-06-28',
    timestamp: '2026-06-28 12:00:00',
    operation: 'delete',
    domain: 'other.test',
    recordType: 'A',
    ipAddress: '198.51.100.2',
    proxied: false,
  },
];

const modulesToReset = [
  './src/features/dnschangelogs',
  './src/features/dnschangelogs/index',
  './src/features/dnschangelogs/callbacks',
  './src/features/dnschangelogs/handlers',
  './src/features/dnschangelogs/utils',
  './src/features/core/texthandler',
  './src/features/core/session',
  './src/utils/dnsLogger',
];

function loadDnsLogsFlow() {
  clearModules(modulesToReset);

  mockModule('./src/utils/dnsLogger', {
    getAvailableLogDates: () => ['2026-06-30', '2026-06-29'],
    getDnsLogs: (date) => sampleLogs.filter(log => log.date === date),
    searchDnsLogsByDomain: (keyword) => {
      const normalizedKeyword = keyword.toLowerCase();
      return sampleLogs.filter(log => log.domain.toLowerCase().includes(normalizedKeyword));
    },
  });

  mockModule('./src/features/setdns/handlers', {
    handleRecordContentInput: async () => {},
    handleSubdomainForSet: async () => {},
    handleSearchKeywordInputForSet: async () => {},
  });
  mockModule('./src/features/ddns/handlers', {
    handleSubdomainForDDNS: async () => {},
    handleIntervalForDDNS: async () => {},
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

  const dnschangelogs = require('../src/features/dnschangelogs');
  const { setupTextHandler } = require('../src/features/core/texthandler');
  const { userSessions, SessionState } = require('../src/features/core/session');
  return { dnschangelogs, setupTextHandler, userSessions, SessionState };
}

test('/dnschangelogs keyword renders fuzzy domain search results', async () => {
  const { dnschangelogs, userSessions } = loadDnsLogsFlow();
  const bot = new FakeBot();
  dnschangelogs.setup(bot);

  const ctx = createCtx({ text: '/dnschangelogs example.com' });
  await bot.runCommand('dnschangelogs', ctx);

  assert.match(ctx.calls.reply.at(-1).text, /域名包含“example\.com”/);
  assert.match(ctx.calls.reply.at(-1).text, /api\.example\.com/);
  assert.match(ctx.calls.reply.at(-1).text, /www\.example\.com/);
  assert.equal(userSessions.get(ctx.chat.id).dnsLogsSearchKeyword, 'example.com');
});

test('DNS log search button, text input, and paging run without Telegram client', async () => {
  const { dnschangelogs, setupTextHandler, userSessions, SessionState } = loadDnsLogsFlow();
  const bot = new FakeBot();
  dnschangelogs.setup(bot);
  setupTextHandler(bot);

  const ctx = createCtx({ text: '/dnschangelogs' });
  await bot.runCommand('dnschangelogs', ctx);
  assert.match(ctx.calls.reply.at(-1).text, /请选择要查看的日志日期/);
  assert.equal(ctx.calls.reply.at(-1).extra.reply_markup.inline_keyboard.at(-2)[0].callback_data, 'dnslogs_search_domain');

  await bot.runAction('dnslogs_search_domain', ctx);
  assert.equal(userSessions.get(ctx.chat.id).state, SessionState.WAITING_DOMAIN_FOR_DNS_LOGS);
  assert.match(ctx.calls.editMessageText.at(-1).text, /请输入要查询的域名关键字/);

  await bot.runText('example', ctx);
  assert.equal(userSessions.get(ctx.chat.id).dnsLogsSearchKeyword, 'example');
  assert.match(ctx.calls.reply.at(-1).text, /api\.example\.com/);

  await bot.runAction('search_logs:0', ctx);
  assert.match(ctx.calls.editMessageText.at(-1).text, /域名包含“example”/);
  assert.match(ctx.calls.editMessageText.at(-1).text, /www\.example\.com/);
});
