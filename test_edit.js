const { User } = require('./src/models');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        const req = {
            body: {
                username: 'jupiter_test',
                payinChannel: 'gaurpay',
                payoutChannel: 'gaurpay',
                payinRate: 5.5,
                payoutRate: 3.0,
                telegramGroupId: '',
                isActive: true,
                canPayin: true,
                canPayout: true,
                defaultCurrency: 'INR'
            }
        };

        const merchant = await User.findOne({where: {role: 'merchant'}});
        
        const { username, password, payinChannel, payoutChannel, payinRate, payoutRate, payoutFixedFee, usdtRate, isActive, canPayin, canPayout, defaultCurrency, allowedCurrencies } = req.body;
        
        const updates = {};
        if (username) updates.username = username;
        if (password) updates.password_hash = await bcrypt.hash(password, 10);
        if (payinChannel !== undefined) updates.payinChannel = payinChannel;
        if (payoutChannel !== undefined) updates.payoutChannel = payoutChannel;
        if (payinChannel !== undefined) updates.assignedChannel = payinChannel;
        const isNewGroupBinding = req.body.telegramGroupId && req.body.telegramGroupId !== merchant.telegramGroupId;
        
        // Let's print this part specifically
        console.log("req.body.telegramGroupId:", req.body.telegramGroupId);
        if (req.body.telegramGroupId !== undefined) updates.telegramGroupId = req.body.telegramGroupId;
        
        if (typeof isActive === 'boolean') updates.isActive = isActive;
        if (typeof canPayin === 'boolean') updates.canPayin = canPayin;
        if (typeof canPayout === 'boolean') updates.canPayout = canPayout;

        let resolvedCurrency = merchant.defaultCurrency;
        if (defaultCurrency) {
            resolvedCurrency = defaultCurrency.toUpperCase();
            updates.defaultCurrency = resolvedCurrency;
        }

        let resolvedAllowed = [];
        try { resolvedAllowed = JSON.parse(merchant.allowedCurrencies || '["INR"]'); } catch(e){}

        if (allowedCurrencies && Array.isArray(allowedCurrencies)) {
            resolvedAllowed = allowedCurrencies.map(c => c.toUpperCase());
        }

        if (!resolvedAllowed.includes(resolvedCurrency)) resolvedAllowed.push(resolvedCurrency);
        updates.allowedCurrencies = JSON.stringify(resolvedAllowed);

        let currentBalances = {};
        try { currentBalances = JSON.parse(merchant.balances || '{"INR":0}'); } catch(e) {}
        resolvedAllowed.forEach(c => {
            if (currentBalances[c] === undefined) currentBalances[c] = 0;
        });
        updates.balances = JSON.stringify(currentBalances);

        let rates = {};
        try { rates = JSON.parse(merchant.channel_rates || '{}'); } catch (e) { }
        if (payinRate !== undefined) rates.payinRate = parseFloat(payinRate);
        if (payoutRate !== undefined) rates.payoutRate = parseFloat(payoutRate);
        if (payoutFixedFee !== undefined) rates.payoutFixedFee = parseFloat(payoutFixedFee);
        if (usdtRate !== undefined) rates.usdtRate = parseFloat(usdtRate);
        updates.channel_rates = JSON.stringify(rates);

        console.log('Applying updates:', updates);
        await merchant.update(updates);
        console.log('Successfully updated merchant!');

    } catch (e) {
        console.error('Error during update:', e);
    }
    process.exit();
})();
