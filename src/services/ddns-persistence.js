const fs = require('fs').promises;
const path = require('path');
const { ddnsSessions } = require('../utils/session');

// 配置文件路径 - 使用固定路径
const CONFIG_DIR = './config';
const DDNS_CONFIG_FILE = path.join(CONFIG_DIR, 'ddns.json');

// 保存DDNS配置到文件
async function saveDDNSConfig() {
  try {
    // 确保配置目录存在
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    
    // 提取需要保存的配置信息
    const configs = Array.from(ddnsSessions.entries()).map(([domain, session]) => ({
      chatId: session.chatId,
      domain: domain,
      interval: session.interval,
      lastIPv4: session.lastIPv4,
      lastIPv6: session.lastIPv6,
      lastUpdate: session.lastUpdate ? session.lastUpdate.toISOString() : null,
      updateCount: session.updateCount,
      errorCount: session.errorCount
    }));
    
    // 写入文件
    await fs.writeFile(DDNS_CONFIG_FILE, JSON.stringify(configs, null, 2));
    console.log(`已保存${configs.length}个DDNS配置到 ${DDNS_CONFIG_FILE}`);
    return true;
  } catch (error) {
    console.error('保存DDNS配置失败:', error);
    return false;
  }
}

// 从文件加载DDNS配置
async function loadDDNSConfig(telegram) {
  try {
    // 检查配置文件是否存在
    try {
      await fs.access(DDNS_CONFIG_FILE);
    } catch (error) {
      console.log('DDNS配置文件不存在，跳过加载');
      return [];
    }
    
    // 读取配置文件
    const data = await fs.readFile(DDNS_CONFIG_FILE, 'utf8');
    const configs = JSON.parse(data);
    
    console.log(`从 ${DDNS_CONFIG_FILE} 加载了${configs.length}个DDNS配置`);
    return configs;
  } catch (error) {
    console.error('加载DDNS配置失败:', error);
    return [];
  }
}

// 启动时恢复DDNS任务
async function restoreDDNSTasks(telegram) {
  const { startDDNS } = require('./ddns');
  const configs = await loadDDNSConfig();
  
  let restoredCount = 0;
  for (const config of configs) {
    try {
      // 恢复DDNS任务
      const session = startDDNS(config.chatId, config.domain, config.interval, telegram);
      
      // 恢复历史数据
      if (session) {
        session.lastIPv4 = config.lastIPv4;
        session.lastIPv6 = config.lastIPv6;
        session.lastUpdate = config.lastUpdate ? new Date(config.lastUpdate) : null;
        session.updateCount = config.updateCount || 0;
        session.errorCount = config.errorCount || 0;
        
        restoredCount++;
      }
    } catch (error) {
      console.error(`恢复DDNS任务失败 (${config.domain}):`, error);
    }
  }
  
  console.log(`成功恢复了${restoredCount}/${configs.length}个DDNS任务`);
  return restoredCount;
}

// 设置定期保存配置
let saveInterval = null;

function setupAutoSave(intervalMinutes = 5) {
  // 清除现有的定时器
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  
  // 设置新的定时器
  saveInterval = setInterval(() => {
    if (ddnsSessions.size > 0) {
      saveDDNSConfig()
        .then(success => {
          if (success) {
            console.log(`自动保存了${ddnsSessions.size}个DDNS配置`);
          }
        })
        .catch(err => console.error('自动保存DDNS配置失败:', err));
    }
  }, intervalMinutes * 60 * 1000);
  
  console.log(`已设置每${intervalMinutes}分钟自动保存DDNS配置`);
}

module.exports = {
  saveDDNSConfig,
  loadDDNSConfig,
  restoreDDNSTasks,
  setupAutoSave
};
