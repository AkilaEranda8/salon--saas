'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StaffFcmToken = sequelize.define('StaffFcmToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'References users.id (the logged-in staff/manager user)',
  },
  fcm_token: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  device_info: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'staff_fcm_tokens',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['user_id'] },
  ],
});

module.exports = StaffFcmToken;
