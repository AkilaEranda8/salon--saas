'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Per-run log for CRM automations (tenant-scoped). */
const CrmAutomationExecution = sequelize.define('CrmAutomationExecution', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  automation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'pending', // pending | running | success | failed | skipped
  },
  executed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Milliseconds',
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'crm_automation_executions',
  underscored: true,
  updatedAt: false,
  indexes: [
    { fields: ['tenant_id', 'executed_at'] },
    { fields: ['automation_id', 'status'] },
    { fields: ['tenant_id', 'status'] },
  ],
});

module.exports = CrmAutomationExecution;
