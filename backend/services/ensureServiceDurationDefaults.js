const { sequelize } = require('../config/database');

const DEFAULT_DURATION = 30;

async function ensureServiceDurationDefaults() {
  try {
    await sequelize.query(
      `UPDATE services SET duration_minutes = ${DEFAULT_DURATION}
       WHERE duration_minutes IS NULL OR duration_minutes <= 0`,
    );
  } catch (err) {
    console.error('[migration] ensureServiceDurationDefaults error:', err.message);
  }
}

module.exports = { ensureServiceDurationDefaults, DEFAULT_SERVICE_DURATION: DEFAULT_DURATION };
