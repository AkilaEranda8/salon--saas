'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctApBill = sequelize.define('AcctApBill', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  supplier_name: { type: DataTypes.STRING(150), allowNull: false },
  bill_no: { type: DataTypes.STRING(64), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  due_date: { type: DataTypes.DATEONLY, allowNull: true },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  status: {
    type: DataTypes.ENUM('open', 'paid', 'void'),
    allowNull: false,
    defaultValue: 'open',
  },
  memo: { type: DataTypes.STRING(255), allowNull: true },
  expense_id: { type: DataTypes.INTEGER, allowNull: true },
  journal_id: { type: DataTypes.INTEGER, allowNull: true },
  settle_journal_id: { type: DataTypes.INTEGER, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'acct_ap_bills',
  underscored: true,
});

module.exports = AcctApBill;
