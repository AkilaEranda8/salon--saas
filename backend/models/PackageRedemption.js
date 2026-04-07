'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PackageRedemption = sequelize.define('PackageRedemption', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  customer_package_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  payment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  service_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  redeemed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  redeemed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'package_redemptions',
  timestamps: true,
});

module.exports = PackageRedemption;
