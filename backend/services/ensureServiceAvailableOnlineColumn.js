'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Adds services.available_online — controls WordPress / public booking visibility. */
async function ensureServiceAvailableOnlineColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    const desc = await qi.describeTable('services');
    if (!desc.available_online) {
      await qi.addColumn('services', 'available_online', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        after: 'is_active',
      });
      console.log('[Schema] services.available_online added');
    }
    // Existing rows: keep visible online by default
    await sequelize.query(
      'UPDATE services SET available_online = 1 WHERE available_online IS NULL'
    );
  } catch (e) {
    console.warn('[Schema] services.available_online:', e.message);
  }
}

module.exports = ensureServiceAvailableOnlineColumn;
