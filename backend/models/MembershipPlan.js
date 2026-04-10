const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MembershipPlan = sequelize.define('MembershipPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'quarterly', 'yearly', 'one_time'),
    defaultValue: 'monthly',
  },
  discount_percent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Percentage discount on all services for members',
  },
  free_services_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of free service credits per billing cycle',
  },
  bonus_loyalty_points: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Bonus loyalty points awarded on joining/renewing',
  },
  color: {
    type: DataTypes.STRING(10),
    defaultValue: '#6366f1',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'membership_plans',
  timestamps: true,
});

module.exports = MembershipPlan;
