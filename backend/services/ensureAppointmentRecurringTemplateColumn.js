'use strict';

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function ensureAppointmentRecurringTemplateColumn() {
  const qi = sequelize.getQueryInterface();
  try {
    await qi.addColumn('appointments', 'recurring_message_template_id', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    console.log('[Schema] Added appointments.recurring_message_template_id');
  } catch (e) {
    if (!/duplicate column/i.test(e.message) && e.original?.code !== 'ER_DUP_FIELDNAME') {
      console.warn('[Schema] appointments.recurring_message_template_id:', e.message);
    }
  }
}

module.exports = ensureAppointmentRecurringTemplateColumn;
