const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: { isEmail: true },
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  visits: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_spent: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  loyalty_points: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_visit: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
}, {
  tableName: 'customers',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['phone', 'branch_id'], name: 'customers_phone_branch_unique' },
  ],
});

module.exports = Customer;
