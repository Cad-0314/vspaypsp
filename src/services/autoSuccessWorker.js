/**
 * Auto-Success Payout Worker
 * Periodically checks for payouts scheduled for auto-success
 */

const { Order, User, sequelize } = require('../models');
const callbackService = require('./callbackService');
const { Op } = require('sequelize');

const CHECK_INTERVAL = 60000; // 1 minute

async function processAutoSuccess() {
    try {
        const now = new Date();
        
        // Find orders that are:
        // 1. Payout type
        // 2. Processing status
        // 3. Have autoSuccessAt time and it has passed
        const orders = await Order.findAll({
            where: {
                type: 'payout',
                status: 'processing',
                autoSuccessAt: {
                    [Op.ne]: null,
                    [Op.lte]: now
                }
            }
        });

        if (orders.length === 0) return;

        console.log(`[AutoSuccessWorker] Found ${orders.length} orders to process`);

        for (const order of orders) {
            const t = await sequelize.transaction();
            try {
                // Double check status and autoSuccessAt inside transaction
                const freshOrder = await Order.findByPk(order.id, { transaction: t, lock: true });
                if (!freshOrder || freshOrder.status !== 'processing') {
                    await t.rollback();
                    continue;
                }

                // Generate 12-digit fake UTR
                const fakeUtr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                
                // Update order to success
                await freshOrder.update({
                    status: 'success',
                    utr: fakeUtr,
                    providerOrderId: `AUTO_${freshOrder.id.substring(0, 8)}`
                }, { transaction: t });

                // Update merchant pending balance
                const merchant = await User.findByPk(freshOrder.merchantId, { transaction: t, lock: true });
                if (merchant) {
                    await merchant.update({
                        pendingBalance: sequelize.literal(`pendingBalance - ${freshOrder.amount}`)
                    }, { transaction: t });
                }

                await t.commit();
                console.log(`[AutoSuccessWorker] Order ${freshOrder.orderId} marked as success with UTR ${fakeUtr}`);

                // Send callback asynchronously
                callbackService.sendPayoutCallback(freshOrder, 'success', fakeUtr).then(res => {
                    if (!res.isOk) {
                        callbackService.scheduleRetry(freshOrder, 'success', fakeUtr, 'payout');
                    }
                }).catch(err => {
                    console.error(`[AutoSuccessWorker] Callback error for ${freshOrder.orderId}:`, err.message);
                });

            } catch (err) {
                await t.rollback();
                console.error(`[AutoSuccessWorker] Error processing order ${order.id}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[AutoSuccessWorker] Fatal error:', error);
    }
}

function init() {
    console.log('[AutoSuccessWorker] Initializing...');
    
    // Run immediately on start
    processAutoSuccess();
    
    // Set interval
    setInterval(processAutoSuccess, CHECK_INTERVAL);
}

module.exports = { init, processAutoSuccess };
