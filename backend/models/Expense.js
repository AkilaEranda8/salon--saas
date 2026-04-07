const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  category: {
    type: DataTypes.ENUM(
      'Rent',
      'Utilities',
      'Supplies',
      'Salary',
      'Marketing',
      'Maintenance',
      'Other'
    ),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  paid_to: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  payment_method: {
    type: DataTypes.ENUM('cash', 'bank_transfer', 'cheque', 'card'),
    allowNull: true,
  },
  receipt_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'expenses',
  timestamps: true,
});

module.exports = Expense;
