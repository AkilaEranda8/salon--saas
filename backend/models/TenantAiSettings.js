'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Per-tenant AI provider settings (OpenAI / Gemini keys from admin UI).
 * Keys stored encrypted via secretCrypto.
 */
const TenantAiSettings = sequelize.define('TenantAiSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  provider: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'openai',
  },
  model: {
    type: DataTypes.STRING(120),
    allowNull: true,
    defaultValue: 'gpt-4o-mini',
  },
  openai_api_key_enc: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  gemini_api_key_enc: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'tenant_ai_settings',
  underscored: true,
  timestamps: true,
});

module.exports = TenantAiSettings;
