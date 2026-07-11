const TelegramBot = require('node-telegram-bot-api');
const { User, Order } = require('../models');
const { Op } = require('sequelize');

let bot = null;

const { getWorkingAgent, invalidateAgent } = require('./proxyManager');

const init = async (token) => {
    if (!token) {
        console.warn('[Telegram] No BOT_TOKEN provided. Bot integration disabled.');
        return;
    }

    try {
        const agent = await getWorkingAgent();
        bot = new TelegramBot(token, {
            polling: true,
            request: { agent }
        });
        console.log('[Telegram] Bot initialized successfully with proxy.');

        // ─── Helper: Find merchant by Group ID ───
        const getMerchant = async (chatId) => {
            return await User.findOne({ where: { telegramGroupId: chatId.toString() } });
        };

        // ─── Regex note ───
        // In groups/supergroups, commands arrive as /cmd@BotUsername
        // All patterns use (?:@\w+)? to handle the optional @botname suffix
        // \b or $ word boundaries prevent /start from matching /sr etc.

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /start — Welcome
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/start(?:@\w+)?(?:\s|$)/, (msg) => {
            const chatId = msg.chat.id;
            const name = (msg.from.first_name || 'there').replace(/[_*`[\]()]/g, '\\$&');
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
            ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /start send failed:', e.message));
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /bind <username> — Bind group
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/bind(?:@\w+)?\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const username = match[1].trim();

            if (!username) {
                return bot.sendMessage(chatId, '⚠️ Usage: /bind `<username>`', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /bind usage send failed:', e.message));
            }

            try {
                const merchant = await User.findOne({ where: { username } });

                if (!merchant) {
                    return bot.sendMessage(chatId, [
                        `❌ *Merchant Not Found*`,
                        ``,
                        `No merchant with username \`${username}\`.`,
                        `Please check the username and try again.`,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /bind notfound send failed:', e.message));
                }

                // Check if already bound to another group
                if (merchant.telegramGroupId && merchant.telegramGroupId !== chatId.toString()) {
                    return bot.sendMessage(chatId, [
                        `⚠️ *Already Bound*`,
                        ``,
                        `Merchant \`${username}\` is already`,
                        `linked to another group.`,
                        `Contact admin to reassign.`,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /bind bound send failed:', e.message));
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
                ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /bind success send failed:', e.message));

                console.log(`[Telegram] /bind: ${username} → group ${chatId}`);
            } catch (error) {
                console.error('[Telegram] /bind error:', error);
                bot.sendMessage(chatId, `❌ Error binding: ${error.message}`).catch(e => console.error('[Telegram] /bind error reply failed:', e.message));
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /h or /help — Help menu
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/(?:h|help)(?:@\w+)?$/, (msg) => {
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
                `🔍  /fetch \`<orderId>\` — Process skipped order`,
                `🧪  /cbt \`<orderId>\` — Test success callback`,
                `🆔  /id — Get chat ID`,
                `❓  /h — This menu`,
            ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /h send failed:', e.message));
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /id — Chat/Group ID
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/id(?:@\w+)?(?:\s|$)/, (msg) => {
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
            ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /id send failed:', e.message));
            console.log(`[Telegram] /id requested in ${title} (${chatId})`);
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /details or /data — Account data
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/(?:details|data)(?:@\w+)?(?:\s|$)/, async (msg) => {
            const chatId = msg.chat.id;
            const merchant = await getMerchant(chatId);

            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant.\nUse /bind `<username>` to link.', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /details notbound send failed:', e.message));
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
            ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /details send failed:', e.message));
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /sr or /stats — Success rates
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/(?:sr|stats)(?:@\w+)?(?:\s|$)/, async (msg) => {
            const chatId = msg.chat.id;
            const merchant = await getMerchant(chatId);

            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant.\nUse /bind `<username>` to link.', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /sr notbound send failed:', e.message));
            }

            bot.sendMessage(chatId, '⏳ _Calculating success rates..._', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /sr calculating send failed:', e.message));

            const now = new Date();

            const getStatsForWindow = async (minutes, type) => {
                const startTime = new Date(now.getTime() - minutes * 60000);
                const where = {
                    merchantId: merchant.id,
                    type: type,
                    createdAt: { [Op.gte]: startTime }
                };
                const total = await Order.count({ where });
                const success = await Order.count({ where: { ...where, status: 'success' } });
                const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
                return { total, success, rate };
            };

            const windows = [1, 5, 15, 30, 60, 240];
            const labels = ['1 Min', '5 Min', '15 Min', '30 Min', '1 Hour', '4 Hours'];

            const [payinStats, payoutStats] = await Promise.all([
                Promise.all(windows.map(w => getStatsForWindow(w, 'payin'))),
                Promise.all(windows.map(w => getStatsForWindow(w, 'payout'))),
            ]);

            const bar = (pct) => {
                const filled = Math.round(parseFloat(pct) / 10);
                return '█'.repeat(filled) + '░'.repeat(10 - filled);
            };

            const formatSection = (stats, windowLabels) => {
                return windowLabels.map((label, i) => {
                    const s = stats[i];
                    return `│ ${label.padEnd(8)} ${bar(s.rate)} \`${s.rate}%\` (${s.success}/${s.total})`;
                }).join('\n');
            };

            bot.sendMessage(chatId, [
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `  📈  *Success Rates*`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `┌─ 📥 *PayIn*`,
                formatSection(payinStats, labels),
                `└──────────────────────`,
                ``,
                `┌─ 📤 *Payout*`,
                formatSection(payoutStats, labels),
                `└──────────────────────`,
                ``,
                `_🕐 ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST_`,
            ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /sr final send failed:', e.message));
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /pl <amount> — Payment link
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/pl(?:@\w+)?\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const amountStr = match[1];
            const amount = parseFloat(amountStr);

            if (isNaN(amount) || amount <= 0) {
                return bot.sendMessage(chatId, '⚠️ Invalid amount.\nUsage: /pl `200`', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /pl invalid amount send failed:', e.message));
            }

            const merchant = await getMerchant(chatId);
            if (!merchant) {
                return bot.sendMessage(chatId, '❌ This group is not bound to any merchant.\nUse /bind `<username>` to link.', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /pl notbound send failed:', e.message));
            }

            if (!merchant.canPayin) {
                return bot.sendMessage(chatId, '❌ PayIn is disabled for this merchant.').catch(e => console.error('[Telegram] /pl payin disabled send failed:', e.message));
            }

            if (!merchant.assignedChannel) {
                return bot.sendMessage(chatId, '❌ No payment channel assigned.').catch(e => console.error('[Telegram] /pl nochannel send failed:', e.message));
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
                    ``,
                    `🔗 *Pay Now:*`,
                    `${paymentLink}`,
                    ``,
                    `⏳ _Expires in 30 minutes_`,
                ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /pl success send failed:', e.message));

                console.log(`[Telegram] /pl generated: ${orderId} for ₹${amount}`);
            } catch (error) {
                console.error('[Telegram] /pl error:', error);
                bot.sendMessage(chatId, `❌ Error: ${error.message}`).catch(e => console.error('[Telegram] /pl error reply failed:', e.message));
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /query <orderId> — Check order
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/query(?:@\w+)?\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '⚠️ Usage: /query `<orderId>`', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /query usage send failed:', e.message));
            }

            try {
                const order = await Order.findOne({ where: { orderId: orderId } });

                if (!order) {
                    return bot.sendMessage(chatId, [
                        `❌ *Order Not Found*`,
                        ``,
                        `No order matched \`${orderId}\``,
                        `Double-check and try again.`,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /query notfound send failed:', e.message));
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
                ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /query success send failed:', e.message));

                console.log(`[Telegram] /query executed for order: ${orderId}`);
            } catch (error) {
                console.error('[Telegram] /query error:', error);
                bot.sendMessage(chatId, `❌ Error: ${error.message}`).catch(e => console.error('[Telegram] /query error reply failed:', e.message));
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /callback <orderId> — Retry
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/callback(?:@\w+)?\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '⚠️ Usage: /callback `<orderId>`', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /callback usage send failed:', e.message));
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
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /callback result send failed:', e.message));
                } else {
                    bot.sendMessage(chatId, `❌ Callback Failed: ${result.message}`).catch(e => console.error('[Telegram] /callback failed reply send failed:', e.message));
                }
            } catch (error) {
                bot.sendMessage(chatId, `❌ Error: ${error.message}`).catch(e => console.error('[Telegram] /callback error reply send failed:', e.message));
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /cbt <orderId> — Test Callback (Success without balance change)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/cbt(?:@\w+)?\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '⚠️ Usage: /cbt `<orderId>`', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /cbt usage send failed:', e.message));
            }

            try {
                const order = await Order.findOne({ where: { orderId: orderId } });

                if (!order) {
                    return bot.sendMessage(chatId, [
                        `❌ *Order Not Found*`,
                        ``,
                        `No order matched \`${orderId}\``,
                        `Double-check and try again.`,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /cbt notfound send failed:', e.message));
                }

                if (order.status === 'success') {
                    return bot.sendMessage(chatId, `⚠️ Order \`${orderId}\` is already marked as success.`, { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /cbt already success send failed:', e.message));
                }

                // Generate a DEMO UTR if none exists
                const demoUtr = order.utr || `DEMO_UTR_${Date.now()}`;

                // Update order to success and assign UTR without going through the normal balance-modifying callback routes
                await order.update({
                    status: 'success',
                    utr: demoUtr,
                    providerOrderId: order.providerOrderId || `DEMO_SYS_${Date.now()}`
                });

                // Send the success callback to the merchant
                const callbackService = require('./callbackService');
                let result;
                if (order.type === 'payin') {
                    result = await callbackService.sendPayinCallback(order, 'success', demoUtr);
                } else {
                    result = await callbackService.sendPayoutCallback(order, 'success', demoUtr);
                }

                if (result.success) {
                    const ok = result.isOk;
                    const snippet = result.response ? result.response.substring(0, 80) : 'N/A';
                    bot.sendMessage(chatId, [
                        `━━━━━━━━━━━━━━━━━━━━━`,
                        `  🧪  *CBT Result*`,
                        `━━━━━━━━━━━━━━━━━━━━━`,
                        ``,
                        `✅ Order Status: Updated to *success*`,
                        `🔗 UTR: \`${demoUtr}\``,
                        `ℹ️ Balance: *Not modified*`,
                        ``,
                        `-- Callback --`,
                        `${ok ? '✅' : '⚠️'}  ${ok ? 'Acknowledged' : 'Not Acknowledged'}`,
                        `📡  HTTP ➜ ${result.httpCode}`,
                        `📝  Response ➜ \`${snippet}\``,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /cbt success send failed:', e.message));
                } else {
                    bot.sendMessage(chatId, `❌ Callback Failed: ${result.message}`).catch(e => console.error('[Telegram] /cbt failed reply send failed:', e.message));
                }

            } catch (error) {
                console.error('[Telegram] /cbt error:', error);
                bot.sendMessage(chatId, `❌ Error: ${error.message}`).catch(e => console.error('[Telegram] /cbt error reply send failed:', e.message));
            }
        });

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //  /fetch <orderId> — Process Skipped Order
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        bot.onText(/\/fetch(?:@\w+)?\s+(.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1].trim();

            if (!orderId) {
                return bot.sendMessage(chatId, '⚠️ Usage: /fetch `<orderId>`', { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /fetch usage send failed:', e.message));
            }

            try {
                const order = await Order.findOne({ where: { orderId: orderId } });

                if (!order) {
                    return bot.sendMessage(chatId, [
                        `❌ *Order Not Found*`,
                        ``,
                        `No order matched \`${orderId}\``,
                        `Double-check and try again.`,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /fetch notfound send failed:', e.message));
                }

                // Check if it's a skipped order (status should be 'processing')
                if (order.status !== 'processing' && order.status !== 'pending') {
                    return bot.sendMessage(chatId, `⚠️ Order \`${orderId}\` is already \`${order.status}\` and cannot be fetched.`, { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /fetch status invalid send failed:', e.message));
                }

                if (!order.utr) {
                    return bot.sendMessage(chatId, `⚠️ Order \`${orderId}\` does not have a UTR yet.`, { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /fetch no utr send failed:', e.message));
                }

                // Update order to success
                await order.update({
                    status: 'success',
                    providerOrderId: order.providerOrderId || `FETCH_${Date.now()}`
                });

                // Send the success callback to the merchant
                const callbackService = require('./callbackService');
                let result;
                if (order.type === 'payin') {
                    result = await callbackService.sendPayinCallback(order, 'success', order.utr);
                } else {
                    result = await callbackService.sendPayoutCallback(order, 'success', order.utr);
                }

                if (result.success) {
                    const ok = result.isOk;
                    const snippet = result.response ? result.response.substring(0, 80) : 'N/A';
                    bot.sendMessage(chatId, [
                        `━━━━━━━━━━━━━━━━━━━━━`,
                        `  🔍  *Fetch Result*`,
                        `━━━━━━━━━━━━━━━━━━━━━`,
                        ``,
                        `✅ Order Status: Updated to *success*`,
                        `🔗 UTR: \`${order.utr}\``,
                        `ℹ️ Balance: *Not modified* (Manual Fetch)`,
                        ``,
                        `-- Callback --`,
                        `${ok ? '✅' : '⚠️'}  ${ok ? 'Acknowledged' : 'Not Acknowledged'}`,
                        `📡  HTTP ➜ ${result.httpCode}`,
                        `📝  Response ➜ \`${snippet}\``,
                    ].join('\n'), { parse_mode: 'Markdown' }).catch(e => console.error('[Telegram] /fetch success send failed:', e.message));
                } else {
                    bot.sendMessage(chatId, `❌ Callback Failed: ${result.message}`).catch(e => console.error('[Telegram] /fetch callback failed send failed:', e.message));
                }

            } catch (error) {
                console.error('[Telegram] /fetch error:', error);
                bot.sendMessage(chatId, `❌ Error: ${error.message}`).catch(e => console.error('[Telegram] /fetch error reply send failed:', e.message));
            }
        });

        // ─── Error handling ───
        let lastErrorTime = 0;
        bot.on('polling_error', async (error) => {
            const now = Date.now();
            if (now - lastErrorTime > 60000) {
                console.error(`[Telegram] Polling Error: ${error.code || error.message}`);
                lastErrorTime = now;
            }
            
            if (error.code === 'EFATAL' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || (error.message && (error.message.includes('socket hang up') || error.message.includes('timeout') || error.message.includes('EHOSTUNREACH')))) {
                console.log('[Telegram] Proxy failed, fetching a new proxy...');
                invalidateAgent();
                try {
                    bot.stopPolling();
                    const newAgent = await getWorkingAgent();
                    if (bot && bot.options && bot.options.request) {
                        bot.options.request.agent = newAgent;
                        console.log('[Telegram] Successfully switched to new proxy agent.');
                        bot.startPolling();
                    }
                } catch (e) {
                    console.error('[Telegram] Failed to switch proxy:', e.message);
                }
            }
        });

    } catch (error) {
        console.error('[Telegram] Initialization failed:', error.message);
    }
};

const sendMessage = (chatId, text) => {
    if (bot && chatId) {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(e => console.error(`[Telegram] Failed to send to ${chatId}:`, e.message));
    }
};

/**
 * Broadcast a message to multiple chat IDs with rate-limit protection
 * @param {string[]} chatIds - Array of Telegram chat IDs
 * @param {string} text - Message text (Markdown supported)
 * @returns {Promise<{sent: number, failed: number}>}
 */
const broadcastMessage = async (chatIds, text) => {
    if (!bot || !chatIds || chatIds.length === 0) {
        return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const chatId of chatIds) {
        try {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            sent++;
            // Small delay to avoid Telegram rate limits (max ~30 msgs/sec)
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e) {
            console.error(`[Telegram] Broadcast failed for ${chatId}:`, e.message);
            failed++;
        }
    }

    console.log(`[Telegram] Broadcast complete: ${sent} sent, ${failed} failed out of ${chatIds.length}`);
    return { sent, failed };
};

module.exports = {
    init,
    sendMessage,
    broadcastMessage
};
