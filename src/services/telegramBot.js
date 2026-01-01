const { User, Order } = require('../models'); // Ensure models are imported
const { Op } = require('sequelize');

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

        // Helper: Find merchant by Group ID
        const getMerchant = async (chatId) => {
            const merchant = await User.findOne({ where: { telegramGroupId: chatId.toString() } });
            return merchant;
        };

        // /start command
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `Hello! VSPAY Support Bot is active.\n\nUse /id to get this group's ID for binding.`);
        });

        // /help command
        bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `Available Commands:
/data - Show Account Balance & Status
/stats - Show Success Rates (15m, 30m, 1h, 24h)
/id - Get Group/Chat ID
/help - Show this message`);
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

        // /data command
        bot.onText(/\/data/, async (msg) => {
            const chatId = msg.chat.id;
            const merchant = await getMerchant(chatId);

            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant account.');
            }

            const rates = JSON.parse(merchant.channel_rates || '{}');
            const response = `
📊 **Merchant Data**

**Username:** ${merchant.username}
**Balance:** ₹${parseFloat(merchant.balance).toFixed(2)}
**Pending:** ₹${parseFloat(merchant.pendingBalance).toFixed(2)}
**Status:** ${merchant.isActive ? '✅ Active' : '🔴 Inactive'}
**PayIn:** ${merchant.canPayin ? '✅ Enabled' : '🔴 Disabled'}
**Payout:** ${merchant.canPayout ? '✅ Enabled' : '🔴 Disabled'}

**Rates:**
PayIn: ${rates.payinRate || 0}%
Payout: ${rates.payoutRate || 0}%
            `;
            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        });

        // /stats command
        bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            const merchant = await getMerchant(chatId);

            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant account.');
            }

            bot.sendMessage(chatId, '🔄 Calculating stats... please wait.');

            const now = new Date();
            const getStatsForWindow = async (minutes) => {
                const startTime = new Date(now.getTime() - minutes * 60000);
                const where = {
                    merchantId: merchant.id,
                    type: 'payin',
                    createdAt: { [Op.gte]: startTime }
                };
                const total = await Order.count({ where });
                const success = await Order.count({ where: { ...where, status: 'success' } });
                const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
                return { total, success, rate };
            };

            const [m15, m30, h1, d1] = await Promise.all([
                getStatsForWindow(15),
                getStatsForWindow(30),
                getStatsForWindow(60),
                getStatsForWindow(1440) // 24h
            ]);

            const response = `
📈 **Success Rate Stats (PayIn)**

**Last 15 Mins:**
Rate: **${m15.rate}%** (${m15.success}/${m15.total})

**Last 30 Mins:**
Rate: **${m30.rate}%** (${m30.success}/${m30.total})

**Last 1 Hour:**
Rate: **${h1.rate}%** (${h1.success}/${h1.total})

**Last 24 Hours:**
Rate: **${d1.rate}%** (${d1.success}/${d1.total})
            `;
            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
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
