/**
 * Admin Routes
 * Merchant management, channel configuration, global stats, settlements
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Channel, Order, Settlement, sequelize } = require('../models');
const { getStats, getChartData } = require('../services/stats');
const axios = require('axios');

// Middleware to ensure admin role
function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin' && req.session.user.is2faAuthenticated) {
        return next();
    }
    return res.status(403).json({ success: false, error: 'Admin access required' });
}

router.use(ensureAdmin);

// ==========================================
// Stats & Dashboard
// ==========================================

/**
 * GET /admin/api/stats
 * Get comprehensive admin stats
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await getStats(null); // Global stats
        const admin = await User.findOne({ where: { role: 'admin' } });
        const merchantCount = await User.count({ where: { role: 'merchant' } });
        const activeCount = await User.count({ where: { role: 'merchant', isActive: true } });

        res.json({
            success: true,
            stats: {
                ...stats,
                adminBalance: parseFloat(admin?.balance || 0),
                merchantCount,
                activeMerchants: activeCount
            }
        });
    } catch (error) {
        console.error('[Admin] Stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

/**
 * GET /admin/api/chart
 * Get global chart data
 */
router.get('/chart', async (req, res) => {
    try {
        const data = await getChartData(null); // Global chart
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[Admin] Chart error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch chart data' });
    }
});

// ==========================================
// Merchant Management
// ==========================================

router.get('/merchants', async (req, res) => {
    try {
        const merchants = await User.findAll({
            where: { role: 'merchant' },
            attributes: ['id', 'username', 'apiKey', 'assignedChannel', 'balance', 'pendingBalance', 'isActive', 'channel_rates', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, merchants: merchants.map(m => m.toJSON()) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

router.post('/merchants', async (req, res) => {
    try {
        const { username, password, assignedChannel, payinRate, payoutRate, payoutFixedFee, usdtRate } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, error: 'Missing fields' });

        const existing = await User.findOne({ where: { username } });
        if (existing) return res.status(400).json({ success: false, error: 'Username exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const customRates = {
            payinRate: parseFloat(payinRate) || 5.0,
            payoutRate: parseFloat(payoutRate) || 3.0,
            payoutFixedFee: parseFloat(payoutFixedFee) || 6.0,
            usdtRate: parseFloat(usdtRate) || 0
        };

        const merchant = await User.create({
            username,
            password_hash: hashedPassword,
            role: 'merchant',
            assignedChannel: assignedChannel || 'hdpay',
            channel_rates: JSON.stringify(customRates),
            apiSecret: crypto.randomBytes(32).toString('hex'),
            isActive: true
        });

        res.json({ success: true, merchant: { id: merchant.id, username } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

router.get('/merchants/:id', async (req, res) => {
    try {
        const merchant = await User.findOne({ where: { id: req.params.id }, attributes: { exclude: ['password_hash', 'two_fa_secret'] } });
        if (!merchant) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, merchant });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

router.put('/merchants/:id', async (req, res) => {
    try {
        const { username, password, assignedChannel, payinRate, payoutRate, payoutFixedFee, usdtRate, isActive } = req.body;
        const merchant = await User.findByPk(req.params.id);
        if (!merchant) return res.status(404).json({ success: false, error: 'Not found' });

        const updates = {};
        if (username) updates.username = username;
        if (password) updates.password_hash = await bcrypt.hash(password, 10);
        if (assignedChannel) updates.assignedChannel = assignedChannel;
        if (typeof isActive === 'boolean') updates.isActive = isActive;

        let rates = {};
        try { rates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }
        if (payinRate !== undefined) rates.payinRate = parseFloat(payinRate);
        if (payoutRate !== undefined) rates.payoutRate = parseFloat(payoutRate);
        if (payoutFixedFee !== undefined) rates.payoutFixedFee = parseFloat(payoutFixedFee);
        if (usdtRate !== undefined) rates.usdtRate = parseFloat(usdtRate);
        updates.channel_rates = JSON.stringify(rates);

        await merchant.update(updates);
        res.json({ success: true, message: 'Updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

router.post('/merchants/:id/regenerate-key', async (req, res) => {
    try {
        const merchant = await User.findByPk(req.params.id);
        if (!merchant) return res.status(404).json({ success: false, error: 'Not found' });
        const newSecret = crypto.randomBytes(32).toString('hex');
        await merchant.update({ apiSecret: newSecret });
        res.json({ success: true, apiSecret: newSecret });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

// ==========================================
// Settlement Management
// ==========================================

router.get('/settlements', async (req, res) => {
    try {
        const settlements = await Settlement.findAll({
            include: [{ model: User, as: 'merchant', attributes: ['username'] }],
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, settlements });
    } catch (error) {
        console.error('[Admin] Settlement list error:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

router.put('/settlements/:id', async (req, res) => {
    try {
        const { status, utr, notes } = req.body; // status: 'completed' or 'rejected'
        const settlement = await Settlement.findByPk(req.params.id);

        if (!settlement) return res.status(404).json({ success: false, error: 'Not found' });
        if (settlement.status !== 'pending') return res.status(400).json({ success: false, error: 'Request not pending' });

        const t = await sequelize.transaction();

        try {
            await settlement.update({ status, utr, notes }, { transaction: t });

            if (status === 'rejected') {
                // Refund balance to merchant
                await User.update(
                    { balance: sequelize.literal(`balance + ${settlement.amount}`) },
                    { where: { id: settlement.merchantId }, transaction: t }
                );
            }

            await t.commit();
            res.json({ success: true, message: `Settlement ${status}` });
        } catch (error) {
            await t.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[Admin] Settlement action error:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

// ==========================================
// Channel Management
// ==========================================

router.get('/channels', async (req, res) => {
    try {
        const channels = await Channel.findAll();
        res.json({ success: true, channels });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

router.put('/channels/:id', async (req, res) => {
    try {
        const channel = await Channel.findByPk(req.params.id);
        if (!channel) return res.status(404).json({ success: false, error: 'Not found' });
        await channel.update(req.body);
        res.json({ success: true, message: 'Updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

// ==========================================
// Global Orders
// ==========================================

router.get('/orders', async (req, res) => {
    try {
        const { type, page = 1, limit = 20, search } = req.query;
        const offset = (page - 1) * limit;
        const where = {};

        if (type) where.type = type;
        if (search) {
            where[require('sequelize').Op.or] = [
                { orderId: { [require('sequelize').Op.like]: `%${search}%` } },
                { status: { [require('sequelize').Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']],
            include: [{ model: User, as: 'merchant', attributes: ['username'] }]
        });

        res.json({
            success: true,
            orders: rows,
            pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

// ==========================================
// Broadcasting
// ==========================================

router.post('/broadcast', async (req, res) => {
    try {
        const { message } = req.body;
        // Placeholder for bot broadcasting logic
        console.log(`[Broadcast] Sending to all merchants: ${message}`);

        // In a real implementation we would likely loop through merchants with telegramId
        // or call a dedicated bot service

        res.json({ success: true, message: 'Broadcast queued' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});


module.exports = router;
