const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LoyaltyRule = sequelize.define('LoyaltyRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Earn: every `earn_per_amount` rupees spent = `earn_points` points
  earn_per_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 100,
    comment: 'Spend this many rupees to earn points',
  },
  earn_points: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Points earned per earn_per_amount',
  },
  // Redeem: `redeem_points` points = `redeem_value` rupees discount
  redeem_points: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    comment: 'Points needed to redeem',
  },
  redeem_value: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 50,
    comment: 'Rupee value of redeemed points',
  },
  min_points_redeem: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    comment: 'Minimum points required before any redemption',
  },
  expiry_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'Points expire after this many days (null = never)',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'loyalty_rules',
  timestamps: true,
});

module.exports = LoyaltyRule;
