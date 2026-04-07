const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  stripe_subscription_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  stripe_price_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  plan: {
    type: DataTypes.ENUM('basic', 'pro', 'enterprise'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'trialing', 'past_due', 'cancelled'),
    allowNull: false,
  },
  current_period_start: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  current_period_end: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancel_at_period_end: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'subscriptions',
  timestamps: true,
});

module.exports = Subscription;
