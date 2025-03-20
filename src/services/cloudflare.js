const axios = require('axios');
const { CF_API_TOKEN, CF_API_BASE } = require('../config');
const { getZoneIdForDomain } = require('../utils/domain');
const { logDnsOperation } = require('../utils/dnsLogger');

// Cloudflare API 函数
async function getDnsRecord(domainName, getAllRecords = false) {
  const zoneId = await getZoneIdForDomain(domainName);
  if (!zoneId) {
    throw new Error(`找不到域名 ${domainName} 对应的Zone ID，请检查配置`);
  }

  try {
    // 创建请求参数对象
    const params = {};
    // 只有在不查询所有记录时才添加name过滤条件
    if (!getAllRecords) {
      params.name = domainName;
    }

    const response = await axios.get(`${CF_API_BASE}/${zoneId}/dns_records`, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: params
    });

    if (response.data.success && response.data.result.length > 0) {
      // 确保每条记录都包含 zone_id 字段
      const records = response.data.result
        .filter(record => record.type === 'A' || record.type === 'AAAA')
        .map(record => ({
          ...record,
          zone_id: zoneId
        }));

      return {
        records: records,
        zoneId: zoneId
      };
    }
    return {
      records: [],
      zoneId: zoneId
    };
  } catch (error) {
    console.error(`获取域名 ${domainName} 的DNS记录失败:`, error.message);
    throw error;
  }
}

async function createOrUpdateDns(domainName, ipAddress, recordType = 'A', proxied = false) {
  try {
    // 检查记录是否已存在，并获取Zone ID
    const { records, zoneId } = await getDnsRecord(domainName);
    if (!zoneId) {
      return {
        success: false,
        message: `无法找到域名 ${domainName} 对应的Zone ID`
      };
    }

    // 根据记录类型过滤现有记录
    const existingRecord = records?.find(record => record.type === recordType);

    // 准备请求数据
    const dnsData = {
      type: recordType,
      name: domainName,
      content: ipAddress,
      ttl: 1, // 自动TTL
      proxied: proxied // 设置为不通过Cloudflare代理
    };

    let response;
    let action;

    if (existingRecord) {
      // 更新现有记录
      const recordId = existingRecord.id;
      const updateUrl = `${CF_API_BASE}/${zoneId}/dns_records/${recordId}`;
      response = await axios.put(updateUrl, dnsData, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      action = '更新';

      // 记录DNS更新操作
      logDnsOperation('update', {
        domain: domainName,
        ipAddress,
        recordType,
        proxied,
        oldIpAddress: existingRecord.content,
        oldProxied: existingRecord.proxied,
        zoneId
      });
    } else {
      // 创建新记录
      const createUrl = `${CF_API_BASE}/${zoneId}/dns_records`;
      response = await axios.post(createUrl, dnsData, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      action = '创建';

      // 记录DNS创建操作
      logDnsOperation('create', {
        domain: domainName,
        ipAddress,
        recordType,
        proxied,
        zoneId
      });
    }

    if (response.status === 200 || response.status === 201) {
      if (response.data.success) {
        return {
          success: true,
          message: `成功${action}DNS记录 ${domainName} -> ${ipAddress}`
        };
      }
    }

    return {
      success: false,
      message: `无法${action}DNS记录，API响应: ${JSON.stringify(response.data)}`
    };
  } catch (error) {
    console.error('操作DNS记录失败:', error.message);
    if (error.response) {
      console.error('错误详情:', error.response.status, error.response.data);
    }
    return {
      success: false,
      message: `操作失败: ${error.message}`
    };
  }
}

// 删除DNS记录函数
async function deleteDnsRecord(domainName) {
  try {
    // 获取域名对应的记录
    const { records, zoneId } = await getDnsRecord(domainName);

    if (!records || records.length === 0) {
      return {
        success: false,
        message: `未找到域名 ${domainName} 的DNS记录`
      };
    }

    // 删除所有匹配的记录
    const deleteResults = await Promise.all(records.map(async record => {
      const recordId = record.id;
      const deleteUrl = `${CF_API_BASE}/${zoneId}/dns_records/${recordId}`;
      try {
        const response = await axios.delete(deleteUrl, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        // 记录删除操作
        if (response.data.success) {
          logDnsOperation('delete', {
            domain: domainName,
            recordType: record.type,
            ipAddress: record.content,
            proxied: record.proxied,
            zoneId,
            recordId
          });
        }

        return {
          success: response.data.success,
          type: record.type,
          content: record.content
        };
      } catch (error) {
        return {
          success: false,
          type: record.type,
          content: record.content,
          error: error.message
        };
      }
    }));

    // 处理删除结果
    const successCount = deleteResults.filter(r => r.success).length;
    const failCount = deleteResults.length - successCount;

    if (failCount === 0) {
      return {
        success: true,
        message: `成功删除 ${successCount} 条DNS记录: ${domainName}`
      };
    } else {
      const failedRecords = deleteResults
        .filter(r => !r.success)
        .map(r => `${r.type}记录(${r.content})`);
      return {
        success: false,
        message: `部分记录删除失败。成功: ${successCount}, 失败: ${failCount}\n失败记录: ${failedRecords.join(', ')}`
      };
    }
  } catch (error) {
    console.error('删除DNS记录失败:', error.message);
    return {
      success: false,
      message: `删除失败: ${error.message}`
    };
  }
}

// 删除单条DNS记录
async function deleteSingleDnsRecord(zoneId, recordId, recordInfo) {
  try {
    const response = await axios.delete(`${CF_API_BASE}/${zoneId}/dns_records/${recordId}`, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      // 记录删除操作
      if (recordInfo) {
        logDnsOperation('delete', {
          domain: recordInfo.name,
          recordType: recordInfo.type,
          ipAddress: recordInfo.content,
          proxied: recordInfo.proxied,
          zoneId,
          recordId
        });
      }

      return {
        success: true,
        message: 'DNS记录已成功删除'
      };
    } else {
      throw new Error(response.data.errors[0].message || '删除DNS记录失败');
    }
  } catch (error) {
    console.error('删除DNS记录失败:', error.message);
    throw error;
  }
}

// 更新DNS记录
async function updateDnsRecord(zoneId, recordId, name, content, type, proxied, oldRecord) {
  try {
    console.log(`正在更新DNS记录: zoneId=${zoneId}, recordId=${recordId}, name=${name}, content=${content}, type=${type}, proxied=${proxied}`);

    // 确保 zoneId 和 recordId 都存在
    if (!zoneId || !recordId) {
      throw new Error('缺少 Zone ID 或记录 ID');
    }

    const url = `${CF_API_BASE}/${zoneId}/dns_records/${recordId}`;
    console.log(`API 请求 URL: ${url}`);

    const response = await axios.put(url, {
      type: type,
      name: name,
      content: content,
      proxied: proxied,
      ttl: 1 // 自动 TTL
    }, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      // 记录更新操作
      logDnsOperation('update', {
        domain: name,
        ipAddress: content,
        recordType: type,
        proxied,
        oldIpAddress: oldRecord?.content,
        oldProxied: oldRecord?.proxied,
        zoneId,
        recordId
      });

      return {
        success: true,
        message: 'DNS记录已成功更新',
        record: response.data.result
      };
    } else {
      throw new Error(response.data.errors[0].message || '更新DNS记录失败');
    }
  } catch (error) {
    console.error('更新DNS记录失败:', error.response ? error.response.status : error.message);
    if (error.response && error.response.data) {
      console.error('错误详情:', JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// 获取所有可用区域及其ID的映射
async function getZonesMapping() {
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
        mapping[zone.name] = zone.id;
      });
      return mapping;
    }
    return {};
  } catch (error) {
    console.error('获取域名区域映射失败:', error.message);
    throw error;
  }
}

module.exports = {
  getDnsRecord,
  createOrUpdateDns,
  deleteDnsRecord,
  deleteSingleDnsRecord,
  updateDnsRecord,
  getZonesMapping
};
