'use strict';
/**
 * Ensures extended Customer profile columns exist.
 * Adds: dob, allergies, skin_type, hair_type, preferred_staff_id,
 *        internal_notes, profile_photo
 * Safe to run on every startup — uses ADD IF NOT EXISTS.
 */
const { sequelize } = require('../config/database');

let _ran = false;

async function ensureCustomerProfileColumns() {
  if (_ran) return;
  try {
    // Check which columns already exist
    const [cols] = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'",
    );
    const existing = new Set(cols.map((c) => c.COLUMN_NAME));

    const ddl = [];
    if (!existing.has('dob'))
      ddl.push("ADD COLUMN `dob` DATE NULL AFTER `last_visit`");
    if (!existing.has('allergies'))
      ddl.push("ADD COLUMN `allergies` TEXT NULL AFTER `dob`");
    if (!existing.has('skin_type'))
      ddl.push("ADD COLUMN `skin_type` VARCHAR(100) NULL AFTER `allergies`");
    if (!existing.has('hair_type'))
      ddl.push("ADD COLUMN `hair_type` VARCHAR(100) NULL AFTER `skin_type`");
    if (!existing.has('preferred_staff_id'))
      ddl.push("ADD COLUMN `preferred_staff_id` INT NULL AFTER `hair_type`");
    if (!existing.has('internal_notes'))
      ddl.push("ADD COLUMN `internal_notes` TEXT NULL AFTER `preferred_staff_id`");
    if (!existing.has('profile_photo'))
      ddl.push("ADD COLUMN `profile_photo` VARCHAR(500) NULL AFTER `internal_notes`");

    if (ddl.length) {
      await sequelize.query(`ALTER TABLE customers ${ddl.join(', ')}`);
      console.log('[ensureCustomerProfileColumns] Added columns:', ddl.map((d) => d.replace(/^ADD COLUMN /, '').split(' ')[0]).join(', '));
    }
    _ran = true;
  } catch (err) {
    console.error('[ensureCustomerProfileColumns] Error:', err.message);
  }
}

module.exports = { ensureCustomerProfileColumns };
