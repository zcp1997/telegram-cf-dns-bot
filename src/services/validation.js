const axios = require('axios');
const { CF_API_TOKEN, CF_API_BASE, DOMAIN_ZONE_MAP } = require('../config');

const zoneTodomainMap = {};
for (const [domain, zoneId] of Object.entries(DOMAIN_ZONE_MAP)) {
  zoneTodomainMap[String(zoneId)] = domain;
}
/**
 * 验证 Cloudflare 配置
 * 检查 API Token 是否有效
 * 验证所有配置的 Zone 是否可访问
 */
async function validateCloudflareConfig() {
  try {
    // 检查必要的环境变量
    if (!CF_API_TOKEN) {
      throw new Error('未配置 CF_API_TOKEN');
    }

    if (!DOMAIN_ZONE_MAP || Object.keys(DOMAIN_ZONE_MAP).length === 0) {
      throw new Error('未配置 DOMAIN_ZONE_MAP 或配置为空');
    }

    // 获取所有配置的 zone ID（去重）
    const zoneIds = [...new Set(Object.values(DOMAIN_ZONE_MAP))];
    console.log(`开始验证 ${zoneIds.length} 个 Zone...`);
    
    // 验证所有 zone
    const results = await Promise.allSettled(
      zoneIds.map(async (zoneId) => {
        try {
          const response = await axios.get(`${CF_API_BASE}/${zoneId}`, {
            headers: {
              'Authorization': `Bearer ${CF_API_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!response.data.success) {
            throw new Error(`Zone ${zoneId} API 响应不成功`);
          }
          
          return {
            zoneId,
            success: true,
            name: response.data.result.name
          };
        } catch (error) {
          return {
            zoneId,
            success: false,
            error: error.message
          };
        }
      })
    );
    
    // 检查验证结果
    const failedZones = results
      .filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success))
      .map(result => {
        if (result.status === 'rejected') {
          return { zoneId: result.reason, error: '请求失败' };
        } else {
          return { zoneId: result.value.zoneId, error: result.value.error };
        }
      });
    
    if (failedZones.length > 0) {
      // 将 Zone ID 映射回域名
      const failedDetails = failedZones.map(item => {
        // 查找对应的域名
        let domainName = '未知域名';
        
        // 遍历所有域名映射，查找匹配的 Zone ID
        for (const [domain, id] of Object.entries(DOMAIN_ZONE_MAP)) {
          if (String(id) === String(item.zoneId)) {
            domainName = domain;
            break;
          }
        }
        
        return `域名: ${domainName} (Zone ID: ${item.zoneId})\n错误: ${item.error}`;
      });
      
      throw new Error(`以下域名验证失败:\n${failedDetails.join('\n\n')}`);
    }
    
    console.log(`cloudflare ${zoneIds.length} 个 Zone 验证成功`);
    return {
      success: true,
      message: `Cloudflare 配置验证成功，已验证 ${zoneIds.length} 个 Zone`
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
 * 检查域名是否在配置的 Zone 中
 */
async function validateDomainConfig(domain) {
  try {
    const zoneId = Object.entries(DOMAIN_ZONE_MAP)
      .find(([configDomain]) => domain.endsWith(configDomain))?.[1];

    if (!zoneId) {
      return {
        success: false,
        message: `域名 ${domain} 不在任何已配置的 Zone 中`
      };
    }

    // 验证 Zone 访问权限
    const response = await axios.get(`${CF_API_BASE}/${zoneId}`, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.success) {
      return {
        success: false,
        message: `无法访问域名 ${domain} 所在的 Zone (${zoneId})`
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
  // IPv4 验证
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    }) ? {
      success: true,
      type: 'A'
    } : {
      success: false,
      message: 'IPv4 地址格式无效'
    };
  }

  // IPv6 验证
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (ipv6Regex.test(ip)) {
    return {
      success: true,
      type: 'AAAA'
    };
  }

  return {
    success: false,
    message: 'IP 地址格式无效，请输入有效的 IPv4 或 IPv6 地址'
  };
}

module.exports = {
  validateCloudflareConfig,
  validateDomainConfig,
  validateIpAddress
}; 