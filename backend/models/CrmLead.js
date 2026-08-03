'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LEAD_STAGES = [
  'new',
  'conversation',
  'qualified',
  'interested',
  'booking_requested',
  'booking_confirmed',
  'converted',
  'lost',
];

const CrmLead = sequelize.define('CrmLead', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  stage: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'new',
  },
  campaign_source: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  interest_tags: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  follow_up_status: {
    type: DataTypes.STRING(40),
    allowNull: true,
    defaultValue: 'none',
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'crm_leads',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'phone'] },
    { fields: ['tenant_id', 'stage'] },
    { fields: ['customer_id'] },
  ],
});

CrmLead.STAGES = LEAD_STAGES;

module.exports = CrmLead;
