'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CrmMessage = sequelize.define('CrmMessage', {
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
    allowNull: false,
  },
  direction: {
    type: DataTypes.ENUM('inbound', 'outbound'),
    allowNull: false,
  },
  sender_type: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'customer', // customer | ai | agent | system
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  wa_message_id: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  delivery_status: {
    type: DataTypes.STRING(32),
    allowNull: true,
    defaultValue: 'pending',
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'crm_messages',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['conversation_id', 'created_at'] },
    { fields: ['tenant_id', 'created_at'] },
    { unique: true, fields: ['tenant_id', 'wa_message_id'], name: 'crm_messages_tenant_wa_id_uq' },
  ],
});

module.exports = CrmMessage;
