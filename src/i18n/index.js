const zhCN = require('./locales/zh-CN');
const enUS = require('./locales/en-US');

const dictionaries = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

function normalizeLanguage(language) {
  if (!language) {
    return 'zh-CN';
  }

  const value = String(language).replace('_', '-').toLowerCase();
  if (value.startsWith('en')) {
    return 'en-US';
  }

  return 'zh-CN';
}

const defaultLanguage = normalizeLanguage(
  process.env.BOT_LANGUAGE ||
  process.env.LANGUAGE ||
  process.env.LANG
);
let currentLanguage = defaultLanguage;
const languageChangeListeners = [];

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

function getLanguage() {
  return currentLanguage;
}

function setLanguage(language) {
  const previousLanguage = currentLanguage;
  currentLanguage = normalizeLanguage(language);

  if (currentLanguage !== previousLanguage) {
    for (const listener of languageChangeListeners) {
      try {
        listener(currentLanguage, previousLanguage);
      } catch (error) {
        console.error('Language change listener failed:', error);
      }
    }
  }

  return currentLanguage;
}

function onLanguageChange(listener) {
  languageChangeListeners.push(listener);
}

function formatDateTime(date, language = currentLanguage) {
  return new Date(date).toLocaleString(normalizeLanguage(language), { hour12: false });
}

function t(key, params = {}, language = currentLanguage) {
  const normalizedLanguage = normalizeLanguage(language);
  const dictionary = dictionaries[normalizedLanguage] || dictionaries['zh-CN'];
  const template = dictionary[key] || dictionaries['zh-CN'][key] || key;
  return interpolate(template, params);
}

module.exports = {
  t,
  normalizeLanguage,
  defaultLanguage,
  getLanguage,
  setLanguage,
  onLanguageChange,
  formatDateTime,
};
