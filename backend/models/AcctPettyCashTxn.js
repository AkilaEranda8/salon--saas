'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctPettyCashTxn = sequelize.define('AcctPettyCashTxn', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  type: {
    type: DataTypes.ENUM('float_in', 'float_out', 'expense'),
    allowNull: false,
  },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  memo: { type: DataTypes.STRING(255), allowNull: true },
  expense_gl_account_id: { type: DataTypes.INTEGER, allowNull: true },
  journal_id: { type: DataTypes.INTEGER, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'acct_petty_cash_txns',
  underscored: true,
});

module.exports = AcctPettyCashTxn;
