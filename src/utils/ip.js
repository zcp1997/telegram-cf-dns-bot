const axios = require('axios');
const { IN_CHINA } = require('../config');
/**
 * 获取当前IPv4地址
 * 使用多个IP获取服务，包括国内外服务，提高可靠性
 * @returns {Promise<string>} IPv4地址
 */
async function getCurrentIPv4() {
  // IP获取服务列表
  const chinaIPServices = [
    { url: 'https://ip.3322.net', timeout: 5000, name: '3322.net(国内)' },
    { url: 'https://myip.ipip.net', timeout: 5000, name: 'ipip.net(国内)', parser: (data) => {
      // ipip.net返回格式: "当前 IP：xxx.xxx.xxx.xxx 来自于：xxx"
      const match = data.match(/\d+\.\d+\.\d+\.\d+/);
      return match ? match[0] : null;
    }},
    { url: 'https://ddns.oray.com/checkip', timeout: 5000, name: 'Oray(国内)' },
  ];
  
  const globalIPServices = [
    { url: 'https://api.ipify.org', timeout: 5000, name: 'ipify' },
    { url: 'https://ipv4.icanhazip.com', timeout: 5000, name: 'icanhazip' },
    { url: 'https://ifconfig.me/ip', timeout: 5000, name: 'ifconfig.me' },
  ];
  
  // 根据部署环境决定服务优先级
  const ipServices = IN_CHINA 
    ? [...chinaIPServices, ...globalIPServices]  // 中国大陆环境优先使用国内服务
    : [...globalIPServices, ...chinaIPServices]; // 海外环境优先使用全球服务

  // 记录错误信息
  const errors = [];

  console.info(`当前环境: ${IN_CHINA ? '中国大陆' : '海外'}, 将优先使用${IN_CHINA ? '国内' : '全球'}IP服务`);

  // 依次尝试每个服务
  for (const service of ipServices) {
    try {
      const response = await axios.get(service.url, { 
        timeout: service.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // 解析IP地址
      let ip = service.parser ? service.parser(response.data) : response.data.trim();
      
      // 验证IP格式
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        console.info(`DDNS成功获取IPv4地址(来源:${service.name}):`, ip);
        return ip;
      } else {
        throw new Error(`返回的IP格式不正确: ${ip}`);
      }
    } catch (error) {
      const errorMsg = `${service.name}获取IPv4失败: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      // 继续尝试下一个服务
    }
  }

  // 所有服务都失败时
  const errorMessage = `无法获取当前IPv4地址，所有服务均失败:\n${errors.join('\n')}`;
  console.error(errorMessage);
  throw new Error('无法获取当前IPv4地址，所有服务均失败');
}

/**
 * 获取当前IPv6地址
 * 使用多个IP获取服务，包括国内外服务，提高可靠性
 * @returns {Promise<string|null>} IPv6地址，不支持时返回null
 */
async function getCurrentIPv6() {
  // IPv6获取服务列表
  const chinaIPv6Services = [
    { url: 'https://ipv6.ipip.net/', timeout: 5000, name: 'ipip.net(国内)', parser: (data) => {
      // 解析页面中的IPv6地址
      const match = data.match(/([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/);
      return match ? match[0] : null;
    }},
    { url: 'https://ip6.ddnspod.com', timeout: 5000, name: 'DDNS Pod(国内)' },
    { url: 'https://speed.neu6.edu.cn/getIP.php', timeout: 5000, name: 'NEU6(国内)' },
  ];
  
  const globalIPv6Services = [
    { url: 'https://api6.ipify.org', timeout: 5000, name: 'ipify' },
    { url: 'https://ipv6.icanhazip.com', timeout: 5000, name: 'icanhazip' },
    { url: 'https://ident.me', timeout: 5000, name: 'ident.me' },
    { url: 'https://ifconfig.co/ip', timeout: 5000, name: 'ifconfig.co' },
  ];
  
  // 根据部署环境决定服务优先级
  const ipServices = IN_CHINA 
    ? [...chinaIPv6Services, ...globalIPv6Services]  // 中国大陆环境优先使用国内服务
    : [...globalIPv6Services, ...chinaIPv6Services]; // 海外环境优先使用全球服务

  // 记录错误信息
  const errors = [];

  console.info(`IPv6检测 - 当前环境: ${IN_CHINA ? '中国大陆' : '海外'}, 将优先使用${IN_CHINA ? '国内' : '全球'}IP服务`);

  // 依次尝试每个服务
  for (const service of ipServices) {
    try {
      const response = await axios.get(service.url, { 
        timeout: service.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      // 解析IP地址
      let ip = service.parser ? service.parser(response.data) : response.data.trim();
      
      // 验证IPv6格式 (简单验证包含冒号的格式)
      if (ip && ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip)) {
        console.info(`DDNS成功获取IPv6地址(来源:${service.name}):`, ip);
        return ip;
      } else {
        throw new Error(`返回的IPv6格式不正确: ${ip}`);
      }
    } catch (error) {
      const errorMsg = `${service.name}获取IPv6失败: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      // 继续尝试下一个服务
    }
  }

  // 所有服务都失败时
  console.error(`IPv6可能不可用，所有服务均失败:\n${errors.join('\n')}`);
  return null; // IPv6可能不可用，返回null
}

module.exports = {
  getCurrentIPv4,
  getCurrentIPv6
};
