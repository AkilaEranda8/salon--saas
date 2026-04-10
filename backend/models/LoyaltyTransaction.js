const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LoyaltyTransaction = sequelize.define('LoyaltyTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  payment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Linked payment for earn transactions',
  },
  type: {
    type: DataTypes.ENUM('earn', 'redeem', 'adjust', 'expire'),
    allowNull: false,
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Positive = earned/adjusted up, negative = redeemed/expired',
  },
  balance_after: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'loyalty_transactions',
  timestamps: true,
});

module.exports = LoyaltyTransaction;
