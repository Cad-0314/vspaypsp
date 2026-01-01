const TelegramBot = require('node-telegram-bot-api');

let bot = null;

const init = (token) => {
    if (!token) {
        console.warn('[Telegram] No BOT_TOKEN provided. Bot integration disabled.');
        return;
    }

    try {
        // polling: true allows the bot to listen for updates without a webhook
        bot = new TelegramBot(token, { polling: true });

        console.log('[Telegram] Bot initialized successfully.');

        // /start command
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `Hello! VSPAY Support Bot is active.\n\nUse /id to get this group's ID for binding.`);
        });

        // /help command
        bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `Available Commands:\n/id - Get Group/Chat ID\n/help - Show this message`);
        });

        // /id command
        bot.onText(/\/id/, (msg) => {
            const chatId = msg.chat.id;
            const type = msg.chat.type;
            const title = msg.chat.title || msg.from.username || 'Private Chat';

            const response = `
🆔 **Chat ID Information**

**ID:** \`${chatId}\`
**Type:** ${type}
**Name:** ${title}

Copy the ID above to bind this group to a merchant.
            `;

            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
            console.log(`[Telegram] /id requested in ${title} (${chatId})`);
        });

        // Error handling
        bot.on('polling_error', (error) => {
            console.error('[Telegram] Polling Error:', error.code); // Log code to avoid spamming full stack
        });

    } catch (error) {
        console.error('[Telegram] Initialization failed:', error.message);
    }
};

const sendMessage = (chatId, text) => {
    if (bot && chatId) {
        bot.sendMessage(chatId, text).catch(e => console.error(`[Telegram] Failed to send to ${chatId}:`, e.message));
    }
};

module.exports = {
    init,
    sendMessage
};
