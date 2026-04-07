const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Reminder = sequelize.define('Reminder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('general', 'inventory', 'staff', 'customer'),
    defaultValue: 'general',
  },
  priority: {
    type: DataTypes.ENUM('high', 'medium', 'low'),
    defaultValue: 'medium',
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_done: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'reminders',
  timestamps: true,
});

module.exports = Reminder;
