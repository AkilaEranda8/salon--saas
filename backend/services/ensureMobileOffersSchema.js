'use strict';

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function ensureColumn(qi, table, name, definition) {
  const desc = await qi.describeTable(table);
  if (!desc[name]) {
    await qi.addColumn(table, name, definition);
    console.log(`[Schema] Added ${table}.${name}`);
  }
}

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
      category: { type: DataTypes.STRING(80), allowNull: true },
      badge_text: { type: DataTypes.STRING(40), allowNull: true },
      original_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      offer_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
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
    return;
  }

  await ensureColumn(qi, 'mobile_offers', 'category', {
    type: DataTypes.STRING(80),
    allowNull: true,
  });
  await ensureColumn(qi, 'mobile_offers', 'badge_text', {
    type: DataTypes.STRING(40),
    allowNull: true,
  });
  await ensureColumn(qi, 'mobile_offers', 'original_price', {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });
  await ensureColumn(qi, 'mobile_offers', 'offer_price', {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });
}

module.exports = ensureMobileOffersSchema;
