'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctBankTxn = sequelize.define('AcctBankTxn', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  bank_account_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  type: {
    type: DataTypes.ENUM('deposit', 'withdrawal', 'transfer'),
    allowNull: false,
  },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  memo: { type: DataTypes.STRING(255), allowNull: true },
  counterparty_gl_account_id: { type: DataTypes.INTEGER, allowNull: true },
  transfer_bank_account_id: { type: DataTypes.INTEGER, allowNull: true },
  journal_id: { type: DataTypes.INTEGER, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'acct_bank_txns',
  underscored: true,
});

module.exports = AcctBankTxn;
