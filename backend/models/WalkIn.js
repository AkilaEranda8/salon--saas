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
  reminder_before_start_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  reminder_15_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Push sent 15 min before walk-in service end',
  },
  reminder_at_end_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Push sent when walk-in service end time is reached',
  },
  check_in_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  serve_start_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'When status changed to serving / staff assigned',
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
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'walk_in_queue',
  timestamps: true,
});

module.exports = WalkIn;
