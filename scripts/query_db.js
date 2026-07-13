const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({ dialect: 'sqlite', storage: './database.sqlite' });
sequelize.query('SELECT * FROM Channels WHERE provider = "bcatpay"')
    .then(res => console.log(res))
    .catch(console.error);
