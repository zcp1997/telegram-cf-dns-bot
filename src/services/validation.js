const axios = require('axios');
const net = require('net');
const { CF_API_TOKEN, CF_API_BASE } = require('../config');
const { getAvailableDomains } = require('../utils/domain');
const { t } = require('../i18n');

/**
 * 验证 Cloudflare 配置
 * 检查 API Token 是否有效
 */
async function validateCloudflareConfig() {
  try {
    // 检查必要的环境变量
    if (!CF_API_TOKEN) {
      throw new Error(t('validation.cfTokenMissing'));
    }

    // 验证API Token是否有效
    const response = await axios.get(`${CF_API_BASE}`, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.success) {
      throw new Error(t('validation.cfTokenInvalid'));
    }

    // 检查是否有可用的域名
    const availableDomains = await getAvailableDomains();
    if (availableDomains.length === 0) {
      throw new Error(t('validation.cfNoDomains'));
    }

    console.log(`Cloudflare 配置验证成功，可管理 ${availableDomains.length} 个域名`);
    return {
      success: true,
      message: t('validation.cfConfigValid', { count: availableDomains.length })
    };
  } catch (error) {
    console.error('Cloudflare 配置验证失败:', error);
    return {
      success: false,
      message: t('validation.cfConfigInvalid', { message: error.message })
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
        message: t('validation.domainNotInZone', { domain })
      };
    }

    return {
      success: true,
      message: t('validation.domainConfigValid', { domain }),
      zoneId
    };
  } catch (error) {
    return {
      success: false,
      message: t('validation.domainConfigError', { message: error.message })
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
      message: t('validation.ipEmpty')
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
    message: t('validation.ipInvalid')
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
      message: t('validation.domainEmpty')
    };
  }

  // 去除前后空格并转为小写
  const cleanDomain = domain.trim().toLowerCase();

  // 检查域名长度
  if (cleanDomain.length === 0) {
    return {
      success: false,
      message: t('validation.domainEmpty')
    };
  }

  if (cleanDomain.length > 253) {
    return {
      success: false,
      message: t('validation.domainTooLong')
    };
  }

  // 检查是否包含无效字符
  if (cleanDomain.includes('..') || cleanDomain.startsWith('.') || cleanDomain.endsWith('.')) {
    return {
      success: false,
      message: t('validation.domainDots')
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
        message: t('validation.domainIllegalChars')
      };
    }
  } catch (error) {
    return {
      success: false,
      message: t('validation.domainInvalidFormat')
    };
  }

  // 验证域名的各个部分
  const parts = cleanDomain.split('.');
  
  // 至少需要两个部分（如：example.com）
  if (parts.length < 2) {
    return {
      success: false,
      message: t('validation.domainNeedsDot')
    };
  }

  // 验证每个部分
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // 每个部分不能为空
    if (part.length === 0) {
      return {
        success: false,
        message: t('validation.domainEmptyLabel')
      };
    }
    
    // 每个部分长度不能超过63个字符
    if (part.length > 63) {
      return {
        success: false,
        message: t('validation.domainLabelTooLong', { part })
      };
    }
    
    // 每个部分不能以连字符开头或结尾
    if (part.startsWith('-') || part.endsWith('-')) {
      return {
        success: false,
        message: t('validation.domainLabelHyphen', { part })
      };
    }
    
    // 验证字符：只能包含字母、数字和连字符
    if (!/^[a-z0-9-]+$/.test(part)) {
      return {
        success: false,
        message: t('validation.domainLabelChars', { part })
      };
    }
  }

  // 验证顶级域名（最后一个部分）
  const tld = parts[parts.length - 1];
  if (!/^[a-z]+$/.test(tld)) {
    return {
      success: false,
      message: t('validation.tldLettersOnly', { tld })
    };
  }

  if (tld.length < 2) {
    return {
      success: false,
      message: t('validation.tldTooShort', { tld })
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
      message: t('validation.txtEmpty')
    };
  }

  // TXT记录内容长度限制（单个字符串最多255字符，总长度最多65535字符）
  if (content.length > 65535) {
    return {
      success: false,
      message: t('validation.txtTooLong')
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
      message: t('validation.contentEmpty')
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
        message: t('validation.unsupportedRecordType', { type: recordType })
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