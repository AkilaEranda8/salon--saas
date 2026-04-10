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
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'message_templates',
  indexes: [
    {
      unique: true,
      fields: ['event_type', 'channel', 'tenant_id'],
      name: 'uq_message_template',
    },
  ],
});

module.exports = MessageTemplate;
