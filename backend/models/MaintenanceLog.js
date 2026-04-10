const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MaintenanceLog = sequelize.define('MaintenanceLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ends_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  changed_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'maintenance_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = MaintenanceLog;
