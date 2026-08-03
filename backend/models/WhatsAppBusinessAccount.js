'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Meta WhatsApp Cloud API (WABA) credentials per tenant.
 * Access token + app secret stored encrypted.
 */
const WhatsAppBusinessAccount = sequelize.define('WhatsAppBusinessAccount', {
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
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  waba_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  phone_number_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  },
  display_phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  /** Encrypted permanent / system user token */
  access_token_enc: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  /** Encrypted Meta app secret (for X-Hub-Signature-256) */
  app_secret_enc: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  /** Plain verify token salon configures in Meta developer console */
  verify_token: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  api_version: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'v21.0',
  },
  /** Default template names for transactional (optional) */
  template_confirm: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  template_reminder: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  last_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'whatsapp_business_accounts',
  underscored: true,
  indexes: [
    { unique: true, fields: ['phone_number_id'], name: 'waba_phone_number_id_uq' },
    { unique: true, fields: ['waba_id'], name: 'waba_business_account_id_uq' },
    { fields: ['enabled'] },
  ],
});

module.exports = WhatsAppBusinessAccount;
