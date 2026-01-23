const TelegramBot = require('node-telegram-bot-api');
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
            bot.sendMessage(chatId, `👋 *Hello! Welcome to Payable Support Bot.*\n\n🚀 I'm here to assist you with your transactions.\nUse /id to get this group's ID for merchant binding.\n\n_Powered by Payable_`, { parse_mode: 'Markdown' });
        });

        // /help command
        bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `🛠 **Available Commands**\n\n💰 \`/data\` - View Account Balance & Status\n📊 \`/stats\` - View Success Rates\n🔗 \`/link <amount>\` - Generate Payment Link\n🔍 \`/check <orderId>\` - Check Order Status\n🔄 \`/callback <orderId>\` - Trigger Callback Manually\n🆔 \`/id\` - Get Group/Chat ID\n❓ \`/help\` - Show this help menu`, { parse_mode: 'Markdown' });
        });

        // /link command - Generate payment link
        bot.onText(/\/link (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const amountStr = match[1];
            const amount = parseFloat(amountStr);

            if (isNaN(amount) || amount <= 0) {
                return bot.sendMessage(chatId, '❌ Invalid amount. Usage: /link 200');
            }

            const merchant = await getMerchant(chatId);
            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant account.');
            }

            if (!merchant.canPayin) {
                return bot.sendMessage(chatId, '❌ PayIn is disabled for this merchant.');
            }

            if (!merchant.assignedChannel) {
                return bot.sendMessage(chatId, '❌ No payment channel assigned to this merchant.');
            }

            try {
                const { v4: uuidv4 } = require('uuid');
                const orderId = `TG_${merchant.username.toUpperCase()}_${uuidv4().substring(0, 8).toUpperCase()}`;
                const APP_URL = process.env.APP_URL || 'https://payable.firestars.co';

                // Calculate fee based on merchant rates
                const rates = JSON.parse(merchant.channel_rates || '{}');
                const payinRate = parseFloat(rates.payinRate) || 5.0;
                const fee = (amount * payinRate) / 100;
                const netAmount = amount - fee;

                // Create order in database
                const order = await Order.create({
                    orderId: orderId,
                    merchantId: merchant.id,
                    amount: amount,
                    fee: fee,
                    netAmount: netAmount,
                    type: 'payin',
                    status: 'pending',
                    channelName: merchant.assignedChannel,
                    callbackUrl: merchant.callbackUrl || null,
                    skipUrl: `${APP_URL}/pay/success`,
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 min expiry
                });

                const paymentLink = `${APP_URL}/pay/${order.id}`;

                const response = `
🎫 **Payment Link Generated**

💵 **Amount:** ₹${amount.toFixed(2)}
🆔 **Order ID:** \`${orderId}\`
📡 **Channel:** ${merchant.assignedChannel}

🔗 **Click to Pay:**
${paymentLink}

⏳ _Link valid for 30 minutes_
                `;

                bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                console.log(`[Telegram] /link generated: ${orderId} for ₹${amount}`);
            } catch (error) {
                console.error('[Telegram] /link error:', error);
                bot.sendMessage(chatId, `❌ Error generating link: ${error.message}`);
            }
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
📊 **Merchant Account Status**

👤 **Merchant:** \`${merchant.username}\`
💰 **Balance:** ₹${parseFloat(merchant.balance).toFixed(2)}
⏳ **Pending:** ₹${parseFloat(merchant.pendingBalance).toFixed(2)}

✅ **Status:** ${merchant.isActive ? 'Active' : 'Inactive'}
📥 **PayIn:** ${merchant.canPayin ? 'On' : 'Off'} | 📤 **Payout:** On

📉 **Fee Rates:**
• PayIn: ${rates.payinRate || 0}%
• Payout: ${rates.payoutRate || 0}%
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
📈 **Live Success Rates (PayIn)**

⏱ **15 Mins:** \`${m15.rate}%\`  (${m15.success}/${m15.total})
⏱ **30 Mins:** \`${m30.rate}%\`  (${m30.success}/${m30.total})
⏱ **60 Mins:** \`${h1.rate}%\`  (${h1.success}/${h1.total})

📅 **24 Hours:** \`${d1.rate}%\`  (${d1.success}/${d1.total})
            `;
            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        });

        // /callback command
        bot.onText(/\/callback/, async (msg) => {
            const chatId = msg.chat.id;
            const orderId = msg.text.split(' ')[1];

            if (!orderId) {
                return bot.sendMessage(chatId, 'Usage: /callback <orderId>');
            }

            try {
                // Check if user authorized (bound merchant)
                const merchant = await getMerchant(chatId);
                if (!merchant && chatId > 0) { // Allow private chats if testing, but ideally stricter
                    // For now, allow anyone with Order ID (admin tool style) or restrict?
                    // Let's stick to standard behavior: simply call service
                }

                const callbackService = require('./callbackService');
                const result = await callbackService.manualCallback(orderId);

                if (result.success) {
                    const statusEmoji = result.isOk ? '✅' : '⚠️';
                    const responseDetails = result.response ? result.response.substring(0, 100) : 'N/A';
                    bot.sendMessage(chatId, `${statusEmoji} Callback Sent\n\nResult: ${result.isOk ? 'Acknowledged (OK)' : 'Not Acknowledged'}\nHTTP Code: ${result.httpCode}\nResponse: ${responseDetails}...`);
                } else {
                    bot.sendMessage(chatId, `❌ Callback Failed: ${result.message}`);
                }
            } catch (error) {
                bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // /check command - Check order status
        bot.onText(/\/check (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '❌ Usage: /check <orderId>');
            }

            try {
                const order = await Order.findOne({ where: { orderId: orderId } });

                if (!order) {
                    return bot.sendMessage(chatId, `❌ Order not found: \`${orderId}\``, { parse_mode: 'Markdown' });
                }

                // Status emoji
                const statusEmoji = order.status === 'success' ? '✅' :
                    order.status === 'failed' ? '❌' :
                        order.status === 'pending' ? '⏳' : '🔄';

                // Format dates
                const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A';
                const updatedAt = order.updatedAt ? new Date(order.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A';

                const response = `
🔍 **Order Details**

🆔 **Order ID:** \`${order.orderId}\`
${statusEmoji} **Status:** ${order.status.toUpperCase()}
💵 **Amount:** ₹${parseFloat(order.amount).toFixed(2)}
📦 **Type:** ${order.type.toUpperCase()}

${order.utr ? `🔗 **UTR:** \`${order.utr}\`` : '🔗 **UTR:** _Not available_'}

📅 **Created:** ${createdAt}
🔄 **Updated:** ${updatedAt}
                `;

                bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                console.log(`[Telegram] /check executed for order: ${orderId}`);
            } catch (error) {
                console.error('[Telegram] /check error:', error);
                bot.sendMessage(chatId, `❌ Error checking order: ${error.message}`);
            }
        });

        // Error handling
        let lastErrorTime = 0;
        bot.on('polling_error', (error) => {
            const now = Date.now();
            if (now - lastErrorTime > 60000) { // Log at most once per minute to avoid spam
                console.error(`[Telegram] Polling Error (throttled): ${error.code || error.message}`);
                lastErrorTime = now;
            }
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
