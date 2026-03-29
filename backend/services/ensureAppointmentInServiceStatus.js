const { sequelize } = require('../config/database');

async function ensureAppointmentInServiceStatus() {
  try {
    // Keep existing rows intact; only widen status enum to include in_service.
    await sequelize.query(
      "ALTER TABLE appointments MODIFY COLUMN status ENUM('pending','confirmed','in_service','completed','cancelled') NOT NULL DEFAULT 'pending'",
    );
    console.log('✓ Ensured appointments.status supports in_service');
  } catch (err) {
    console.warn('⚠ ensureAppointmentInServiceStatus:', err.message);
  }
}

module.exports = { ensureAppointmentInServiceStatus };
