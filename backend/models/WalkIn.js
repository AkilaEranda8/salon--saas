const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WalkIn = sequelize.define('WalkIn', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  token: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  customer_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('waiting', 'serving', 'completed', 'cancelled'),
    defaultValue: 'waiting',
  },
  check_in_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  check_in_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  estimated_wait: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'walk_in_queue',
  timestamps: true,
});

module.exports = WalkIn;
