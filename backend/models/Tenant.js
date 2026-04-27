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
  brand_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  logo_sidebar_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  logo_header_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  logo_login_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  logo_public_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  primary_color: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: '#2563EB',
  },
  sidebar_style: {
    type: DataTypes.ENUM('light', 'dark'),
    allowNull: false,
    defaultValue: 'light',
  },
  font_family: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'Inter',
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
  custom_domain: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
  },
  domain_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  payment_gateway: {
    type: DataTypes.ENUM('stripe', 'paypal', 'square', 'none'),
    defaultValue: 'none',
    allowNull: false,
  },
  back_transfer_wage: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00,
    allowNull: false,
  },
  helapay_merchant_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  helapay_app_id: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  helapay_app_secret: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  helapay_business_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  helapay_notify_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'tenants',
  timestamps: true,
});

module.exports = Tenant;
