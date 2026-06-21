const { User, sequelize } = require('./src/models');
const bcrypt = require('bcryptjs'); // Using bcryptjs for compatibility

async function resetAdmin() {
    try {
        await sequelize.sync();
        const adminUser = await User.findOne({ where: { username: 'admin' } });
        if (adminUser) {
            const newPassword = 'password123';
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            adminUser.password_hash = hashedPassword;
            adminUser.two_fa_enabled = false;
            adminUser.two_fa_secret = null;
            await adminUser.save();
            console.log('Admin password successfully reset to password123 and 2FA disabled');
        } else {
            console.log('Admin user not found. Run node seed-admin.js first.');
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

resetAdmin();
