require('dotenv').config();
const { Sequelize } = require('sequelize');

const isProduction = process.env.NODE_ENV === 'production';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host:    process.env.DB_HOST,
    dialect: 'mysql',
    logging: false,
    timezone: '+05:30', // Asia/Colombo
    dialectOptions: {
      timezone: '+05:30',
    },
    pool: {
      max:     isProduction ? 20 : 5,
      min:     isProduction ? 2  : 0,
      acquire: 30000,
      idle:    isProduction ? 60000 : 10000,
    },
  }
);

module.exports = { sequelize };
