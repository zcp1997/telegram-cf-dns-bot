const axios = require('axios');
const { CF_API_TOKEN, CF_API_BASE } = require('../config');
const { getZoneIdForDomain } = require('../utils/domain');

// Cloudflare API 函数
async function getDnsRecord(domainName, getAllRecords = false) {
    const zoneId = getZoneIdForDomain(domainName);
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
        const records = response.data.result.map(record => ({
          ...record,
          zone_id: zoneId // 添加 zone_id 字段
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
  async function deleteSingleDnsRecord(zoneId, recordId) {
    try {
      const response = await axios.delete(`${CF_API_BASE}/${zoneId}/dns_records/${recordId}`, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
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
  async function updateDnsRecord(zoneId, recordId, name, content, type, proxied) {
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

module.exports = {
  getDnsRecord,
  createOrUpdateDns,
  deleteDnsRecord,
  deleteSingleDnsRecord,
  updateDnsRecord
};
