const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StaffSpecialization = sequelize.define('StaffSpecialization', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  commission_type: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: true,
  },
  commission_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
}, {
  tableName: 'staff_specializations',
  timestamps: false,
});

module.exports = StaffSpecialization;
