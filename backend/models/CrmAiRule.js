'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Per-tenant AI WhatsApp behaviour rules injected into the system prompt.
 * Distinct from Knowledge Base (FAQs/policies) — these control how the bot behaves.
 */
const CrmAiRule = sequelize.define('CrmAiRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'custom',
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'crm_ai_rules',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['tenant_id', 'is_active'] },
    { fields: ['tenant_id', 'priority'] },
  ],
});

module.exports = CrmAiRule;
