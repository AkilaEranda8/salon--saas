const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Branch = sequelize.define('Branch', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  /** Salon pin for attendance geofence (WGS84) */
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  /** Allowed distance from salon pin when marking attendance (metres) */
  attendance_radius_m: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 150,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  manager_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  manager_commission_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Branch manager override % of total service amount',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    allowNull: false,
  },
  color: {
    type: DataTypes.STRING(20),
    defaultValue: '#6366f1',
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'branches',
  timestamps: true,
});

module.exports = Branch;
