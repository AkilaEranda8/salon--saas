const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StaffOffDay = sequelize.define('StaffOffDay', {
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
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'staff_off_days',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['staff_id', 'date'] },
  ],
});

module.exports = StaffOffDay;
