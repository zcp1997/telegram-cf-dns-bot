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

/**
 * 验证域名格式（用于CNAME记录）
 */
function validateDomainName(domain) {
  if (!domain) {
    return {
      success: false,
      message: '域名不能为空'
    };
  }

  // 基本的域名格式验证
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!domainRegex.test(domain)) {
    return {
      success: false,
      message: '请输入有效的域名格式（如：example.com）'
    };
  }

  // 检查域名长度
  if (domain.length > 253) {
    return {
      success: false,
      message: '域名长度不能超过253个字符'
    };
  }

  return {
    success: true,
    type: 'CNAME'
  };
}

/**
 * 验证TXT记录内容
 */
function validateTxtRecord(content) {
  if (!content) {
    return {
      success: false,
      message: 'TXT记录内容不能为空'
    };
  }

  // TXT记录内容长度限制（单个字符串最多255字符，总长度最多65535字符）
  if (content.length > 65535) {
    return {
      success: false,
      message: 'TXT记录内容长度不能超过65535个字符'
    };
  }

  // 检查是否包含不允许的字符（基本检查）
  // TXT记录可以包含大部分字符，这里只做基本验证
  return {
    success: true,
    type: 'TXT'
  };
}

/**
 * 验证DNS记录内容（通用函数）
 */
function validateDnsRecordContent(content, recordType) {
  if (!content) {
    return {
      success: false,
      message: '记录内容不能为空'
    };
  }

  switch (recordType) {
    case 'A':
    case 'AAAA':
      return validateIpAddress(content);
    
    case 'CNAME':
      return validateDomainName(content);
    
    case 'TXT':
      return validateTxtRecord(content);
    
    default:
      return {
        success: false,
        message: `不支持的记录类型: ${recordType}`
      };
  }
}

module.exports = {
  validateCloudflareConfig,
  validateDomainConfig,
  validateIpAddress,
  validateDomainName,
  validateTxtRecord,
  validateDnsRecordContent
}; 