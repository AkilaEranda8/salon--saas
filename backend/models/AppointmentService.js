const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AppointmentService = sequelize.define('AppointmentService', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'appointment_services',
  timestamps: true,
  indexes: [
    { fields: ['appointment_id'] },
    { fields: ['service_id'] },
    { unique: true, fields: ['appointment_id', 'service_id'] },
  ],
});

module.exports = AppointmentService;
