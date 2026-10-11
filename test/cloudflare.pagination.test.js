const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { mockModule, clearModules } = require('./helpers/fakes');

const modulesToReset = [
  './src/utils/cfPagination',
  './src/utils/domain',
  './src/services/cloudflare',
];

// 测试环境不依赖 node_modules，用假的 axios 按 page 参数返回分页数据
function stubAxios(get) {
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return request === 'axios' ? 'axios-stub' : originalResolve.call(this, request, ...args);
  };
  require.cache['axios-stub'] = { id: 'axios-stub', filename: 'axios-stub', loaded: true, exports: { get } };

  return () => {
    Module._resolveFilename = originalResolve;
    delete require.cache['axios-stub'];
  };
}

function paged(items, perPage, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  return {
    data: {
      success: true,
      result: items.slice((page - 1) * perPage, page * perPage),
      result_info: { page, per_page: perPage, total_pages: totalPages, total_count: items.length },
    },
  };
}

test('zone list fetches every page', async () => {
  const zones = Array.from({ length: 120 }, (_, i) => ({ name: `domain${i}.com`, id: `zone-${i}` }));
  const requests = [];
  clearModules(modulesToReset);
  const restoreAxios = stubAxios(async (url, { params }) => {
    requests.push(params);
    return paged(zones, params.per_page, params.page);
  });

  try {
    const { getAvailableDomains, getZoneIdForDomain } = require('../src/utils/domain');
    const domains = await getAvailableDomains();

    assert.equal(domains.length, 120);
    assert.deepEqual(requests.map(p => p.page), [1, 2, 3]);
    assert.ok(requests.every(p => p.per_page === 50));
    assert.equal(await getZoneIdForDomain('api.domain119.com'), 'zone-119');
  } finally {
    restoreAxios();
    clearModules(modulesToReset);
  }
});

test('DNS record query fetches every page and keeps the name filter', async () => {
  const records = Array.from({ length: 250 }, (_, i) => ({
    id: `rec-${i}`,
    type: i % 10 === 0 ? 'MX' : 'A',
    name: `host${i}.example.com`,
    content: `192.0.2.${i % 255}`,
  }));
  const requests = [];
  clearModules(modulesToReset);
  mockModule('./src/utils/domain', { getZoneIdForDomain: async () => 'zone-1' });
  mockModule('./src/utils/dnsLogger', { logDnsOperation: () => {} });
  const restoreAxios = stubAxios(async (url, { params }) => {
    requests.push({ url, params });
    return paged(records, params.per_page, params.page);
  });

  try {
    const { getDnsRecord } = require('../src/services/cloudflare');

    const all = await getDnsRecord('example.com', true);
    assert.equal(all.records.length, 225);
    assert.ok(all.records.every(record => record.zone_id === 'zone-1'));
    assert.deepEqual(requests.map(r => r.params.page), [1, 2, 3]);
    assert.ok(requests.every(r => r.url.endsWith('/zone-1/dns_records')));

    requests.length = 0;
    await getDnsRecord('host1.example.com');
    assert.ok(requests.every(r => r.params.name === 'host1.example.com'));
  } finally {
    restoreAxios();
    clearModules(['./src/utils/dnsLogger', ...modulesToReset]);
  }
});

test('pagination stops after one page when result_info is missing', async () => {
  let calls = 0;
  clearModules(modulesToReset);
  const restoreAxios = stubAxios(async () => {
    calls++;
    return { data: { success: true, result: [{ name: 'only.com', id: 'zone-only' }] } };
  });

  try {
    const { fetchAllPages } = require('../src/utils/cfPagination');
    const result = await fetchAllPages('https://api.cloudflare.com/client/v4/zones');
    assert.equal(result.length, 1);
    assert.equal(calls, 1);
  } finally {
    restoreAxios();
    clearModules(modulesToReset);
  }
});
