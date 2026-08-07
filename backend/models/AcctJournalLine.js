'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctJournalLine = sequelize.define('AcctJournalLine', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  journal_id: { type: DataTypes.INTEGER, allowNull: false },
  account_id: { type: DataTypes.INTEGER, allowNull: false },
  debit: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  credit: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  memo: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'acct_journal_lines',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'journal_id'], name: 'idx_acct_lines_journal' },
    { fields: ['tenant_id', 'account_id'], name: 'idx_acct_lines_account' },
  ],
});

module.exports = AcctJournalLine;
