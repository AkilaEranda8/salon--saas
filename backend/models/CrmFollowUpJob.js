'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Scheduled / completed CRM follow-ups (reminders, abandoned booking, review).
 */
const CrmFollowUpJob = sequelize.define('CrmFollowUpJob', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  /** appointment_reminder | booking_confirm | abandoned_booking | review | rebook */
  job_type: {
    type: DataTypes.STRING(40),
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending', // pending | sent | failed | skipped
  },
  conversation_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  lead_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  scheduled_for: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  meta: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'crm_follow_up_jobs',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'job_type', 'status'] },
    { fields: ['appointment_id', 'job_type'] },
    { fields: ['scheduled_for', 'status'] },
  ],
});

module.exports = CrmFollowUpJob;
