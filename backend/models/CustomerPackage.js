'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CustomerPackage = sequelize.define('CustomerPackage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  package_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  purchase_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  sessions_total: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  sessions_used: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'completed'),
    defaultValue: 'active',
  },
  amount_paid: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'customer_packages',
  timestamps: true,
  getterMethods: {
    sessions_remaining() {
      const total = this.getDataValue('sessions_total');
      if (total === null || total === undefined) return null; // unlimited
      return Math.max(0, total - (this.getDataValue('sessions_used') || 0));
    },
  },
});

module.exports = CustomerPackage;
