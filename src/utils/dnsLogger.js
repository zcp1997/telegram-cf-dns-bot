const fs = require('fs');
const path = require('path');
const moment = require('moment');

// 日志目录
const LOG_DIR = path.join(process.cwd(), 'logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 记录DNS操作日志
 * @param {string} operation - 操作类型 (create, update, delete)
 * @param {object} data - 操作数据
 */
function logDnsOperation(operation, data) {
  try {
    const today = moment().format('YYYY-MM-DD');
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logFilePath = path.join(LOG_DIR, `dns-changes-${today}.json`);
    
    // 准备日志条目
    const logEntry = {
      timestamp,
      operation,
      ...data
    };
    
    // 读取现有日志文件，如果存在
    let logs = [];
    if (fs.existsSync(logFilePath)) {
      const fileContent = fs.readFileSync(logFilePath, 'utf8');
      logs = JSON.parse(fileContent);
    }
    
    // 添加新日志条目
    logs.push(logEntry);
    
    // 写入日志文件
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2), 'utf8');
    
    console.log(`DNS操作日志已记录: ${operation} - ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('记录DNS操作日志失败:', error);
  }
}

/**
 * 获取特定日期的DNS操作日志，按时间戳倒序排列
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Array} - 日志条目数组，按时间倒序排列
 */
function getDnsLogs(date) {
  try {
    const logFilePath = path.join(LOG_DIR, `dns-changes-${date}.json`);
    
    if (fs.existsSync(logFilePath)) {
      const fileContent = fs.readFileSync(logFilePath, 'utf8');
      const logs = JSON.parse(fileContent);
      
      // 按照时间戳倒序排列日志
      logs.sort((a, b) => {
        // 将字符串时间戳转换为日期对象进行比较
        const timeA = moment(a.timestamp, 'YYYY-MM-DD HH:mm:ss');
        const timeB = moment(b.timestamp, 'YYYY-MM-DD HH:mm:ss');
        
        // 返回比较结果，用valueOf()获取毫秒数进行比较，倒序排列
        return timeB.valueOf() - timeA.valueOf();
      });
      
      return logs;
    }
    
    return [];
  } catch (error) {
    console.error(`获取${date}的DNS操作日志失败:`, error);
    return [];
  }
}

/**
 * 获取所有可用的日志日期
 * @returns {Array} - 日期数组 (YYYY-MM-DD)，按日期倒序排列
 */
function getAvailableLogDates() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    
    // 过滤并提取日期
    const dates = files
      .filter(file => file.startsWith('dns-changes-') && file.endsWith('.json'))
      .map(file => file.replace('dns-changes-', '').replace('.json', ''))
      .sort((a, b) => moment(b, 'YYYY-MM-DD').valueOf() - moment(a, 'YYYY-MM-DD').valueOf());
    
    return dates;
  } catch (error) {
    console.error('获取可用日志日期失败:', error);
    return [];
  }
}

module.exports = {
  logDnsOperation,
  getDnsLogs,
  getAvailableLogDates
}; 