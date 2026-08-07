'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctPeriod = sequelize.define('AcctPeriod', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  period_key: { type: DataTypes.STRING(7), allowNull: false }, // YYYY-MM
  status: {
    type: DataTypes.ENUM('open', 'closed'),
    allowNull: false,
    defaultValue: 'open',
  },
  closed_at: { type: DataTypes.DATE, allowNull: true },
  closed_by: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'acct_periods',
  underscored: true,
  indexes: [
    { unique: true, fields: ['tenant_id', 'period_key'], name: 'uq_acct_periods_tenant_key' },
  ],
});

module.exports = AcctPeriod;
