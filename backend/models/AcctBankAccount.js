'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctBankAccount = sequelize.define('AcctBankAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(150), allowNull: false },
  account_number: { type: DataTypes.STRING(64), allowNull: true },
  bank_name: { type: DataTypes.STRING(150), allowNull: true },
  gl_account_id: { type: DataTypes.INTEGER, allowNull: false },
  is_cash: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  opening_balance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
}, {
  tableName: 'acct_bank_accounts',
  underscored: true,
});

module.exports = AcctBankAccount;
