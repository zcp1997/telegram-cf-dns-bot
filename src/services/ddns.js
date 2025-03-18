const { createOrUpdateDns } = require('./cloudflare');
const { getCurrentIPv4, getCurrentIPv6 } = require('../utils/ip');
const { ddnsSessions } = require('../utils/session');
const { saveDDNSConfig } = require('./ddns-persistence');
const { ENABLE_IPV6_DDNS } = require('../config');

// 启动DDNS服务
function startDDNS(chatId, domain, interval = 60, telegram) {
  // 如果已存在相同域名的DDNS任务，先停止
  stopDDNS(domain);

  // 初始化DDNS会话
  const ddnsSession = {
    chatId,
    domain,
    interval,
    lastIPv4: null,
    lastIPv6: null,
    lastUpdate: null,
    timer: null,
    updateCount: 0,
    errorCount: 0,
    telegram: telegram, // 保存telegram对象而不是bot
    enableIPv6: ENABLE_IPV6_DDNS
  };

  // 立即执行一次更新
  updateDDNS(ddnsSession);

  // 设置定时器
  ddnsSession.timer = setInterval(() => {
    updateDDNS(ddnsSession);
  }, interval * 1000);

  // 保存会话
  ddnsSessions.set(domain, ddnsSession);
  
  // 保存配置到文件
  saveDDNSConfig().catch(err => console.error('保存DDNS配置失败:', err));

  return ddnsSession;
}

// 停止DDNS服务
function stopDDNS(domain) {
  const session = ddnsSessions.get(domain);
  if (session) {
    clearInterval(session.timer);
    ddnsSessions.delete(domain);
    
    // 保存配置到文件
    saveDDNSConfig().catch(err => console.error('保存DDNS配置失败:', err));
    
    return true;
  }
  return false;
}

// 获取所有DDNS任务
function getAllDDNSTasks() {
  return Array.from(ddnsSessions.entries()).map(([domain, session]) => ({
    domain,
    interval: session.interval,
    lastUpdate: session.lastUpdate,
    lastIPv4: session.lastIPv4,
    lastIPv6: session.lastIPv6,
    updateCount: session.updateCount,
    errorCount: session.errorCount,
    enableIPv6: session.enableIPv6
  }));
}

// 更新DDNS记录
async function updateDDNS(session) {
  try {
    // 获取当前IP
    const currentIPv4 = await getCurrentIPv4();
    let currentIPv6 = null;
    
    // 只有启用IPv6时才尝试获取IPv6地址
    if (session.enableIPv6) {
      try {
        currentIPv6 = await getCurrentIPv6();
        console.info(`已启用IPv6 DDNS，获取到IPv6地址: ${currentIPv6 || '无法获取'}`);
      } catch (error) {
        console.error('获取IPv6地址失败:', error.message);
      }
    }

    const now = new Date();
    let updated = false;

    // 检查IPv4是否变化
    if (session.lastIPv4 !== currentIPv4) {
      try {
        const result = await createOrUpdateDns(session.domain, currentIPv4, 'A', false);
        if (result.success) {
          session.lastIPv4 = currentIPv4;
          updated = true;
          session.updateCount++;

          // 通知用户
          if (session.telegram) {
            try {
              session.telegram.sendMessage(
                session.chatId,
                `✅ DDNS更新成功: ${session.domain}\n` +
                `IPv4: ${currentIPv4}\n` +
                `时间: ${now.toLocaleString()}`
              );
            } catch (notifyError) {
              console.error('发送通知失败:', notifyError);
            }
          }
        }
      } catch (error) {
        session.errorCount++;
        console.error(`DDNS更新失败 (${session.domain})`, error);

        // 通知用户
        if (session.telegram) {
          try {
            session.telegram.sendMessage(
              session.chatId,
              `❌ DDNS更新失败: ${session.domain}\n` +
              `错误: ${error.message}\n` +
              `时间: ${now.toLocaleString()}`
            );
          } catch (notifyError) {
            console.error('发送通知失败:', notifyError);
          }
        }
      }
    }

    // 如果启用了IPv6且有IPv6地址且发生变化，也更新
    if (session.enableIPv6 && currentIPv6 && session.lastIPv6 !== currentIPv6) {
      try {
        const result = await createOrUpdateDns(session.domain, currentIPv6, 'AAAA', false);
        if (result.success) {
          session.lastIPv6 = currentIPv6;
          updated = true;
          session.updateCount++;

          // 通知用户
          if (session.telegram) {
            try {
              session.telegram.sendMessage(
                session.chatId,
                `✅ DDNS更新成功: ${session.domain}\n` +
                `IPv6: ${currentIPv6}\n` +
                `时间: ${now.toLocaleString()}`
              );
            } catch (notifyError) {
              console.error('发送通知失败:', notifyError);
            }
          }
        }
      } catch (error) {
        session.errorCount++;
        console.error(`DDNS IPv6更新失败 (${session.domain})`, error);
      }
    }

    // 更新最后更新时间
    if (updated) {
      session.lastUpdate = now;
      
      // 保存配置到文件
      saveDDNSConfig().catch(err => console.error('保存DDNS配置失败:', err));
    }
  } catch (error) {
    session.errorCount++;
    console.error(`DDNS更新过程中发生错误 (${session.domain})`, error);

    // 通知用户
    if (session.telegram) {
      try {
        session.telegram.sendMessage(
          session.chatId,
          `❌ DDNS更新失败: ${session.domain}\n` +
          `错误: ${error.message}\n` +
          `时间: ${new Date().toLocaleString()}`
        );
      } catch (notifyError) {
        console.error('发送通知失败:', notifyError);
      }
    }
  }
}

module.exports = {
  startDDNS,
  stopDDNS,
  getAllDDNSTasks
};
