'use strict';

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function ensureAppointmentRecurringTemplateIdsColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    await qi.addColumn('appointments', 'recurring_message_template_ids', {
      type: DataTypes.JSON,
      allowNull: true,
    });
    console.log('[Schema] Added appointments.recurring_message_template_ids');
  } catch (e) {
    if (!/duplicate column/i.test(e.message) && e.original?.code !== 'ER_DUP_FIELDNAME') {
      console.warn('[Schema] appointments.recurring_message_template_ids:', e.message);
    }
  }
}

module.exports = ensureAppointmentRecurringTemplateIdsColumn;
