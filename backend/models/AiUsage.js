'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiUsage = sequelize.define('AiUsage', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  conversation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  provider: {
    type: DataTypes.STRING(32),
    allowNull: false,
  },
  model: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  prompt_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  completion_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  total_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  cost: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: false,
    defaultValue: 0,
  },
  currency: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'USD',
  },
  latency_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  purpose: {
    type: DataTypes.STRING(64),
    allowNull: true,
    defaultValue: 'whatsapp_turn',
  },
}, {
  tableName: 'ai_usage',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['tenant_id', 'created_at'] },
    { fields: ['conversation_id'] },
  ],
});

module.exports = AiUsage;
