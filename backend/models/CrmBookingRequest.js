'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CrmBookingRequest = sequelize.define('CrmBookingRequest', {
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
  status: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'requested', // requested | confirmed | failed
  },
  salon_appointment_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  idempotency_key: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
}, {
  tableName: 'crm_booking_requests',
  underscored: true,
  indexes: [
    { fields: ['tenant_id', 'status'] },
    { fields: ['salon_appointment_id'] },
    { fields: ['idempotency_key'] },
  ],
});

module.exports = CrmBookingRequest;
