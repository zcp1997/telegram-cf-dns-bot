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
        return {
          records: response.data.result,
          zoneId: zoneId
        };
      }
      return {
        record: null,
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
  

module.exports = {
  getDnsRecord,
  createOrUpdateDns,
  deleteDnsRecord
};
