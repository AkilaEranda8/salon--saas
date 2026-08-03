'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** ai_active | queued | human_active | ai_resume | closed */
const CrmConversation = sequelize.define('CrmConversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  lead_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'ai_active',
  },
  channel: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'whatsapp',
  },
  campaign_source: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  assigned_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  handoff_reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  /** pending_ai | processing | completed | null (C4 resume) */
  ai_turn_state: {
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  ai_turn_wa_message_id: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  last_inbound_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_outbound_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'crm_conversations',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'phone'] },
    { fields: ['tenant_id', 'status'] },
    { fields: ['lead_id'] },
    { fields: ['tenant_id', 'ai_turn_state'] },
  ],
});

module.exports = CrmConversation;
