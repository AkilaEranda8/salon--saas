'use strict';

const { StaffFcmToken } = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');

/**
 * POST /api/fcm-token
 * Body: { fcm_token, device_info? }
 * Registers or updates the FCM token for the authenticated user.
 */
const registerToken = async (req, res) => {
  try {
    const { fcm_token, device_info } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ message: 'fcm_token is required.' });
    }

    const userId   = req.user?.id;
    const branchId = req.userBranchId || req.user?.branchId || null;
    const tenantId = resolveTenantId(req);

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    await StaffFcmToken.upsert({
      user_id:     userId,
      fcm_token,
      branch_id:   branchId,
      tenant_id:   tenantId,
      device_info: device_info || null,
    });

    return res.json({ message: 'FCM token registered.' });
  } catch (err) {
    console.error('[FCM Token] Register error:', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * DELETE /api/fcm-token
 * Removes the FCM token for the authenticated user (on logout).
 */
const removeToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    await StaffFcmToken.destroy({ where: { user_id: userId } });
    return res.json({ message: 'FCM token removed.' });
  } catch (err) {
    console.error('[FCM Token] Remove error:', err.message);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { registerToken, removeToken };
