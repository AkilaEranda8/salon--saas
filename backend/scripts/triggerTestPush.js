'use strict';
/**
 * CLI: send test FCM push to all registered staff devices (or one branch).
 * Usage: node scripts/triggerTestPush.js [branchId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/database');
const { StaffFcmToken } = require('../models');
const { isPushConfigured, sendTestPush } = require('../services/fcmService');

(async () => {
  const branchId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  try {
    await sequelize.authenticate();
    if (!isPushConfigured()) {
      console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_JSON not set or invalid.');
      process.exit(1);
    }
    const where = {};
    if (branchId) where.branch_id = branchId;
    const rows = await StaffFcmToken.findAll({ where, attributes: ['fcm_token'] });
    const tokens = [...new Set(rows.map((r) => r.fcm_token).filter(Boolean))];
    if (!tokens.length) {
      console.error('ERROR: No FCM tokens found.', branchId ? `branchId=${branchId}` : '');
      process.exit(1);
    }
    const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo' });
    const result = await sendTestPush(
      tokens,
      'Hexaone — Test Notification',
      `[TEST] Push reminder test at ${when}.`,
      { type: 'test' }
    );
    console.log(JSON.stringify({ branchId, tokenCount: tokens.length, ...result }, null, 2));
    process.exit(result.sent > 0 ? 0 : 1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
