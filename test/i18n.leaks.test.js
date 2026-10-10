const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { mockModule, clearModules } = require('./helpers/fakes');

const CJK = /[一-鿿]/;

// 测试环境不依赖 node_modules；这些用例在 axios 被调用前就会返回
function stubAxios() {
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return request === 'axios' ? 'axios-stub' : originalResolve.call(this, request, ...args);
  };
  require.cache['axios-stub'] = { id: 'axios-stub', filename: 'axios-stub', loaded: true, exports: {} };

  return () => {
    Module._resolveFilename = originalResolve;
    delete require.cache['axios-stub'];
  };
}

function withEnglish(modulePaths) {
  clearModules(['./src/i18n', ...modulePaths]);
  const i18n = require('../src/i18n');
  i18n.setLanguage('zh-CN');
  return i18n;
}

test('every user-facing locale key exists in English without Chinese text', () => {
  const zhCN = require('../src/i18n/locales/zh-CN');
  const enUS = require('../src/i18n/locales/en-US');

  assert.deepEqual(Object.keys(enUS).sort(), Object.keys(zhCN).sort());
  for (const [key, value] of Object.entries(enUS)) {
    assert.ok(!CJK.test(value), `en-US ${key} contains Chinese: ${value}`);
  }
});

test('command menu descriptions follow runtime language switch', () => {
  const restoreAxios = stubAxios();
  const i18n = withEnglish([
    './src/services/cloudflare',
    './src/features/admin/utils',
    './src/features/getdns/utils',
    './src/features/setdns/utils',
    './src/features/deldns/utils',
    './src/features/ddns/utils',
    './src/features/dnschangelogs/utils',
  ]);
  mockModule('./src/utils/dnsLogger', { logDnsOperation: () => {} });

  const modules = [
    require('../src/features/admin/utils').commands,
    [require('../src/features/getdns/utils').command, require('../src/features/getdns/utils').commandAll],
    [require('../src/features/setdns/utils').command],
    [require('../src/features/deldns/utils').command],
    require('../src/features/ddns/utils').commands,
    [require('../src/features/dnschangelogs/utils').command],
  ].flat();

  assert.ok(modules.every(cmd => CJK.test(cmd.description)));

  i18n.setLanguage('en-US');
  for (const cmd of modules) {
    assert.ok(!CJK.test(cmd.description), `${cmd.command}: ${cmd.description}`);
  }
  // Telegram 序列化命令时需要能拿到 getter 的值
  assert.ok(!CJK.test(JSON.stringify(modules)));
  restoreAxios();
  clearModules(['./src/utils/dnsLogger', './src/services/cloudflare', './src/features/getdns/utils']);
});

test('onLanguageChange fires only when language actually changes', () => {
  const i18n = withEnglish([]);
  const changes = [];
  i18n.onLanguageChange(language => changes.push(language));

  i18n.setLanguage('zh-CN');
  i18n.setLanguage('en-US');
  i18n.setLanguage('en');

  assert.deepEqual(changes, ['en-US']);
});

test('validation messages follow current language', () => {
  const i18n = withEnglish(['./src/services/validation']);
  const restoreAxios = stubAxios();
  mockModule('./src/utils/domain', { getAvailableDomains: async () => [], getZoneIdForDomain: async () => null });
  const validation = require('../src/services/validation');

  i18n.setLanguage('en-US');
  const results = [
    validation.validateIpAddress(''),
    validation.validateIpAddress('not-an-ip'),
    validation.validateDomainName('a..b'),
    validation.validateDomainName('localhost'),
    validation.validateDomainName('-bad.example.com'),
    validation.validateDomainName('example.c0m'),
    validation.validateTxtRecord(''),
    validation.validateDnsRecordContent('x', 'MX'),
  ];

  for (const result of results) {
    assert.equal(result.success, false);
    assert.ok(!CJK.test(result.message), result.message);
  }
  restoreAxios();
  clearModules(['./src/utils/domain', './src/services/validation']);
});

test('cloudflare service messages follow current language', async () => {
  const i18n = withEnglish(['./src/services/cloudflare']);
  const restoreAxios = stubAxios();
  mockModule('./src/utils/dnsLogger', { logDnsOperation: () => {} });
  mockModule('./src/utils/domain', { getZoneIdForDomain: async () => null });
  const cloudflare = require('../src/services/cloudflare');

  i18n.setLanguage('en-US');
  await assert.rejects(cloudflare.getDnsRecord('api.example.com'), /No Zone ID found for domain api\.example\.com/);

  const result = await cloudflare.createOrUpdateDns('api.example.com', '203.0.113.8');
  assert.equal(result.success, false);
  assert.match(result.message, /^Operation failed: No Zone ID found/);

  const deleteResult = await cloudflare.deleteDnsRecord('api.example.com');
  assert.match(deleteResult.message, /^Deletion failed: No Zone ID found/);

  restoreAxios();
  clearModules(['./src/utils/dnsLogger', './src/utils/domain', './src/services/cloudflare']);
});

test('DDNS background notifications follow current language', async () => {
  const i18n = withEnglish(['./src/services/ddns']);
  mockModule('./src/services/cloudflare', {
    createOrUpdateDns: async () => ({ success: true }),
  });
  mockModule('./src/utils/ip', {
    getCurrentIPv4: async () => '203.0.113.8',
    getCurrentIPv6: async () => null,
  });
  mockModule('./src/services/ddns-persistence', { saveDDNSConfig: async () => true });
  const { startDDNS, stopDDNS } = require('../src/services/ddns');

  i18n.setLanguage('en-US');
  const sent = [];
  const telegram = { sendMessage: (chatId, text) => sent.push(text) };
  startDDNS(1001, 'home.example.com', 3600, telegram);
  await new Promise(resolve => setImmediate(resolve));
  stopDDNS('home.example.com');

  assert.equal(sent.length, 1);
  assert.match(sent[0], /^✅ DDNS updated: home\.example\.com\nIPv4: 203\.0\.113\.8\nTime: /);
  assert.ok(!CJK.test(sent[0]), sent[0]);

  clearModules(['./src/services/cloudflare', './src/utils/ip', './src/services/ddns-persistence', './src/services/ddns']);
});

test('language choice is persisted and restored', () => {
  const previousCwd = process.cwd();
  const projectRoot = previousCwd;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-dns-bot-lang-'));
  const modulePath = path.join(projectRoot, 'src/services/language-persistence.js');

  try {
    process.chdir(tmpDir);
    delete require.cache[modulePath];
    const { loadSavedLanguage, saveLanguage } = require(modulePath);

    assert.equal(loadSavedLanguage(), null);
    assert.equal(saveLanguage('en-US'), true);
    assert.equal(loadSavedLanguage(), 'en-US');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmpDir, 'config/settings.json'), 'utf8')), { language: 'en-US' });
  } finally {
    process.chdir(previousCwd);
    delete require.cache[modulePath];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('DDNS notifies failure when Cloudflare returns success: false', async () => {
  const i18n = withEnglish(['./src/services/ddns']);
  mockModule('./src/services/cloudflare', {
    createOrUpdateDns: async () => ({ success: false, message: 'Operation failed: boom' }),
  });
  mockModule('./src/utils/ip', {
    getCurrentIPv4: async () => '203.0.113.8',
    getCurrentIPv6: async () => null,
  });
  mockModule('./src/services/ddns-persistence', { saveDDNSConfig: async () => true });
  const { startDDNS, stopDDNS } = require('../src/services/ddns');

  i18n.setLanguage('en-US');
  const sent = [];
  const telegram = { sendMessage: (chatId, text) => sent.push(text) };
  const originalConsoleError = console.error;
  console.error = () => {};
  const session = startDDNS(1001, 'home.example.com', 3600, telegram);
  await new Promise(resolve => setImmediate(resolve));
  console.error = originalConsoleError;
  stopDDNS('home.example.com');

  assert.equal(sent.length, 1);
  assert.match(sent[0], /^❌ DDNS update failed: home\.example\.com\nError: Operation failed: boom/);
  assert.equal(session.errorCount, 1);
  assert.equal(session.lastIPv4, null);

  clearModules(['./src/services/cloudflare', './src/utils/ip', './src/services/ddns-persistence', './src/services/ddns']);
});
