const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SupportTicket = sequelize.define('SupportTicket', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ticket_no: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
  },
  tenant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  created_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  assigned_to_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  subject: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: '',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
  },
  category: {
    type: DataTypes.ENUM('technical', 'billing', 'account', 'feature', 'other'),
    allowNull: false,
    defaultValue: 'other',
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'waiting_customer', 'resolved', 'closed'),
    allowNull: false,
    defaultValue: 'open',
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    allowNull: false,
    defaultValue: 'medium',
  },
  source: {
    type: DataTypes.ENUM('web', 'platform', 'email'),
    allowNull: false,
    defaultValue: 'web',
  },
  last_activity_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'support_tickets',
  timestamps: true,
});

module.exports = SupportTicket;
