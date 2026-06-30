const { t } = require('../../i18n');

const commands = [
  { command: 'start', description: t('admin.command.start.description') },
  { command: 'help', description: t('admin.command.help.description') },
  { command: 'domains', description: t('admin.command.domains.description') },
  { command: 'language', description: t('admin.command.language.description') },
  { command: 'listusers', description: t('admin.command.listusers.description') },
  { command: 'zonemap', description: t('admin.command.zonemap.description') }
];

// 为数组添加命令引用
commands.forEach(cmd => {
  commands[cmd.command + '_command'] = cmd;
});

function getHelpMessage() {
  return t('admin.help.welcome');
}

function getHelpButtons() {
  return [
    [{ text: t('admin.help.dnsManagement'), callback_data: 'help_dns_management' }],
    [{ text: t('admin.help.ddnsManagement'), callback_data: 'help_ddns_management' }],
    [{ text: t('admin.help.systemInfo'), callback_data: 'help_system_info' }],
    [{ text: t('admin.help.language'), callback_data: 'help_language' }],
    [{ text: t('admin.help.general'), callback_data: 'help_general' }]
  ];
}

function getLanguageButtons() {
  return [
    [
      { text: t('admin.language.zhCN'), callback_data: 'set_language_zh-CN' },
      { text: t('admin.language.enUS'), callback_data: 'set_language_en-US' }
    ],
    [{ text: t('common.back'), callback_data: 'help_back' }]
  ];
}

module.exports = {
  commands,
  getHelpMessage,
  getHelpButtons,
  getLanguageButtons,
};
