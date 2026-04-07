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
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  manager_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
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
