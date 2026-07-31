'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

async function ensureServiceSubcategoryColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('services');
    if (!desc.subcategory) {
      await qi.addColumn('services', 'subcategory', {
        type: DataTypes.STRING(100),
        allowNull: true,
        after: 'category',
      });
      console.log('[Schema] services.subcategory added');
    }
  } catch (e) {
    console.warn('[Schema] services.subcategory:', e.message);
  }
}

module.exports = ensureServiceSubcategoryColumn;
