const { Telegraf } = require('telegraf');
const { TELEGRAM_TOKEN, ALLOWED_CHAT_IDS } = require('./config');
const { setupCommands, commands } = require('./handlers/commands');
const { setupCallbacks } = require('./handlers/callbacks');
const { setupMessageHandlers } = require('./handlers/messages');
const { checkAccessWithCache } = require('./middleware/auth');

const bot = new Telegraf(TELEGRAM_TOKEN);

// 添加中间件
bot.use(checkAccessWithCache);

// 设置处理器
setupCommands(bot);
setupCallbacks(bot);
setupMessageHandlers(bot);

// 启动 Bot
async function startBot() {
    try {
      console.log('=== 开始启动 Bot ===');
      console.log('1. 检查 Telegram Token:', TELEGRAM_TOKEN ? '已设置' : '未设置');
      
      // 启动 Bot，使用 Promise 包装启动过程
      console.log('2. 正在启动 Bot...');
      await new Promise((resolve, reject) => {
        try {
          bot.launch();
          
          // 监听启动成功事件
          bot.telegram.getMe().then(() => {
            console.log('3. Bot 启动成功');
            resolve();
          }).catch(reject);
          
          // 设置超时
          setTimeout(() => {
            reject(new Error('Bot 启动超时'));
          }, 10000); // 10秒超时
          
        } catch (error) {
          reject(error);
        }
      });
      
      // 等待一下确保 bot 完全启动
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('4. 开始配置命令菜单');
      // 清除现有命令
      await bot.telegram.deleteMyCommands();
      console.log('5. 已清除现有命令');
      
      // 设置普通用户命令菜单
      await bot.telegram.setMyCommands(commands);
      console.log('6. 已设置用户命令菜单');
  
      console.log('=== Bot 启动和配置完成 ===');
      console.log('• 白名单用户:', ALLOWED_CHAT_IDS.join(', '));
      console.log('• 管理员ID:', ALLOWED_CHAT_IDS[0]);
      
      return true;
    } catch (error) {
      console.error('Bot 启动过程中发生错误:', error);
      throw error;
    }
}
  
// 错误处理
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 启动 Bot
startBot().catch(console.error);
