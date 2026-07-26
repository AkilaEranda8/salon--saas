const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvSettings = sequelize.define('InvSettings', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: true },
  branch_id: { type: DataTypes.INTEGER, allowNull: true },
  enable_day_end_consumption: { type: DataTypes.BOOLEAN, defaultValue: true },
  enable_auto_deduction: { type: DataTypes.BOOLEAN, defaultValue: false },
  allow_negative_stock: { type: DataTypes.BOOLEAN, defaultValue: false },
  manager_approval_required: { type: DataTypes.BOOLEAN, defaultValue: false },
  low_stock_notification: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'inv_settings', timestamps: true });

module.exports = InvSettings;
