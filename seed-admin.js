const { User, sequelize } = require('./src/models');
const bcrypt = require('bcryptjs'); // Using bcryptjs for compatibility

async function seedAdmin() {
    try {
        await sequelize.sync();
        
        const adminUsername = 'admin';
        const adminPassword = 'password123';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        const [user, created] = await User.findOrCreate({
            where: { username: adminUsername },
            defaults: {
                password_hash: hashedPassword,
                role: 'admin',
                isActive: true
            }
        });
        
        if (created) {
            console.log('Admin user created successfully!');
            console.log('Username: admin');
            console.log('Password: password123');
        } else {
            console.log('Admin user already exists.');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
}

seedAdmin();
