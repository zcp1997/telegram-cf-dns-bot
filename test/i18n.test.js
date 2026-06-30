const test = require('node:test');
const assert = require('node:assert/strict');
const { clearModules } = require('./helpers/fakes');

const i18nRequirePath = '../src/i18n';
const i18nCachePath = './src/i18n';

test('t returns Chinese by default and supports explicit English', () => {
  const { t } = require(i18nRequirePath);

  assert.equal(t('ddns.noRunningTasks'), '当前没有运行中的DDNS任务。');
  assert.equal(t('ddns.noRunningTasks', {}, 'en-US'), 'No DDNS tasks are currently running.');
  assert.equal(t('ddns.stoppedTask', { domain: 'api.example.com' }), '已停止 api.example.com 的DDNS任务。');
});

test('default language follows BOT_LANGUAGE when module loads', () => {
  const previousLanguage = process.env.BOT_LANGUAGE;
  process.env.BOT_LANGUAGE = 'en-US';

  clearModules([i18nCachePath]);
  const { defaultLanguage, t } = require(i18nRequirePath);

  assert.equal(defaultLanguage, 'en-US');
  assert.equal(t('dnsLogs.searchByDomain'), 'Search by domain');

  if (previousLanguage === undefined) {
    delete process.env.BOT_LANGUAGE;
  } else {
    process.env.BOT_LANGUAGE = previousLanguage;
  }
  clearModules([i18nCachePath]);
});
