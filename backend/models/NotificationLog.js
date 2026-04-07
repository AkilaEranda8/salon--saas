'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NotificationLog = sequelize.define('NotificationLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  customer_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  event_type: {
    type: DataTypes.ENUM('appointment_confirmed', 'payment_receipt', 'loyalty_points', 'test', 'review_request'),
    allowNull: false,
  },
  channel: {
    type: DataTypes.ENUM('email', 'whatsapp'),
    allowNull: false,
  },
  message_preview: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('sent', 'failed'),
    allowNull: false,
    defaultValue: 'sent',
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'notification_logs',
  timestamps: true,
});

module.exports = NotificationLog;
