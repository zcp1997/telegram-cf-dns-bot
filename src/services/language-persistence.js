const fs = require('fs');
const path = require('path');

// 与 DDNS 配置共用 ./config 目录（docker-compose 已挂载）
const CONFIG_DIR = './config';
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
  } catch (error) {
    console.error('读取设置文件失败:', error.message);
    return {};
  }
}

// 读取通过 /language 保存的语言，未保存时返回 null
function loadSavedLanguage() {
  return readSettings().language || null;
}

// 保存语言选择，重启后仍然生效
function saveLanguage(language) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const settings = { ...readSettings(), language };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('保存语言设置失败:', error.message);
    return false;
  }
}

module.exports = {
  loadSavedLanguage,
  saveLanguage,
};
