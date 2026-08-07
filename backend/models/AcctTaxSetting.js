'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctTaxSetting = sequelize.define('AcctTaxSetting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  vat_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  vat_rate: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 18 },
  registration_no: { type: DataTypes.STRING(64), allowNull: true },
  output_vat_account_id: { type: DataTypes.INTEGER, allowNull: true },
  input_vat_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_cash_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_bank_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_revenue_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_expense_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_payroll_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_ar_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_ap_account_id: { type: DataTypes.INTEGER, allowNull: true },
  default_petty_account_id: { type: DataTypes.INTEGER, allowNull: true },
  auto_post_payments: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  auto_post_expenses: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  auto_post_payroll: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'acct_tax_settings',
  underscored: true,
});

module.exports = AcctTaxSetting;
