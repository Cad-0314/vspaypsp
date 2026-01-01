/**
 * Merchant Dashboard API Routes
 * Internal APIs for the merchant dashboard UI
 */

const express = require('express');
const router = express.Router();
const { Order, Settlement, User, Channel, sequelize } = require('../models');
const { getStats, getChartData } = require('../services/stats');
const { v4: uuidv4 } = require('uuid');
const otplib = require('otplib');

// Configure otplib
otplib.authenticator.options = { window: 2, step: 30 };

// Middleware to ensure merchant role
function ensureMerchant(req, res, next) {
    if (req.session.user && req.session.user.role === 'merchant') {
        return next();
    }
    return res.status(403).json({ success: false, error: 'Merchant access required' });
}

router.use(ensureMerchant);

/**
 * GET /api/merchant/stats
 * Get dashboard stats
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await getStats(req.session.user.id);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[MerchantAPI] Stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

/**
 * GET /api/merchant/chart
 * Get dashboard chart data
 */
router.get('/chart', async (req, res) => {
    try {
        const data = await getChartData(req.session.user.id);
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[MerchantAPI] Chart error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch chart data' });
    }
});

/**
 * GET /api/merchant/orders
 * Get order history
 */
router.get('/orders', async (req, res) => {
    try {
        const { type, status, startDate, endDate, page = 1, limit = 10, search } = req.query;
        const offset = (page - 1) * limit;
        const { Op } = require('sequelize');

        const where = { merchantId: req.session.user.id };
        if (type) where.type = type;
        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        if (search) {
            where[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { orderId: { [Op.like]: `%${search}%` } },
                { utr: { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        res.json({
            success: true,
            orders: rows,
            pagination: {
                total: count,
                page: parseInt(page),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('[MerchantAPI] Orders error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
});

/**
 * GET /api/merchant/settlements
 * Get settlement history
 */
router.get('/settlements', async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search } = req.query;
        const offset = (page - 1) * limit;
        const { Op } = require('sequelize');

        const where = { merchantId: req.session.user.id };
        if (status) where.status = status;

        if (search) {
            where[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { utr: { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Settlement.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            settlements: rows,
            pagination: {
                total: count,
                page: parseInt(page),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('[MerchantAPI] Settlements error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch settlements' });
    }
});

/**
 * POST /api/merchant/settlements
 * Request settlement
 */
router.post('/settlements', async (req, res) => {
    try {
        const { amount, notes, type = 'bank' } = req.body;
        const merchantId = req.session.user.id;

        // Check balance
        const merchant = await User.findByPk(merchantId);
        const requestAmount = parseFloat(amount);

        if (requestAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        if (type === 'bank') {
            return res.status(400).json({ success: false, error: 'Bank settlements are disabled. Please use the Payout API for bank transfers.' });
        }

        if (type === 'usdt' && requestAmount < 100000) {
            return res.status(400).json({ success: false, error: 'Minimum USDT settlement is ₹100,000' });
        }

        if (merchant.balance < requestAmount) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }

        const t = await sequelize.transaction();

        try {
            // Deduct balance immediately
            await merchant.update({
                balance: sequelize.literal(`balance - ${requestAmount}`)
            }, { transaction: t });

            // Create settlement record
            const settlement = await Settlement.create({
                merchantId,
                amount: requestAmount,
                status: 'pending',
                type,
                notes
            }, { transaction: t });

            await t.commit();
            res.json({ success: true, message: 'Settlement requested', settlement });

        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[MerchantAPI] Request settlement error:', error);
        res.status(500).json({ success: false, error: 'Failed to request settlement' });
    }
});

/**
 * POST /api/merchant/paylink
 * Generate payment link
 */
router.post('/paylink', async (req, res) => {
    try {
        const { amount, customerName } = req.body;
        const merchantId = req.session.user.id;

        const merchant = await User.findByPk(merchantId);
        if (!merchant.assignedChannel) {
            return res.status(400).json({ success: false, error: 'No channel assigned to this merchant' });
        }

        const amt = parseFloat(amount);
        if (isNaN(amt) || amt < 100) {
            return res.status(400).json({ success: false, error: 'Invalid amount. Minimum is ₹100' });
        }

        // Get channel rates
        const channel = await Channel.findOne({ where: { name: merchant.assignedChannel } });
        const payinRate = channel ? parseFloat(channel.payinRate) : 5.0;
        const fee = (amt * payinRate) / 100;
        const netAmount = amt - fee;

        const orderId = `PL${Date.now()}${Math.floor(Math.random() * 1000)}`;

        const channelName = merchant.assignedChannel || 'hdpay';

        const order = await Order.create({
            id: uuidv4(),
            orderId: orderId,
            merchantId,
            amount: amt,
            netAmount: netAmount,
            fee: fee,
            status: 'pending',
            type: 'payin',
            channelName: channelName,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        });

        // Current host URL
        const protocol = req.protocol;
        const host = req.get('host');
        const link = `${protocol}://${host}/pay/${order.id}`;

        res.json({ success: true, link, orderId });

    } catch (error) {
        console.error('[MerchantAPI] Paylink error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate link' });
    }
});

/**
 * GET /api/merchant/export/orders
 * Export orders to CSV
 */
router.get('/export/orders', async (req, res) => {
    try {
        const { type, status, startDate, endDate, search } = req.query;
        const { Op } = require('sequelize');

        const where = { merchantId: req.session.user.id };
        if (type) where.type = type;
        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt[Op.gte] = new Date(startDate);
            if (endDate) where.createdAt[Op.lte] = new Date(endDate);
        }

        if (search) {
            where[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { orderId: { [Op.like]: `%${search}%` } },
                { utr: { [Op.like]: `%${search}%` } }
            ];
        }

        const orders = await Order.findAll({
            where,
            order: [['createdAt', 'DESC']],
            raw: true
        });

        // Generate CSV manually
        const headers = ['Order ID', 'Merchant Order ID', 'Amount', 'Fee', 'Net Amount', 'Status', 'Type', 'UTR', 'Created At'];
        const rows = orders.map(o => [
            o.id,
            o.orderId,
            o.amount,
            o.fee,
            o.netAmount,
            o.status,
            o.type,
            o.utr || '',
            new Date(o.createdAt).toISOString()
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=orders_${Date.now()}.csv`);
        res.send(csvContent);

    } catch (error) {
        console.error('[MerchantAPI] Export error:', error);
        res.status(500).json({ success: false, error: 'Failed to export orders' });
    }
});

// Manual Callback Trigger
router.post('/callback/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        // Verify ownership (security check)
        const order = await Order.findOne({
            where: {
                merchantId: req.user.id,
                orderId: orderId
            }
        });

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const result = await require('../services/callbackService').manualCallback(orderId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// IP Whitelisting Management
// ==========================================

/**
 * GET /api/merchant/ips
     * Get merchant's whitelisted IPs
     */
router.get('/ips', async (req, res) => {
    try {
        const merchant = await User.findByPk(req.session.user.id);
        let ips = [];
        try {
            ips = JSON.parse(merchant.whitelistedIps || '[]');
        } catch (e) {
            ips = [];
        }
        res.json({ success: true, ips, has2fa: !!merchant.two_fa_enabled });
    } catch (error) {
        console.error('[MerchantAPI] Get IPs error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch IPs' });
    }
});

/**
 * POST /api/merchant/ips/add
 * Add IP to whitelist (requires 2FA)
 */
router.post('/ips/add', async (req, res) => {
    try {
        const { ip, totpCode } = req.body;
        const merchant = await User.findByPk(req.session.user.id);

        // Require 2FA to be enabled
        if (!merchant.two_fa_enabled || !merchant.two_fa_secret) {
            return res.status(400).json({ success: false, error: 'Please enable 2FA first to manage IP whitelist' });
        }

        // Verify TOTP code
        if (!totpCode) {
            return res.status(400).json({ success: false, error: '2FA code is required' });
        }

        const isValid = otplib.authenticator.check(totpCode, merchant.two_fa_secret);
        if (!isValid) {
            return res.status(400).json({ success: false, error: 'Invalid 2FA code' });
        }

        // Validate IP format (IPv4 only for simplicity)
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ip || !ipRegex.test(ip)) {
            return res.status(400).json({ success: false, error: 'Invalid IP format. Example: 192.168.1.1' });
        }

        // Get current IPs and add new one
        let ips = [];
        try {
            ips = JSON.parse(merchant.whitelistedIps || '[]');
        } catch (e) {
            ips = [];
        }

        if (ips.includes(ip)) {
            return res.status(400).json({ success: false, error: 'IP already whitelisted' });
        }

        ips.push(ip);
        await merchant.update({ whitelistedIps: JSON.stringify(ips) });

        console.log(`[MerchantAPI] IP ${ip} added to whitelist for ${merchant.username}`);
        res.json({ success: true, message: 'IP added to whitelist', ips });

    } catch (error) {
        console.error('[MerchantAPI] Add IP error:', error);
        res.status(500).json({ success: false, error: 'Failed to add IP' });
    }
});

/**
 * POST /api/merchant/ips/remove
 * Remove IP from whitelist (requires 2FA)
 */
router.post('/ips/remove', async (req, res) => {
    try {
        const { ip, totpCode } = req.body;
        const merchant = await User.findByPk(req.session.user.id);

        // Require 2FA to be enabled
        if (!merchant.two_fa_enabled || !merchant.two_fa_secret) {
            return res.status(400).json({ success: false, error: 'Please enable 2FA first to manage IP whitelist' });
        }

        // Verify TOTP code
        if (!totpCode) {
            return res.status(400).json({ success: false, error: '2FA code is required' });
        }

        const isValid = otplib.authenticator.check(totpCode, merchant.two_fa_secret);
        if (!isValid) {
            return res.status(400).json({ success: false, error: 'Invalid 2FA code' });
        }

        // Get current IPs and remove
        let ips = [];
        try {
            ips = JSON.parse(merchant.whitelistedIps || '[]');
        } catch (e) {
            ips = [];
        }

        const index = ips.indexOf(ip);
        if (index === -1) {
            return res.status(400).json({ success: false, error: 'IP not found in whitelist' });
        }

        ips.splice(index, 1);
        await merchant.update({ whitelistedIps: JSON.stringify(ips) });

        console.log(`[MerchantAPI] IP ${ip} removed from whitelist for ${merchant.username}`);
        res.json({ success: true, message: 'IP removed from whitelist', ips });

    } catch (error) {
        console.error('[MerchantAPI] Remove IP error:', error);
        res.status(500).json({ success: false, error: 'Failed to remove IP' });
    }
});

module.exports = router;
