'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NotificationSettings = sequelize.define('NotificationSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // null = global settings; branch_id set = per-branch override (reserved for future use)
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
  },
  appt_confirmed_email: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  appt_confirmed_whatsapp: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  payment_receipt_email: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  payment_receipt_whatsapp: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  loyalty_points_whatsapp: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  appt_confirmed_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  payment_receipt_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  loyalty_points_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  sms_sender_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
  },
  // Notify.lk (or compatible gateway) credentials
  sms_user_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
  },
  sms_api_key: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: null,
  },
  // SMTP credentials (DB overrides .env — set via UI)
  smtp_host: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: null,
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
  },
  smtp_user: {
    type: DataTypes.STRING(150),
    allowNull: true,
    defaultValue: null,
  },
  smtp_pass: {
    type: DataTypes.STRING(200),
    allowNull: true,
    defaultValue: null,
  },
  smtp_from: {
    type: DataTypes.STRING(200),
    allowNull: true,
    defaultValue: null,
  },
  // Twilio credentials (DB overrides .env — set via UI)
  twilio_account_sid: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
  },
  twilio_auth_token: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
  },
  twilio_whatsapp_from: {
    type: DataTypes.STRING(30),
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: 'notification_settings',
  timestamps: true,
});

module.exports = NotificationSettings;
