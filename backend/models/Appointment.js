const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  service_id: {
    type: DataTypes.INTEGER,
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
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  time: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'in_service', 'completed', 'cancelled'),
    defaultValue: 'pending',
  },
  commission_paid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_recurring: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  recurrence_frequency: {
    type: DataTypes.ENUM('weekly'),
    allowNull: true,
    defaultValue: null,
  },
  recurrence_parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'appointments', key: 'id' },
    onDelete: 'SET NULL',
  },
  next_appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'appointments', key: 'id' },
    onDelete: 'SET NULL',
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'appointments',
  timestamps: true,
});

module.exports = Appointment;
