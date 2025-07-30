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
 * 使用Node.js内置的URL模块和更严格的验证规则
 */
function validateDomainName(domain) {
  if (!domain) {
    return {
      success: false,
      message: '域名不能为空'
    };
  }

  // 去除前后空格并转为小写
  const cleanDomain = domain.trim().toLowerCase();

  // 检查域名长度
  if (cleanDomain.length === 0) {
    return {
      success: false,
      message: '域名不能为空'
    };
  }

  if (cleanDomain.length > 253) {
    return {
      success: false,
      message: '域名长度不能超过253个字符'
    };
  }

  // 检查是否包含无效字符
  if (cleanDomain.includes('..') || cleanDomain.startsWith('.') || cleanDomain.endsWith('.')) {
    return {
      success: false,
      message: '域名格式无效：不能包含连续的点号，不能以点号开头或结尾'
    };
  }

  // 使用Node.js内置的URL模块验证域名
  try {
    // 构造一个URL来验证域名格式
    const testUrl = new URL(`http://${cleanDomain}`);
    
    // 验证主机名是否与输入的域名一致
    if (testUrl.hostname !== cleanDomain) {
      return {
        success: false,
        message: '域名格式无效：包含非法字符'
      };
    }
  } catch (error) {
    return {
      success: false,
      message: '请输入有效的域名格式（如：example.com、subdomain.example.org）'
    };
  }

  // 验证域名的各个部分
  const parts = cleanDomain.split('.');
  
  // 至少需要两个部分（如：example.com）
  if (parts.length < 2) {
    return {
      success: false,
      message: '域名必须包含至少一个点号（如：example.com）'
    };
  }

  // 验证每个部分
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // 每个部分不能为空
    if (part.length === 0) {
      return {
        success: false,
        message: '域名的各个部分不能为空'
      };
    }
    
    // 每个部分长度不能超过63个字符
    if (part.length > 63) {
      return {
        success: false,
        message: `域名的每个部分不能超过63个字符，"${part}"过长`
      };
    }
    
    // 每个部分不能以连字符开头或结尾
    if (part.startsWith('-') || part.endsWith('-')) {
      return {
        success: false,
        message: `域名的每个部分不能以连字符开头或结尾："${part}"`
      };
    }
    
    // 验证字符：只能包含字母、数字和连字符
    if (!/^[a-z0-9-]+$/.test(part)) {
      return {
        success: false,
        message: `域名只能包含字母、数字和连字符："${part}"包含无效字符`
      };
    }
  }

  // 验证顶级域名（最后一个部分）
  const tld = parts[parts.length - 1];
  if (!/^[a-z]+$/.test(tld)) {
    return {
      success: false,
      message: `顶级域名只能包含字母："${tld}"`
    };
  }

  if (tld.length < 2) {
    return {
      success: false,
      message: `顶级域名至少需要2个字符："${tld}"`
    };
  }

  return {
    success: true,
    type: 'CNAME',
    domain: cleanDomain
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