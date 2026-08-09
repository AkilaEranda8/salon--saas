'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Adds services.image_url for customer-app service cards. */
async function ensureServiceImageUrlColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('services');
    if (!desc.image_url) {
      await qi.addColumn('services', 'image_url', {
        type: DataTypes.STRING(500),
        allowNull: true,
        after: 'description',
      });
      console.log('[Schema] services.image_url added');
    }
  } catch (e) {
    console.warn('[Schema] services.image_url:', e.message);
  }
}

module.exports = ensureServiceImageUrlColumn;
