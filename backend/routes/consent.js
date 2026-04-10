'use strict';
const { Router } = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken, branchAccess);

// ─── Forms CRUD ───────────────────────────────────────────────────────────────

// GET /api/consent/forms
router.get('/forms', async (req, res) => {
  try {
    const { ConsentForm } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = tenantId ? { tenant_id: tenantId } : {};
    if (req.query.active === 'true') where.is_active = true;
    const forms = await ConsentForm.findAll({ where, order: [['createdAt', 'DESC']] });
    return res.json(forms);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/consent/forms
router.post('/forms', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { ConsentForm } = require('../models');
    const { title, body_text, version, category, requires_signature } = req.body;
    if (!title?.trim() || !body_text?.trim()) return res.status(400).json({ message: 'title and body_text required.' });

    const form = await ConsentForm.create({
      tenant_id: resolveTenantId(req),
      title: title.trim(),
      body_text: body_text.trim(),
      version: version || '1.0',
      category: category || 'general',
      requires_signature: requires_signature !== false,
      created_by: req.user?.id,
    });
    return res.status(201).json(form);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/consent/forms/:id
router.put('/forms/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { ConsentForm } = require('../models');
    const form = await ConsentForm.findOne({ where: byIdWhere(req, req.params.id) });
    if (!form) return res.status(404).json({ message: 'Form not found.' });
    const allowed = ['title', 'body_text', 'version', 'category', 'requires_signature', 'is_active'];
    for (const f of allowed) { if (req.body[f] !== undefined) form[f] = req.body[f]; }
    await form.save();
    return res.json(form);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/consent/forms/:id
router.delete('/forms/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { ConsentForm } = require('../models');
    const form = await ConsentForm.findOne({ where: byIdWhere(req, req.params.id) });
    if (!form) return res.status(404).json({ message: 'Not found.' });
    form.is_active = false;
    await form.save();
    return res.json({ message: 'Deactivated.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── Signing ──────────────────────────────────────────────────────────────────

// POST /api/consent/sign
router.post('/sign', async (req, res) => {
  try {
    const { ConsentForm, CustomerConsent } = require('../models');
    const { form_id, customer_id, appointment_id, branch_id, signature_data } = req.body;
    if (!form_id || !customer_id) return res.status(400).json({ message: 'form_id and customer_id required.' });

    const form = await ConsentForm.findByPk(form_id);
    if (!form || !form.is_active) return res.status(404).json({ message: 'Form not found or inactive.' });

    const tenantId = resolveTenantId(req);
    const record = await CustomerConsent.create({
      tenant_id: tenantId,
      customer_id,
      form_id,
      appointment_id: appointment_id || null,
      branch_id: req.userBranchId || branch_id || null,
      signature_data: signature_data || null,
      signed_at: new Date(),
      ip_address: req.ip || null,
      form_snapshot: form.body_text,
    });
    return res.status(201).json(record);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── Records ──────────────────────────────────────────────────────────────────

// GET /api/consent/records
router.get('/records', async (req, res) => {
  try {
    const { CustomerConsent, ConsentForm, Customer } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = tenantId ? { tenant_id: tenantId } : {};
    if (req.userBranchId) where.branch_id = req.userBranchId;
    if (req.query.customer_id) where.customer_id = req.query.customer_id;
    if (req.query.form_id) where.form_id = req.query.form_id;

    const rows = await CustomerConsent.findAll({
      where,
      include: [
        { model: ConsentForm, as: 'form',     attributes: ['id', 'title', 'version', 'category'] },
        { model: Customer,    as: 'customer', attributes: ['id', 'name', 'phone'] },
      ],
      order: [['signed_at', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/consent/records/:id
router.get('/records/:id', async (req, res) => {
  try {
    const { CustomerConsent, ConsentForm, Customer } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = { id: req.params.id };
    if (tenantId) where.tenant_id = tenantId;

    const record = await CustomerConsent.findOne({
      where,
      include: [
        { model: ConsentForm, as: 'form' },
        { model: Customer,    as: 'customer', attributes: ['id', 'name', 'phone'] },
      ],
    });
    if (!record) return res.status(404).json({ message: 'Record not found.' });
    return res.json(record);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
