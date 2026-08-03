'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CrmAiMemory = sequelize.define('CrmAiMemory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  conversation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  lead_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  preferred_services: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  preferred_branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  objections: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'crm_ai_memory',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'phone'] },
    { fields: ['conversation_id'] },
  ],
});

module.exports = CrmAiMemory;
