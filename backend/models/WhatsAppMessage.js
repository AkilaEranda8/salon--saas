'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WhatsAppMessage = sequelize.define('WhatsAppMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  direction: {
    type: DataTypes.ENUM('in', 'out'),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  jid: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  wa_message_id: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('received', 'sent', 'failed'),
    allowNull: false,
    defaultValue: 'received',
  },
  event_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  customer_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
}, {
  tableName: 'whatsapp_messages',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id', 'createdAt'] },
    { fields: ['tenant_id', 'phone'] },
  ],
});

module.exports = WhatsAppMessage;
