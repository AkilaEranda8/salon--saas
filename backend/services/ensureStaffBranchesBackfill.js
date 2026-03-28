const { sequelize } = require('../config/database');

/** After staff_branches exists: copy primary branch into junction for legacy rows. */
async function ensureStaffBranchesBackfill() {
  try {
    const dialect = sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      await sequelize.query(`
        INSERT IGNORE INTO staff_branches (staff_id, branch_id, createdAt, updatedAt)
        SELECT s.id, s.branch_id, NOW(), NOW()
        FROM staff s
        WHERE s.branch_id IS NOT NULL
      `);
    } else {
      await sequelize.query(`
        INSERT OR IGNORE INTO staff_branches (staff_id, branch_id, createdAt, updatedAt)
        SELECT s.id, s.branch_id, datetime('now'), datetime('now')
        FROM staff s
        WHERE s.branch_id IS NOT NULL
      `);
    }
    console.log('✓ staff_branches backfilled from staff.branch_id');
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/no such table|doesn't exist|Unknown table/i.test(msg)) return;
    console.warn('staff_branches backfill:', msg);
  }
}

module.exports = { ensureStaffBranchesBackfill };
