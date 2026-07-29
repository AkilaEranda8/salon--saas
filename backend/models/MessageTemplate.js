'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MessageTemplate = sequelize.define('MessageTemplate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  event_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  channel: {
    type: DataTypes.ENUM('email', 'whatsapp', 'sms'),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false,
    defaultValue: 'Custom template',
  },
  subject: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'message_templates',
  indexes: [
    {
      fields: ['event_type', 'channel', 'tenant_id'],
      name: 'idx_message_template_lookup',
    },
  ],
});

module.exports = MessageTemplate;
