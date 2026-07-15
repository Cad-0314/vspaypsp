const callbackService = require('./src/services/callbackService');
const { Order } = require('./src/models');
const sequelize = require('./src/config/database');

async function triggerCallback() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        
        const orderId = 'GPBDIN20260713094053823469';
        console.log(`Triggering manual callback for order: ${orderId}`);
        
        const result = await callbackService.manualCallback(orderId);
        
        console.log('\n--- Callback Result ---');
        console.log(JSON.stringify(result, null, 2));
        
        process.exit(0);
    } catch (e) {
        console.error('Error triggering callback:', e);
        process.exit(1);
    }
}

triggerCallback();
