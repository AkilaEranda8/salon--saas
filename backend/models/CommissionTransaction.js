const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CommissionTransaction = sequelize.define('CommissionTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  payment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  transaction_type: {
    type: DataTypes.ENUM('worker', 'manager_override'),
    allowNull: false,
  },
  worker_staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Staff who performed the service',
  },
  manager_staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Branch manager earning override commission',
  },
  service_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Total service/payment amount commission is based on',
  },
  commission_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Override % for manager_override; null for mixed worker rates',
  },
  commission_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },
  breakdown: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
}, {
  tableName: 'commission_transactions',
  timestamps: true,
  indexes: [
    { fields: ['tenant_id', 'date'] },
    { fields: ['tenant_id', 'branch_id', 'date'] },
    { fields: ['payment_id'] },
    { fields: ['manager_staff_id', 'date'] },
    { fields: ['worker_staff_id', 'date'] },
  ],
});

module.exports = CommissionTransaction;
