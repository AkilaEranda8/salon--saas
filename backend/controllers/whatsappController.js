'use strict';

const { Tenant } = require('../models');
const { requireWhatsAppTenant } = require('../utils/whatsappTenantAccess');
const whatsappWeb = require('../services/whatsappWebService');

function accessDenied(res, result) {
  return res.status(result.status).json({ message: result.message });
}

async function getWhatsAppStatus(req, res) {
  try {
    const access = requireWhatsAppTenant(req);
    if (!access.ok) return accessDenied(res, access);

    const status = await whatsappWeb.getStatus(access.tenantId);
    return res.json({ tenant_id: access.tenantId, ...status });
  } catch (err) {
    console.error('getWhatsAppStatus:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

async function connectWhatsApp(req, res) {
  try {
    const access = requireWhatsAppTenant(req);
    if (!access.ok) return accessDenied(res, access);

    const rt = await whatsappWeb.startSession(access.tenantId, {
      userId: req.user?.id,
      username: req.user?.username || req.user?.email,
    });
    const status = await whatsappWeb.getStatus(access.tenantId);
    return res.json({
      tenant_id: access.tenantId,
      message: status.status === 'connected'
        ? 'WhatsApp connected.'
        : 'Scan the QR code with WhatsApp on your phone.',
      ...status,
      qrImage: rt.qrImage || status.qrImage || null,
    });
  } catch (err) {
    console.error('connectWhatsApp:', err);
    return res.status(500).json({ message: err.message || 'Failed to start WhatsApp session.' });
  }
}

async function disconnectWhatsApp(req, res) {
  try {
    const access = requireWhatsAppTenant(req);
    if (!access.ok) return accessDenied(res, access);

    await whatsappWeb.stopSession(access.tenantId, true, {
      userId: req.user?.id,
      username: req.user?.username || req.user?.email,
    });
    return res.json({
      tenant_id: access.tenantId,
      message: 'WhatsApp disconnected.',
      status: 'disconnected',
    });
  } catch (err) {
    console.error('disconnectWhatsApp:', err);
    return res.status(500).json({ message: err.message || 'Failed to disconnect.' });
  }
}

async function listWhatsAppMessages(req, res) {
  try {
    const access = requireWhatsAppTenant(req);
    if (!access.ok) return accessDenied(res, access);

    const result = await whatsappWeb.listMessages(access.tenantId, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ tenant_id: access.tenantId, ...result });
  } catch (err) {
    console.error('listWhatsAppMessages:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

/** Platform admin: read-only status for a tenant (no messages). */
async function getPlatformTenantWhatsApp(req, res) {
  try {
    const tenantId = Number(req.params.id);
    if (!Number.isInteger(tenantId) || tenantId < 1) {
      return res.status(400).json({ message: 'Invalid tenant id.' });
    }

    const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'name', 'slug'] });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const status = await whatsappWeb.getStatus(tenantId);
    return res.json({
      tenant_id: tenantId,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      status: status.status,
      phone: status.phone,
      push_name: status.push_name,
      connected_at: status.connected_at,
      last_error: status.last_error,
      provider: status.provider,
    });
  } catch (err) {
    console.error('getPlatformTenantWhatsApp:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
}

module.exports = {
  getWhatsAppStatus,
  connectWhatsApp,
  disconnectWhatsApp,
  listWhatsAppMessages,
  getPlatformTenantWhatsApp,
};
