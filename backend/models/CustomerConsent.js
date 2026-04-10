const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustomerConsent = sequelize.define('CustomerConsent', {
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
  form_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Signature stored as base64 SVG data URL
  signature_data: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  signed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  form_snapshot: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Full text of the form at the time of signing (immutable record)',
  },
}, {
  tableName: 'customer_consents',
  timestamps: true,
});

module.exports = CustomerConsent;
