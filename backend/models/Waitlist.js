const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Waitlist = sequelize.define('Waitlist', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  customer_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Preferred staff (optional)',
  },
  preferred_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  preferred_time: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('waiting', 'notified', 'booked', 'cancelled'),
    defaultValue: 'waiting',
  },
  notified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'waitlist',
  timestamps: true,
});

module.exports = Waitlist;
