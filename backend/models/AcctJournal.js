'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctJournal = sequelize.define('AcctJournal', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  period_id: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  memo: { type: DataTypes.STRING(500), allowNull: true },
  status: {
    type: DataTypes.ENUM('draft', 'posted', 'voided'),
    allowNull: false,
    defaultValue: 'draft',
  },
  source_type: { type: DataTypes.STRING(40), allowNull: true },
  source_id: { type: DataTypes.STRING(64), allowNull: true },
  voids_journal_id: { type: DataTypes.INTEGER, allowNull: true },
  voided_by_journal_id: { type: DataTypes.INTEGER, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: true },
  posted_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'acct_journals',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['tenant_id', 'source_type', 'source_id'],
      name: 'uq_acct_journals_source',
    },
    { fields: ['tenant_id', 'date'], name: 'idx_acct_journals_tenant_date' },
    { fields: ['tenant_id', 'period_id'], name: 'idx_acct_journals_period' },
  ],
});

module.exports = AcctJournal;
