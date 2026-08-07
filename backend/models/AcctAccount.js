'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctAccount = sequelize.define('AcctAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  code: { type: DataTypes.STRING(32), allowNull: false },
  name: { type: DataTypes.STRING(150), allowNull: false },
  type: {
    type: DataTypes.ENUM('asset', 'liability', 'equity', 'revenue', 'expense'),
    allowNull: false,
  },
  parent_id: { type: DataTypes.INTEGER, allowNull: true },
  is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'acct_accounts',
  underscored: true,
  indexes: [
    { unique: true, fields: ['tenant_id', 'code'], name: 'uq_acct_accounts_tenant_code' },
  ],
});

module.exports = AcctAccount;
