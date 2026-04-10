const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlanChangeLog = sequelize.define('PlanChangeLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  plan_config_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  plan_key: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  plan_label: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  action: {
    type: DataTypes.ENUM('created', 'updated', 'deleted'),
    allowNull: false,
  },
  changed_fields: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  old_values: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  new_values: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  full_snapshot: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  changed_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: 'plan_change_logs',
  timestamps: true,
  updatedAt: false,
});

module.exports = PlanChangeLog;
