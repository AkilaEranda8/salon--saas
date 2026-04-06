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
  // ── SMS / extra channels ──────────────────────────────────────────────────
  appt_confirmed_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  payment_receipt_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  loyalty_points_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  customer_registered_sms: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  customer_registered_email: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  // ── SMS provider credentials ──────────────────────────────────────────────
  sms_sender_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  sms_user_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  sms_api_key: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // ── Twilio credentials ────────────────────────────────────────────────────
  twilio_account_sid: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  twilio_auth_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  twilio_whatsapp_from: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // ── SMTP credentials ──────────────────────────────────────────────────────
  smtp_host: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  smtp_user: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  smtp_from: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  smtp_pass: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'notification_settings',
  timestamps: true,
});

module.exports = NotificationSettings;
