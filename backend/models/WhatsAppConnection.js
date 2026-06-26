'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WhatsAppConnection = sequelize.define('WhatsAppConnection', {
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
  status: {
    type: DataTypes.ENUM('disconnected', 'connecting', 'connected'),
    allowNull: false,
    defaultValue: 'disconnected',
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  push_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'whatsapp_connections',
  timestamps: true,
});

module.exports = WhatsAppConnection;
