'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Configurable CRM automation rule (per tenant).
 * Types: appointment_reminder | welcome_message | birthday_wishes |
 *        review_request | rebooking_reminder | abandoned_booking | promotional_campaign
 */
const CrmAutomation = sequelize.define('CrmAutomation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING(48),
    allowNull: false,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  trigger: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  channel: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'whatsapp',
  },
  delay: {
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  schedule: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  template_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  settings_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'crm_automations',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'type'] },
    { fields: ['tenant_id', 'enabled'] },
  ],
});

CrmAutomation.TYPES = [
  'appointment_reminder',
  'welcome_message',
  'birthday_wishes',
  'review_request',
  'rebooking_reminder',
  'abandoned_booking',
  'promotional_campaign',
];

module.exports = CrmAutomation;
