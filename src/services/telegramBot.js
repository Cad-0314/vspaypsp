const TelegramBot = require('node-telegram-bot-api');
const { User, Order } = require('../models');
const { Op } = require('sequelize');

let bot = null;

const init = (token) => {
    if (!token) {
        console.warn('[Telegram] No BOT_TOKEN provided. Bot integration disabled.');
        return;
    }

    try {
        bot = new TelegramBot(token, { polling: true });
        console.log('[Telegram] Bot initialized successfully.');

        // ─── Helper: Find merchant by Group ID ───
        const getMerchant = async (chatId) => {
            return await User.findOne({ where: { telegramGroupId: chatId.toString() } });
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /start — Welcome
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const name = msg.from.first_name || 'there';
            bot.sendMessage(chatId, [
                `━━━━━━━━━━━━━━━━━━━━━`,
                `  🏦  *GaurPay Bot*`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `Hi *${name}*! Welcome aboard 👋`,
                ``,
                `Use /bind \`<username>\` to link`,
                `this group to a merchant account.`,
                ``,
                `Type /h for all commands.`,
                ``,
                `_⚡ Fast • Secure • Reliable_`,
            ].join('\n'), { parse_mode: 'Markdown' });
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /bind <username> — Bind group
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/bind (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const username = match[1].trim();

            if (!username) {
                return bot.sendMessage(chatId, '⚠️ Usage: /bind `<username>`', { parse_mode: 'Markdown' });
            }

            try {
                const merchant = await User.findOne({ where: { username } });

                if (!merchant) {
                    return bot.sendMessage(chatId, [
                        `❌ *Merchant Not Found*`,
                        ``,
                        `No merchant with username \`${username}\`.`,
                        `Please check the username and try again.`,
                    ].join('\n'), { parse_mode: 'Markdown' });
                }

                // Check if already bound to another group
                if (merchant.telegramGroupId && merchant.telegramGroupId !== chatId.toString()) {
                    return bot.sendMessage(chatId, [
                        `⚠️ *Already Bound*`,
                        ``,
                        `Merchant \`${username}\` is already`,
                        `linked to another group.`,
                        `Contact admin to reassign.`,
                    ].join('\n'), { parse_mode: 'Markdown' });
                }

                // Bind the group
                merchant.telegramGroupId = chatId.toString();
                await merchant.save();

                bot.sendMessage(chatId, [
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `  ✅  *Binding Successful*`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `👤 Merchant: \`${username}\``,
                    `🆔 Group ID: \`${chatId}\``,
                    ``,
                    `This group is now linked.`,
                    `Type /h to see all commands.`,
                ].join('\n'), { parse_mode: 'Markdown' });

                console.log(`[Telegram] /bind: ${username} → group ${chatId}`);
            } catch (error) {
                console.error('[Telegram] /bind error:', error);
                bot.sendMessage(chatId, `❌ Error binding: ${error.message}`);
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /h — Help menu
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/h$/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, [
                `━━━━━━━━━━━━━━━━━━━━━`,
                `  📖  *Command Menu*`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `🔗  /bind \`<user>\` — Link group`,
                `📋  /details — Account overview`,
                `📈  /sr — Success rates`,
                `🎫  /pl \`<amount>\` — Payment link`,
                `🔍  /query \`<orderId>\` — Order lookup`,
                `🔄  /callback \`<orderId>\` — Retry callback`,
                `🆔  /id — Get chat ID`,
                `❓  /h — This menu`,
            ].join('\n'), { parse_mode: 'Markdown' });
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /id — Chat/Group ID
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/id/, (msg) => {
            const chatId = msg.chat.id;
            const type = msg.chat.type;
            const title = msg.chat.title || msg.from.username || 'Private';

            bot.sendMessage(chatId, [
                `━━━━━━━━━━━━━━━━━━━━━`,
                `  🆔  *Chat Info*`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `ID ➜ \`${chatId}\``,
                `Type ➜ ${type}`,
                `Name ➜ ${title}`,
                ``,
                `_Use this ID for merchant binding._`,
            ].join('\n'), { parse_mode: 'Markdown' });
            console.log(`[Telegram] /id requested in ${title} (${chatId})`);
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /details — Account data
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/details/, async (msg) => {
            const chatId = msg.chat.id;
            const merchant = await getMerchant(chatId);

            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant.\nUse /bind `<username>` to link.', { parse_mode: 'Markdown' });
            }

            const rates = JSON.parse(merchant.channel_rates || '{}');
            const bal = parseFloat(merchant.balance).toFixed(2);
            const pending = parseFloat(merchant.pendingBalance).toFixed(2);

            bot.sendMessage(chatId, [
                `━━━━━━━━━━━━━━━━━━━━━`,
                `  📋  *Account Details*`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `👤  Merchant ➜ \`${merchant.username}\``,
                ``,
                `┌─ 💰 Balance`,
                `│  Available: ₹${bal}`,
                `│  Pending:   ₹${pending}`,
                `└──────────────`,
                ``,
                `┌─ ⚙️ Config`,
                `│  Status:  ${merchant.isActive ? '🟢 Active' : '🔴 Inactive'}`,
                `│  PayIn:   ${merchant.canPayin ? '✅ ON' : '❌ OFF'}`,
                `│  Payout:  ✅ ON`,
                `└──────────────`,
                ``,
                `┌─ 📊 Fee Rates`,
                `│  PayIn:   ${rates.payinRate || 0}%`,
                `│  Payout:  ${rates.payoutRate || 0}%`,
                `└──────────────`,
            ].join('\n'), { parse_mode: 'Markdown' });
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /sr — Success rates
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/sr/, async (msg) => {
            const chatId = msg.chat.id;
            const merchant = await getMerchant(chatId);

            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant.\nUse /bind `<username>` to link.', { parse_mode: 'Markdown' });
            }

            bot.sendMessage(chatId, '⏳ _Calculating success rates..._', { parse_mode: 'Markdown' });

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
                getStatsForWindow(1440)
            ]);

            const bar = (pct) => {
                const filled = Math.round(parseFloat(pct) / 10);
                return '█'.repeat(filled) + '░'.repeat(10 - filled);
            };

            bot.sendMessage(chatId, [
                `━━━━━━━━━━━━━━━━━━━━━`,
                `  📈  *Success Rates*`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `⏱ *15 Min*`,
                `${bar(m15.rate)} \`${m15.rate}%\`  (${m15.success}/${m15.total})`,
                ``,
                `⏱ *30 Min*`,
                `${bar(m30.rate)} \`${m30.rate}%\`  (${m30.success}/${m30.total})`,
                ``,
                `⏱ *60 Min*`,
                `${bar(h1.rate)} \`${h1.rate}%\`  (${h1.success}/${h1.total})`,
                ``,
                `📅 *24 Hours*`,
                `${bar(d1.rate)} \`${d1.rate}%\`  (${d1.success}/${d1.total})`,
                ``,
                `_Updated: ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}_`,
            ].join('\n'), { parse_mode: 'Markdown' });
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /pl <amount> — Payment link
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/pl (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const amountStr = match[1];
            const amount = parseFloat(amountStr);

            if (isNaN(amount) || amount <= 0) {
                return bot.sendMessage(chatId, '⚠️ Invalid amount.\nUsage: /pl `200`', { parse_mode: 'Markdown' });
            }

            const merchant = await getMerchant(chatId);
            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant.\nUse /bind `<username>` to link.', { parse_mode: 'Markdown' });
            }

            if (!merchant.canPayin) {
                return bot.sendMessage(chatId, '❌ PayIn is disabled for this merchant.');
            }

            if (!merchant.assignedChannel) {
                return bot.sendMessage(chatId, '❌ No payment channel assigned.');
            }

            try {
                const { v4: uuidv4 } = require('uuid');
                const orderId = `TG_${merchant.username.toUpperCase()}_${uuidv4().substring(0, 8).toUpperCase()}`;
                const APP_URL = process.env.APP_URL || 'https://gaurpay.site';

                const rates = JSON.parse(merchant.channel_rates || '{}');
                const payinRate = parseFloat(rates.payinRate) || 5.0;
                const fee = (amount * payinRate) / 100;
                const netAmount = amount - fee;

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
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
                });

                const paymentLink = `${APP_URL}/pay/${order.id}`;

                bot.sendMessage(chatId, [
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `  🎫  *Payment Link*`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `💵  Amount ➜ ₹${amount.toFixed(2)}`,
                    `🆔  Order  ➜ \`${orderId}\``,
                    `📡  Route  ➜ ${merchant.assignedChannel}`,
                    ``,
                    `🔗 *Pay Now:*`,
                    `${paymentLink}`,
                    ``,
                    `⏳ _Expires in 30 minutes_`,
                ].join('\n'), { parse_mode: 'Markdown' });

                console.log(`[Telegram] /pl generated: ${orderId} for ₹${amount}`);
            } catch (error) {
                console.error('[Telegram] /pl error:', error);
                bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /query <orderId> — Check order
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/query (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '⚠️ Usage: /query `<orderId>`', { parse_mode: 'Markdown' });
            }

            try {
                const order = await Order.findOne({ where: { orderId: orderId } });

                if (!order) {
                    return bot.sendMessage(chatId, [
                        `❌ *Order Not Found*`,
                        ``,
                        `No order matched \`${orderId}\``,
                        `Double-check and try again.`,
                    ].join('\n'), { parse_mode: 'Markdown' });
                }

                const statusMap = {
                    success: { emoji: '✅', label: 'SUCCESS' },
                    failed: { emoji: '❌', label: 'FAILED' },
                    pending: { emoji: '⏳', label: 'PENDING' },
                };
                const s = statusMap[order.status] || { emoji: '🔄', label: order.status.toUpperCase() };

                const createdAt = order.createdAt
                    ? new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                    : 'N/A';
                const updatedAt = order.updatedAt
                    ? new Date(order.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                    : 'N/A';

                bot.sendMessage(chatId, [
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `  🔍  *Order Lookup*`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `🆔  ID ➜ \`${order.orderId}\``,
                    `${s.emoji}  Status ➜ *${s.label}*`,
                    `💵  Amount ➜ ₹${parseFloat(order.amount).toFixed(2)}`,
                    `📦  Type ➜ ${order.type.toUpperCase()}`,
                    ``,
                    order.utr
                        ? `🔗  UTR ➜ \`${order.utr}\``
                        : `🔗  UTR ➜ _Not available_`,
                    ``,
                    `┌─ 🕐 Timeline`,
                    `│  Created: ${createdAt}`,
                    `│  Updated: ${updatedAt}`,
                    `└──────────────`,
                ].join('\n'), { parse_mode: 'Markdown' });

                console.log(`[Telegram] /query executed for order: ${orderId}`);
            } catch (error) {
                console.error('[Telegram] /query error:', error);
                bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /callback <orderId> — Retry
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/callback (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '⚠️ Usage: /callback `<orderId>`', { parse_mode: 'Markdown' });
            }

            try {
                const callbackService = require('./callbackService');
                const result = await callbackService.manualCallback(orderId);

                if (result.success) {
                    const ok = result.isOk;
                    const snippet = result.response ? result.response.substring(0, 80) : 'N/A';
                    bot.sendMessage(chatId, [
                        `━━━━━━━━━━━━━━━━━━━━━`,
                        `  🔄  *Callback Result*`,
                        `━━━━━━━━━━━━━━━━━━━━━`,
                        ``,
                        `${ok ? '✅' : '⚠️'}  ${ok ? 'Acknowledged' : 'Not Acknowledged'}`,
                        `📡  HTTP ➜ ${result.httpCode}`,
                        `📝  Response ➜ \`${snippet}\``,
                    ].join('\n'), { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(chatId, `❌ Callback Failed: ${result.message}`);
                }
            } catch (error) {
                bot.sendMessage(chatId, `❌ Error: ${error.message}`);
            }
        });

        // ─── Error handling ───
        let lastErrorTime = 0;
        bot.on('polling_error', (error) => {
            const now = Date.now();
            if (now - lastErrorTime > 60000) {
                console.error(`[Telegram] Polling Error: ${error.code || error.message}`);
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
