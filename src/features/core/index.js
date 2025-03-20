const setdns = require('../setdns');
const getdns = require('../getdns');
const deldns = require('../deldns');
const ddns = require('../ddns');
const admin = require('../admin');
const texthandler = require('./texthandler');
const dnschangelogs = require('../dnschangelogs');

// 所有命令列表
const commands = [
  admin.commands.start_command,
  admin.commands.help_command,
  setdns.command,
  getdns.command,
  getdns.commandAll,
  deldns.command,
  ...ddns.commands,
  dnschangelogs.command,
  admin.commands.domains_command,
  admin.commands.listusers_command,
  admin.commands.zonemap_command,
];

// 设置所有命令和回调函数
function setupCommandsAndCallbacks(bot) {
  setdns.setup(bot);
  getdns.setup(bot);
  deldns.setup(bot);
  ddns.setup(bot);
  admin.setup(bot);
  dnschangelogs.setup(bot);
}

// 设置所有onText事件处理函数
function setupTextHandlers(bot) {
  texthandler.setupTextHandler(bot);
}

module.exports = {
  setupCommandsAndCallbacks,
  setupTextHandlers,
  commands
};