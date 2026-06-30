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

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

function t(key, params = {}, language = defaultLanguage) {
  const normalizedLanguage = normalizeLanguage(language);
  const dictionary = dictionaries[normalizedLanguage] || dictionaries['zh-CN'];
  const template = dictionary[key] || dictionaries['zh-CN'][key] || key;
  return interpolate(template, params);
}

module.exports = {
  t,
  normalizeLanguage,
  defaultLanguage,
};
