const commands = [
  { command: 'start', description: '开始使用机器人' },
  { command: 'help', description: '显示帮助信息' },
  { command: 'domains', description: '查看所有已配置的域名' },
  { command: 'listusers', description: '查看白名单用户列表 (仅管理员)' },
  { command: 'zonemap', description: '查看域名和Zone ID映射 (仅管理员)' }
];

// 为数组添加命令引用
commands.forEach(cmd => {
  commands[cmd.command + '_command'] = cmd;
});

const helpMessage = '🤖 欢迎使用多域名 Cloudflare DNS 管理机器人！\n\n' +
  '请选择以下操作类别：';

const helpButtons = [
  [{ text: '📝 DNS记录管理', callback_data: 'help_dns_management' }],
  [{ text: '🔄 DDNS动态域名', callback_data: 'help_ddns_management' }],
  [{ text: '📊 系统信息', callback_data: 'help_system_info' }],
  [{ text: '❓ 帮助信息', callback_data: 'help_general' }]
];

module.exports = { commands, helpMessage, helpButtons };