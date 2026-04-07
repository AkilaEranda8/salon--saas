'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Package = sequelize.define('Package', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('bundle', 'membership'),
    allowNull: false,
  },
  services: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  sessions_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  validity_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  original_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  package_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  discount_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'packages',
  timestamps: true,
});

module.exports = Package;
