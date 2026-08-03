'use strict';

const express = require('express');
const router = express.Router();
const { requireServiceAuth } = require('../middleware/serviceAuth');
const { Tenant } = require('../models');
const { hasTenantFeature } = require('../utils/tenantFeatures');
const ctrl = require('../controllers/crmIntegrationController');

/**
 * Resolve tenant for CRM tool calls.
 * Requires service auth + X-Tenant-Id (or tenantId query/body).
 */
async function requireCrmTenant(req, res, next) {
  try {
    const raw = req.headers['x-tenant-id']
      || req.query.tenantId
      || req.body?.tenantId
      || req.body?.tenant_id;
    const tenantId = parseInt(raw, 10);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ message: 'X-Tenant-Id (or tenantId) is required' });
    }
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
      return res.status(402).json({ message: 'Tenant subscription inactive', code: 'SUBSCRIPTION_INACTIVE' });
    }
    if (!hasTenantFeature(tenant, 'whatsapp_ai_crm')) {
      return res.status(403).json({
        message: 'WhatsApp AI CRM not enabled for this tenant',
        code: 'FEATURE_GATED',
      });
    }
    req.crmTenantId = tenantId;
    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error('[crm-integration] tenant', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

router.use(requireServiceAuth);
router.use(requireCrmTenant);

router.get('/customers/by-phone', ctrl.customerByPhone);
router.get('/branches', ctrl.listBranches);
router.get('/services', ctrl.listServices);
router.get('/staff', ctrl.listStaff);
router.get('/availability', ctrl.getAvailability);
router.get('/packages', ctrl.listPackages);
router.get('/promotions', ctrl.listPromotions);
router.get('/appointments', ctrl.listAppointments);
router.post('/appointments', ctrl.createAppointment);
router.put('/appointments/:id', ctrl.rescheduleAppointment);
router.post('/appointments/:id/cancel', ctrl.cancelAppointment);
router.get('/knowledge/search', ctrl.searchKnowledge);

module.exports = router;
