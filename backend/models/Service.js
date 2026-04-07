const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Service = sequelize.define('Service', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'services',
  timestamps: true,
});

module.exports = Service;
