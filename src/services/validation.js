const axios = require('axios');
const net = require('net');
const { CF_API_TOKEN, CF_API_BASE } = require('../config');
const { getAvailableDomains } = require('../utils/domain');

/**
 * 验证 Cloudflare 配置
 * 检查 API Token 是否有效
 */
async function validateCloudflareConfig() {
  try {
    // 检查必要的环境变量
    if (!CF_API_TOKEN) {
      throw new Error('未配置 CF_API_TOKEN');
    }

    // 验证API Token是否有效
    const response = await axios.get(`${CF_API_BASE}`, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.success) {
      throw new Error('API Token 无效或无权限访问 Cloudflare API');
    }

    // 检查是否有可用的域名
    const availableDomains = await getAvailableDomains();
    if (availableDomains.length === 0) {
      throw new Error('API Token 没有任何可管理的域名，请检查权限或EXCLUDE_DOMAINS配置');
    }

    console.log(`Cloudflare 配置验证成功，可管理 ${availableDomains.length} 个域名`);
    return {
      success: true,
      message: `Cloudflare 配置验证成功，可管理 ${availableDomains.length} 个域名`
    };
  } catch (error) {
    console.error('Cloudflare 配置验证失败:', error);
    return {
      success: false,
      message: `Cloudflare 配置验证失败: ${error.message}`
    };
  }
}

/**
 * 验证域名配置
 * 检查域名是否在可管理的域名中
 */
async function validateDomainConfig(domain) {
  try {
    const { getZoneIdForDomain } = require('../utils/domain');
    const zoneId = await getZoneIdForDomain(domain);

    if (!zoneId) {
      return {
        success: false,
        message: `域名 ${domain} 不在任何可管理的 Zone 中`
      };
    }

    return {
      success: true,
      message: `域名 ${domain} 配置有效`,
      zoneId
    };
  } catch (error) {
    return {
      success: false,
      message: `验证域名配置时发生错误: ${error.message}`
    };
  }
}

/**
 * 验证 IP 地址格式
 */
function validateIpAddress(ip) {
  if (!ip) {
    return {
      success: false,
      message: 'IP地址不能为空'
    };
  }

  // 使用 Node.js 的 net 模块验证 IP 地址
  if (net.isIP(ip) === 4) {
    return {
      success: true,
      type: 'A'
    };
  } else if (net.isIP(ip) === 6) {
    return {
      success: true,
      type: 'AAAA'
    };
  }

  // 如果既不是有效的IPv4也不是有效的IPv6
  return {
    success: false,
    message: '请输入有效的IP地址（IPv4或IPv6）'
  };
}

module.exports = {
  validateCloudflareConfig,
  validateDomainConfig,
  validateIpAddress
}; 