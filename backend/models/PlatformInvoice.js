const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlatformInvoice = sequelize.define('PlatformInvoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id',
    },
  },
  invoice_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  billing_period_start: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  billing_period_end: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD',
  },
  status: {
    type: DataTypes.ENUM('draft', 'issued', 'paid', 'overdue', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft',
  },
  issued_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  due_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  plan: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  base_price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  additional_charges: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  discount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  pdf_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'platform_invoices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = PlatformInvoice;
