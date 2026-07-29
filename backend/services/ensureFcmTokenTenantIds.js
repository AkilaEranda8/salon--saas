'use strict';

/**
 * Backfill staff_fcm_tokens.tenant_id from branch or user when missing.
 * Safe / idempotent — only fills nulls.
 */
async function ensureFcmTokenTenantIds() {
  try {
    const { sequelize } = require('../config/database');
    const [result] = await sequelize.query(`
      UPDATE staff_fcm_tokens t
      LEFT JOIN branches b ON b.id = t.branch_id
      LEFT JOIN users u ON u.id = t.user_id
      SET t.tenant_id = COALESCE(b.tenant_id, u.tenant_id)
      WHERE t.tenant_id IS NULL
        AND (b.tenant_id IS NOT NULL OR u.tenant_id IS NOT NULL)
    `);
    const affected = result?.affectedRows ?? result ?? 0;
    if (affected > 0) {
      console.log(`[FCM] Backfilled tenant_id on ${affected} staff_fcm_tokens row(s).`);
    }
  } catch (err) {
    console.warn('[FCM] tenant_id backfill skipped:', err.message);
  }
}

module.exports = { ensureFcmTokenTenantIds };
