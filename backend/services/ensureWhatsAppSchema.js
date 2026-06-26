'use strict';
const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function ensureWhatsAppSchema() {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  const names = tables.map((t) => (typeof t === 'object' ? t.tableName || t.name : t));

  if (!names.includes('whatsapp_messages')) {
    await qi.createTable('whatsapp_messages', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tenant_id: { type: DataTypes.INTEGER, allowNull: false },
      direction: { type: DataTypes.ENUM('in', 'out'), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      jid: { type: DataTypes.STRING(80), allowNull: true },
      wa_message_id: { type: DataTypes.STRING(120), allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('received', 'sent', 'failed'), allowNull: false, defaultValue: 'received' },
      event_type: { type: DataTypes.STRING(50), allowNull: true },
      customer_name: { type: DataTypes.STRING(150), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    console.log('[Schema] Created whatsapp_messages table');
  }

  if (!names.includes('whatsapp_connections')) {
    await qi.createTable('whatsapp_connections', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tenant_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      status: { type: DataTypes.ENUM('disconnected', 'connecting', 'connected'), allowNull: false, defaultValue: 'disconnected' },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      push_name: { type: DataTypes.STRING(100), allowNull: true },
      connected_at: { type: DataTypes.DATE, allowNull: true },
      last_error: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    console.log('[Schema] Created whatsapp_connections table');
  }
}

module.exports = ensureWhatsAppSchema;
