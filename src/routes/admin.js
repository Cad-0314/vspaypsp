/**
 * Admin Routes
 * Merchant management, channel configuration
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Channel, Order } = require('../models');

// Middleware to ensure admin role
function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin' && req.session.user.is2faAuthenticated) {
        return next();
    }
    return res.status(403).json({ success: false, error: 'Admin access required' });
}

/**
 * GET /admin/api/merchants
 * List all merchants
 */
router.get('/merchants', ensureAdmin, async (req, res) => {
    try {
        const merchants = await User.findAll({
            where: { role: 'merchant' },
            attributes: ['id', 'username', 'apiKey', 'assignedChannel', 'balance', 'pendingBalance', 'isActive', 'channel_rates', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });

        res.json({ success: true, merchants: merchants.map(m => m.toJSON()) });
    } catch (error) {
        console.error('[Admin] List merchants error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch merchants' });
    }
});

/**
 * POST /admin/api/merchants
 * Create new merchant
 */
router.post('/merchants', ensureAdmin, async (req, res) => {
    try {
        const { username, password, assignedChannel, payinRate, payoutRate, payoutFixedFee, usdtRate } = req.body;

        // Validate required fields
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password are required' });
        }

        // Check if username exists
        const existing = await User.findOne({ where: { username } });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Build custom rates
        const customRates = {
            payinRate: parseFloat(payinRate) || 5.0,
            payoutRate: parseFloat(payoutRate) || 3.0,
            payoutFixedFee: parseFloat(payoutFixedFee) || 6.0,
            usdtRate: parseFloat(usdtRate) || 0
        };

        // Create merchant
        const merchant = await User.create({
            username,
            password_hash: hashedPassword,
            role: 'merchant',
            assignedChannel: assignedChannel || 'hdpay',
            channel_rates: JSON.stringify(customRates),
            apiSecret: crypto.randomBytes(32).toString('hex'),
            isActive: true
        });

        res.json({
            success: true,
            message: 'Merchant created successfully',
            merchant: {
                id: merchant.id,
                username: merchant.username,
                apiKey: merchant.apiKey,
                assignedChannel: merchant.assignedChannel
            }
        });

    } catch (error) {
        console.error('[Admin] Create merchant error:', error);
        res.status(500).json({ success: false, error: 'Failed to create merchant' });
    }
});

/**
 * GET /admin/api/merchants/:id
 * Get merchant details
 */
router.get('/merchants/:id', ensureAdmin, async (req, res) => {
    try {
        const merchant = await User.findOne({
            where: { id: req.params.id, role: 'merchant' },
            attributes: { exclude: ['password_hash', 'two_fa_secret'] }
        });

        if (!merchant) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        res.json({ success: true, merchant: merchant.toJSON() });
    } catch (error) {
        console.error('[Admin] Get merchant error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch merchant' });
    }
});

/**
 * PUT /admin/api/merchants/:id
 * Update merchant
 */
router.put('/merchants/:id', ensureAdmin, async (req, res) => {
    try {
        const { username, password, assignedChannel, payinRate, payoutRate, payoutFixedFee, usdtRate, isActive } = req.body;

        const merchant = await User.findOne({
            where: { id: req.params.id, role: 'merchant' }
        });

        if (!merchant) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        // Update fields
        const updates = {};

        if (username && username !== merchant.username) {
            const existing = await User.findOne({ where: { username } });
            if (existing) {
                return res.status(400).json({ success: false, error: 'Username already exists' });
            }
            updates.username = username;
        }

        if (password) {
            updates.password_hash = await bcrypt.hash(password, 10);
        }

        if (assignedChannel) {
            updates.assignedChannel = assignedChannel;
        }

        if (typeof isActive === 'boolean') {
            updates.isActive = isActive;
        }

        // Update custom rates
        let currentRates = {};
        try {
            currentRates = JSON.parse(merchant.channel_rates || '{}');
        } catch (e) { }

        if (payinRate !== undefined) currentRates.payinRate = parseFloat(payinRate);
        if (payoutRate !== undefined) currentRates.payoutRate = parseFloat(payoutRate);
        if (payoutFixedFee !== undefined) currentRates.payoutFixedFee = parseFloat(payoutFixedFee);
        if (usdtRate !== undefined) currentRates.usdtRate = parseFloat(usdtRate);

        updates.channel_rates = JSON.stringify(currentRates);

        await merchant.update(updates);

        res.json({
            success: true,
            message: 'Merchant updated successfully',
            merchant: {
                id: merchant.id,
                username: merchant.username,
                assignedChannel: merchant.assignedChannel,
                isActive: merchant.isActive
            }
        });

    } catch (error) {
        console.error('[Admin] Update merchant error:', error);
        res.status(500).json({ success: false, error: 'Failed to update merchant' });
    }
});

/**
 * DELETE /admin/api/merchants/:id
 * Disable merchant (soft delete)
 */
router.delete('/merchants/:id', ensureAdmin, async (req, res) => {
    try {
        const merchant = await User.findOne({
            where: { id: req.params.id, role: 'merchant' }
        });

        if (!merchant) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        await merchant.update({ isActive: false });

        res.json({ success: true, message: 'Merchant disabled' });
    } catch (error) {
        console.error('[Admin] Delete merchant error:', error);
        res.status(500).json({ success: false, error: 'Failed to disable merchant' });
    }
});

/**
 * POST /admin/api/merchants/:id/regenerate-key
 * Regenerate API secret
 */
router.post('/merchants/:id/regenerate-key', ensureAdmin, async (req, res) => {
    try {
        const merchant = await User.findOne({
            where: { id: req.params.id, role: 'merchant' }
        });

        if (!merchant) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        const newSecret = crypto.randomBytes(32).toString('hex');
        await merchant.update({ apiSecret: newSecret });

        res.json({ success: true, message: 'API secret regenerated', apiSecret: newSecret });
    } catch (error) {
        console.error('[Admin] Regenerate key error:', error);
        res.status(500).json({ success: false, error: 'Failed to regenerate key' });
    }
});

/**
 * GET /admin/api/channels
 * List all channels
 */
router.get('/channels', ensureAdmin, async (req, res) => {
    try {
        const channels = await Channel.findAll();
        res.json({ success: true, channels: channels.map(c => c.toJSON()) });
    } catch (error) {
        console.error('[Admin] List channels error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch channels' });
    }
});

/**
 * PUT /admin/api/channels/:id
 * Update channel configuration
 */
router.put('/channels/:id', ensureAdmin, async (req, res) => {
    try {
        const { payinRate, payoutRate, payoutFixedFee, isActive, minPayin, maxPayin, minPayout, maxPayout } = req.body;

        const channel = await Channel.findByPk(req.params.id);
        if (!channel) {
            return res.status(404).json({ success: false, error: 'Channel not found' });
        }

        const updates = {};
        if (payinRate !== undefined) updates.payinRate = parseFloat(payinRate);
        if (payoutRate !== undefined) updates.payoutRate = parseFloat(payoutRate);
        if (payoutFixedFee !== undefined) updates.payoutFixedFee = parseFloat(payoutFixedFee);
        if (isActive !== undefined) updates.isActive = isActive;
        if (minPayin !== undefined) updates.minPayin = parseFloat(minPayin);
        if (maxPayin !== undefined) updates.maxPayin = parseFloat(maxPayin);
        if (minPayout !== undefined) updates.minPayout = parseFloat(minPayout);
        if (maxPayout !== undefined) updates.maxPayout = parseFloat(maxPayout);

        await channel.update(updates);

        res.json({ success: true, message: 'Channel updated', channel: channel.toJSON() });
    } catch (error) {
        console.error('[Admin] Update channel error:', error);
        res.status(500).json({ success: false, error: 'Failed to update channel' });
    }
});

/**
 * GET /admin/api/stats
 * Get admin dashboard stats
 */
router.get('/stats', ensureAdmin, async (req, res) => {
    try {
        const admin = await User.findOne({ where: { role: 'admin' } });
        const merchantCount = await User.count({ where: { role: 'merchant' } });
        const activeCount = await User.count({ where: { role: 'merchant', isActive: true } });

        // Today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayPayins = await Order.count({
            where: { type: 'payin', createdAt: { [require('sequelize').Op.gte]: today } }
        });

        const todayPayouts = await Order.count({
            where: { type: 'payout', createdAt: { [require('sequelize').Op.gte]: today } }
        });

        res.json({
            success: true,
            stats: {
                adminBalance: parseFloat(admin?.balance || 0),
                merchantCount,
                activeMerchants: activeCount,
                todayPayins,
                todayPayouts
            }
        });
    } catch (error) {
        console.error('[Admin] Stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

module.exports = router;
