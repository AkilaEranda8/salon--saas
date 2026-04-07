const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(63),
    allowNull: false,
    unique: true,
    validate: {
      is: /^[a-z0-9-]{3,63}$/,
    },
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  plan: {
    type: DataTypes.ENUM('trial', 'basic', 'pro', 'enterprise'),
    defaultValue: 'trial',
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'cancelled'),
    defaultValue: 'active',
    allowNull: false,
  },
  trial_ends_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  stripe_customer_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  stripe_subscription_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  max_branches: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  max_staff: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
  },
}, {
  tableName: 'tenants',
  timestamps: true,
});

module.exports = Tenant;
