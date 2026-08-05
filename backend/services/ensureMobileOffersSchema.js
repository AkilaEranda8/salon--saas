'use strict';

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function ensureMobileOffersSchema() {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  const names = tables.map((t) => (typeof t === 'object' ? t.tableName || t.name : t));

  if (!names.includes('mobile_offers')) {
    await qi.createTable('mobile_offers', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tenant_id: { type: DataTypes.INTEGER, allowNull: false },
      title: { type: DataTypes.STRING(160), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      image_url: { type: DataTypes.STRING(500), allowNull: true },
      starts_at: { type: DataTypes.DATEONLY, allowNull: true },
      ends_at: { type: DataTypes.DATEONLY, allowNull: true },
      is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await qi.addIndex('mobile_offers', ['tenant_id']);
    await qi.addIndex('mobile_offers', ['is_published']);
    console.log('[Schema] Created mobile_offers table');
  }
}

module.exports = ensureMobileOffersSchema;
