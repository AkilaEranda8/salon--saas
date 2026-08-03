'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Tenant knowledge articles for AI receptionist (FAQ, policies, promos, scripts).
 */
const CrmKnowledgeArticle = sequelize.define('CrmKnowledgeArticle', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  /** faq | policy | promo | service | script | other */
  category: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'faq',
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'NULL = all branches',
  },
  locale: {
    type: DataTypes.STRING(16),
    allowNull: true,
    defaultValue: 'en',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Higher = preferred in search',
  },
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'crm_knowledge_articles',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'is_active'] },
    { fields: ['tenant_id', 'category'] },
    { fields: ['branch_id'] },
  ],
});

module.exports = CrmKnowledgeArticle;
