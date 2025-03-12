const { SESSION_TIMEOUT } = require('../config');

const userSessions = new Map();

const SessionState = {
  IDLE: 'IDLE',
  WAITING_DOMAIN: 'WAITING_DOMAIN',
  WAITING_IP: 'WAITING_IP',
  WAITING_PROXY: 'WAITING_PROXY',
  WAITING_DOMAIN_TO_DELETE: 'WAITING_DOMAIN_TO_DELETE',
  WAITING_CONFIRM_DELETE: 'WAITING_CONFIRM_DELETE',
  WAITING_DOMAIN_TO_QUERY: 'WAITING_DOMAIN_TO_QUERY',
  WAITING_DOMAIN_TO_QUERY_ALL: 'WAITING_DOMAIN_TO_QUERY_ALL',
  VIEWING_DNS_RECORDS: 'VIEWING_DNS_RECORDS'
};

function cleanupSessions() {
  const now = Date.now();
  for (const [chatId, session] of userSessions.entries()) {
    if (now - session.lastUpdate > SESSION_TIMEOUT) {
      userSessions.delete(chatId);
    }
  }
}

// 启动定期清理
setInterval(cleanupSessions, 5 * 60 * 1000);

module.exports = {
  userSessions,
  SessionState,
  cleanupSessions
};
