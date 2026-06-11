const { Sequelize } = require('sequelize');
const path = require('path');
const models = require('../src/models');

async function runMigration() {
  console.log('Starting migration from SQLite to MySQL...');
  
  // Connect to SQLite
  const sqliteSequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'database.sqlite'),
    logging: false
  });
  
  try {
    // 1. Fetch all data from SQLite
    console.log('Fetching data from SQLite...');
    
    const [users] = await sqliteSequelize.query("SELECT * FROM users;");
    console.log(`Fetched ${users.length} users.`);
    
    const [channels] = await sqliteSequelize.query("SELECT * FROM channels;");
    console.log(`Fetched ${channels.length} channels.`);
    
    let customChannelRanges = [];
    try {
      const [ranges] = await sqliteSequelize.query("SELECT * FROM custom_channel_ranges;");
      customChannelRanges = ranges;
      console.log(`Fetched ${customChannelRanges.length} custom channel ranges.`);
    } catch (e) {
      console.log('custom_channel_ranges table not found in SQLite or query failed. Skipping ranges.');
    }
    
    const [orders] = await sqliteSequelize.query("SELECT * FROM orders;");
    console.log(`Fetched ${orders.length} orders.`);
    
    const [settlements] = await sqliteSequelize.query("SELECT * FROM settlements;");
    console.log(`Fetched ${settlements.length} settlements.`);
    
    // 2. Sync MySQL schemas (force: true drops and recreates tables for a clean start)
    console.log('Syncing MySQL database schemas (dropping existing tables)...');
    await models.sequelize.sync({ force: true });
    console.log('MySQL schema synced.');
    
    // Disable foreign key checks during import
    await models.sequelize.query("SET FOREIGN_KEY_CHECKS = 0;");
    
    // 3. Bulk insert to MySQL
    console.log('Inserting users...');
    await models.User.bulkCreate(users, { validate: false, hooks: false });
    
    console.log('Inserting channels...');
    await models.Channel.bulkCreate(channels, { validate: false, hooks: false });
    
    if (customChannelRanges.length > 0) {
      console.log('Inserting custom channel ranges...');
      await models.CustomChannelRange.bulkCreate(customChannelRanges, { validate: false, hooks: false });
    }
    
    console.log('Inserting orders (chunked)...');
    const orderChunkSize = 500;
    for (let i = 0; i < orders.length; i += orderChunkSize) {
      const chunk = orders.slice(i, i + orderChunkSize);
      await models.Order.bulkCreate(chunk, { validate: false, hooks: false });
      console.log(`Inserted orders ${i + chunk.length}/${orders.length}`);
    }
    
    console.log('Inserting settlements...');
    await models.Settlement.bulkCreate(settlements, { validate: false, hooks: false });
    
    // Enable foreign key checks
    await models.sequelize.query("SET FOREIGN_KEY_CHECKS = 1;");
    
    console.log('SQLite to MySQL migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sqliteSequelize.close();
  }
}

runMigration();
