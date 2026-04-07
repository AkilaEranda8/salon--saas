const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PaymentSplit = sequelize.define('PaymentSplit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  payment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  method: {
    type: DataTypes.ENUM('Cash', 'Card', 'Online Transfer', 'Loyalty Points', 'Package'),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  customer_package_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'payment_splits',
  timestamps: false,
});

module.exports = PaymentSplit;
