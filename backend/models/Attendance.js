const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  check_in: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  check_out: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('present', 'absent', 'leave', 'late'),
    defaultValue: 'present',
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'attendance',
  timestamps: false,
});

module.exports = Attendance;
