'use strict';

const {
  getWabaByTenant,
  toPublic,
  upsertWabaSettings,
  testCloudConnection,
  sendCloudText,
} = require('../services/whatsappCloudService');
const { resolveTenantId } = require('../utils/tenantScope');

const getWabaSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required.' });
    const row = await getWabaByTenant(tenantId);
    return res.json(toPublic(row));
  } catch (err) {
    console.error('[waba] get', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateWabaSettings = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required.' });
    const row = await upsertWabaSettings(tenantId, req.body || {}, req.user?.id);
    return res.json(toPublic(row));
  } catch (err) {
    console.error('[waba] put', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const testWaba = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant required.' });
    const result = await testCloudConnection(tenantId);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/** Optional: send a test text to a phone (must be in 24h window or will fail). */
const sendTestMessage = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const to = req.body?.to;
    const message = req.body?.message || 'HEXAONE AI CRM test message';
    if (!to) return res.status(400).json({ message: 'to (phone) is required' });
    const result = await sendCloudText({ tenantId, to, body: message });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err.message, code: err.code });
  }
};

module.exports = {
  getWabaSettings,
  updateWabaSettings,
  testWaba,
  sendTestMessage,
};
