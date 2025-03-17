const { CF_API_TOKEN, EXCLUDE_DOMAINS } = require('../config');
const axios = require('axios');
const { CF_API_BASE } = require('../config');

// 缓存域名到zoneId的映射
let domainZoneCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 3600000; // 缓存有效期1小时

// 获取所有可用区域及其ID的映射
async function fetchZonesMapping() {
  try {
    const response = await axios.get(`${CF_API_BASE}`, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success && response.data.result.length > 0) {
      // 创建域名到zoneId的映射
      const mapping = {};
      response.data.result.forEach(zone => {
        // 排除不需要管理的域名
        if (!EXCLUDE_DOMAINS.includes(zone.name)) {
          mapping[zone.name] = zone.id;
        }
      });
      return mapping;
    }
    return {};
  } catch (error) {
    console.error('获取域名区域映射失败:', error.message);
    return {};
  }
}

// 获取域名对应的Zone ID，带缓存
async function getZoneIdForDomain(domainName) {
  // 检查缓存是否过期
  const now = Date.now();
  if (!domainZoneCache || now - lastCacheTime > CACHE_TTL) {
    domainZoneCache = await fetchZonesMapping();
    lastCacheTime = now;
    console.log('已更新域名区域映射缓存:', domainZoneCache);
  }

  // 直接匹配完整域名
  if (domainZoneCache[domainName]) {
    return domainZoneCache[domainName];
  }

  // 查找可能的父域名
  const domainParts = domainName.split('.');
  while (domainParts.length > 2) {
    domainParts.shift();
    const parentDomain = domainParts.join('.');
    if (domainZoneCache[parentDomain]) {
      return domainZoneCache[parentDomain];
    }
  }

  return null;
}

// 获取所有可用域名
async function getAvailableDomains() {
  // 确保缓存是最新的
  const now = Date.now();
  if (!domainZoneCache || now - lastCacheTime > CACHE_TTL) {
    domainZoneCache = await fetchZonesMapping();
    lastCacheTime = now;
  }
  
  return Object.keys(domainZoneCache);
}

// 为了兼容现有代码，保留getConfiguredDomains函数，但改为调用新的API
async function getConfiguredDomains() {
  return await getAvailableDomains();
}

module.exports = {
  getZoneIdForDomain,
  getAvailableDomains,
  getConfiguredDomains
};
