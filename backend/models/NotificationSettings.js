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
}, {
  tableName: 'notification_settings',
  timestamps: true,
});

module.exports = NotificationSettings;
