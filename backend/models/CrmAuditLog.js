'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CrmAuditLog = sequelize.define('CrmAuditLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  actor_type: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'system',
  },
  actor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  action: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  entity_type: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  entity_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'crm_audit_logs',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['tenant_id', 'created_at'] },
    { fields: ['action'] },
  ],
});

module.exports = CrmAuditLog;
