'use strict';

let _admin = null;

function getAdmin() {
  if (_admin) return _admin;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled.');
    return null;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    _admin = admin;
    return _admin;
  } catch (err) {
    console.error('[FCM] Failed to initialise Firebase Admin:', err.message);
    return null;
  }
}

/**
 * Send a push notification to a single FCM token.
 * @param {string} token  - FCM device token
 * @param {string} title  - Notification title
 * @param {string} body   - Notification body
 * @param {object} data   - Optional key-value data payload (string values only)
 */
function isPushConfigured() {
  return Boolean(getAdmin());
}

async function sendToToken(token, title, body, data = {}) {
  const admin = getAdmin();
  if (!admin) return;

  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v);
  }

  try {
    const message = {
      token,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'appointment_reminders',
          sound: 'default',
          icon: 'ic_notification',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
    await admin.messaging().send(message);
    console.log(`[FCM] Notification sent to token: ${token.slice(0, 20)}...`);
  } catch (err) {
    console.error('[FCM] Send failed:', err.message);
    if (
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/registration-token-not-registered'
    ) {
      await removeStaleToken(token);
    }
  }
}

/**
 * Send a push notification to multiple FCM tokens.
 * @param {string[]} tokens
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
async function sendToTokens(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;
  await Promise.all(tokens.map((t) => sendToToken(t, title, body, data)));
}

async function removeStaleToken(token) {
  try {
    let _models = require('../models');
    await _models.StaffFcmToken.destroy({ where: { fcm_token: token } });
    console.log('[FCM] Stale token removed.');
  } catch (err) {
    console.error('[FCM] Failed to remove stale token:', err.message);
  }
}

/**
 * Send a push notification to a specific staff member via their linked user account.
 * Requires the Staff record to have a user_id set (Staff <-> User relationship).
 * @param {number|string} staffId  - staff.id (Staff table)
 * @param {string} title
 * @param {string} body
 * @param {object} data
 * @param {number|string|null} tenantId - optional tenant scope
 */
async function notifyStaffUser(staffId, title, body, data = {}, tenantId = null) {
  if (!staffId) return;
  try {
    const { Op } = require('sequelize');
    const { Staff, StaffFcmToken } = require('../models');
    const staff = await Staff.findByPk(staffId, { attributes: ['id', 'user_id', 'tenant_id'] });
    if (!staff || !staff.user_id) return;
    const tid = tenantId ?? staff.tenant_id ?? null;
    const where = { user_id: staff.user_id };
    if (tid != null) {
      where[Op.or] = [{ tenant_id: tid }, { tenant_id: null }];
    }
    const tokenRow = await StaffFcmToken.findOne({
      where,
      attributes: ['fcm_token'],
    });
    if (!tokenRow?.fcm_token) return;
    await sendToToken(tokenRow.fcm_token, title, body, data);
  } catch (err) {
    console.error('[FCM] notifyStaffUser error:', err.message);
  }
}

/**
 * Send a push notification to all staff devices registered for a branch (tenant-scoped).
 * @param {number|string} branchId
 * @param {string} title
 * @param {string} body
 * @param {object} data  - optional string key-value payload
 * @param {number|string|null} tenantId - optional; resolved from Branch when omitted
 */
async function notifyBranch(branchId, title, body, data = {}, tenantId = null) {
  if (!branchId) return;
  try {
    const { Op } = require('sequelize');
    const { StaffFcmToken, Branch } = require('../models');
    let tid = tenantId;
    if (tid == null) {
      const branch = await Branch.findByPk(branchId, { attributes: ['id', 'tenant_id'] });
      tid = branch?.tenant_id ?? null;
    }
    // branch_id is globally unique → null tenant_id legacy rows for this branch are safe
    const where = { branch_id: branchId };
    if (tid != null) {
      where[Op.or] = [{ tenant_id: tid }, { tenant_id: null }];
    }
    const rows = await StaffFcmToken.findAll({
      where,
      attributes: ['fcm_token'],
    });
    const tokens = rows.map((r) => r.fcm_token).filter(Boolean);
    if (tokens.length === 0) return;
    await sendToTokens(tokens, title, body, {
      ...data,
      ...(tid != null ? { tenant_id: String(tid) } : {}),
    });
  } catch (err) {
    console.error('[FCM] notifyBranch error:', err.message);
  }
}

/**
 * Send a test push and return per-token results (for admin test endpoint).
 */
async function sendTestPush(tokens, title, body, data = {}) {
  const admin = getAdmin();
  if (!admin) {
    return { configured: false, sent: 0, failed: 0, results: [] };
  }
  if (!tokens?.length) {
    return { configured: true, sent: 0, failed: 0, results: [] };
  }

  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v);
  }

  const results = await Promise.all(tokens.map(async (token) => {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data: stringData,
        android: {
          priority: 'high',
          notification: { channelId: 'appointment_reminders', sound: 'default', icon: 'ic_notification' },
        },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
      console.log(`[FCM] Test sent to token: ${token.slice(0, 20)}...`);
      return { ok: true };
    } catch (err) {
      console.error('[FCM] Test send failed:', err.message);
      if (
        err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered'
      ) {
        await removeStaleToken(token);
      }
      return { ok: false, error: err.message };
    }
  }));

  const sent = results.filter((r) => r.ok).length;
  return { configured: true, sent, failed: results.length - sent, results };
}

module.exports = {
  sendToToken,
  sendToTokens,
  notifyBranch,
  notifyStaffUser,
  isPushConfigured,
  sendTestPush,
};
