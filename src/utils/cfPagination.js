const axios = require('axios');
const { CF_API_TOKEN } = require('../config');
const { t } = require('../i18n');

// 按 result_info.total_pages 逐页拉取 Cloudflare 列表接口的全部结果
// Cloudflare 默认 zone 每页 20 个、DNS 记录每页 100 条，不分页会漏数据
async function fetchAllPages(url, { params = {}, perPage = 50 } = {}) {
  const results = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: { ...params, page, per_page: perPage }
    });

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || t('cloudflare.listFailed'));
    }

    results.push(...(response.data.result || []));
    totalPages = response.data.result_info?.total_pages || 1;
    page++;
  } while (page <= totalPages);

  return results;
}

module.exports = {
  fetchAllPages
};
