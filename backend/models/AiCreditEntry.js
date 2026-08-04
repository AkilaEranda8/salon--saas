'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Manual Gemini / AI prepaid credit ledger.
 * Google does not expose AI Studio prepay balance via API key,
 * so admins record top-ups (and optional "set balance" syncs).
 * Remaining ≈ SUM(amount_usd) − SUM(ai_usage.cost).
 */
const AiCreditEntry = sequelize.define('AiCreditEntry', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  entry_type: {
    type: DataTypes.ENUM('topup', 'set_balance', 'adjustment'),
    allowNull: false,
    defaultValue: 'topup',
  },
  amount_usd: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: false,
  },
  note: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'ai_credit_entries',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['tenant_id', 'created_at'] },
  ],
});

module.exports = AiCreditEntry;
