const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustomerMembership = sequelize.define('CustomerMembership', {
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
  plan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'cancelled', 'paused'),
    defaultValue: 'active',
  },
  free_credits_remaining: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  amount_paid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  payment_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  enrolled_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID who enrolled the customer',
  },
}, {
  tableName: 'customer_memberships',
  timestamps: true,
});

module.exports = CustomerMembership;
