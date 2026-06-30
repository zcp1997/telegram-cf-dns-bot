const assert = require('node:assert/strict');
const path = require('node:path');

class FakeBot {
  constructor() {
    this.commands = new Map();
    this.actions = [];
    this.listeners = new Map();
  }

  command(name, handler) {
    this.commands.set(name, handler);
  }

  action(trigger, handler) {
    this.actions.push({ trigger, handler });
  }

  on(eventName, handler) {
    this.listeners.set(eventName, handler);
  }

  async runCommand(name, ctx = createCtx()) {
    const handler = this.commands.get(name);
    assert.ok(handler, `Command not registered: ${name}`);
    await handler(ctx);
    return ctx;
  }

  async runAction(callbackData, ctx = createCtx()) {
    const action = this.actions.find(({ trigger }) => {
      if (typeof trigger === 'string') {
        return trigger === callbackData;
      }
      return trigger.test(callbackData);
    });

    assert.ok(action, `Action not registered: ${callbackData}`);

    ctx.callbackQuery = ctx.callbackQuery || { message: { message_id: 1 } };
    ctx.callbackQuery.data = callbackData;

    if (action.trigger instanceof RegExp) {
      action.trigger.lastIndex = 0;
      ctx.match = action.trigger.exec(callbackData);
    }

    await action.handler(ctx);
    return ctx;
  }

  async runText(text, ctx = createCtx({ text })) {
    const handler = this.listeners.get('text');
    assert.ok(handler, 'Text handler not registered');
    ctx.message = ctx.message || { message_id: 1 };
    ctx.message.text = text;
    await handler(ctx);
    return ctx;
  }
}

function createCtx(overrides = {}) {
  const calls = {
    reply: [],
    editMessageText: [],
    answerCbQuery: [],
    telegramEditMessageText: [],
    telegramDeleteMessages: [],
  };

  const chat = overrides.chat || { id: 1001 };
  const message = overrides.message || {
    message_id: overrides.messageId || 1,
    text: overrides.text || '',
  };

  const ctx = {
    chat,
    message,
    callbackQuery: overrides.callbackQuery || {
      message: { message_id: overrides.callbackMessageId || 10 },
    },
    match: overrides.match,
    calls,
    reply: async (text, extra = {}) => {
      const sentMessage = {
        message_id: 100 + calls.reply.length,
        text,
        extra,
      };
      calls.reply.push(sentMessage);
      return sentMessage;
    },
    editMessageText: async (text, extra = {}) => {
      calls.editMessageText.push({ text, extra });
      return { text, extra };
    },
    answerCbQuery: async (text) => {
      calls.answerCbQuery.push(text);
      return true;
    },
    telegram: {
      editMessageText: async (chatId, messageId, inlineMessageId, text, extra = {}) => {
        calls.telegramEditMessageText.push({ chatId, messageId, inlineMessageId, text, extra });
        return { text, extra };
      },
      deleteMessages: async (chatId, messageIds) => {
        calls.telegramDeleteMessages.push({ chatId, messageIds });
        return true;
      },
    },
  };

  return ctx;
}

function mockModule(modulePath, exportsValue) {
  const resolvedPath = resolveProjectModule(modulePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsValue,
  };
}

function clearModules(modulePaths) {
  for (const modulePath of modulePaths) {
    delete require.cache[resolveProjectModule(modulePath)];
  }
}

function resolveProjectModule(modulePath) {
  if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
    return require.resolve(path.resolve(process.cwd(), modulePath));
  }

  return require.resolve(modulePath);
}

module.exports = {
  FakeBot,
  createCtx,
  mockModule,
  clearModules,
};
