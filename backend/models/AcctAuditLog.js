'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AcctAuditLog = sequelize.define('AcctAuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  actor_id: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.STRING(80), allowNull: false },
  entity_type: { type: DataTypes.STRING(60), allowNull: true },
  entity_id: { type: DataTypes.STRING(64), allowNull: true },
  meta: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'acct_audit_logs',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['tenant_id', 'created_at'], name: 'idx_acct_audit_tenant_created' },
  ],
});

module.exports = AcctAuditLog;
