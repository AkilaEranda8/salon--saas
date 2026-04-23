const { Op } = require('sequelize');
const { BankSlip, Tenant, PlatformInvoice, Subscription } = require('../models');
const { getTenantCaps } = require('../utils/planConfig');
const path = require('path');
const fs = require('fs').promises;

// ── POST /api/billing/bank-slip/upload ────────────────────────────
// Tenant user uploads bank slip as payment proof
const uploadBankSlip = async (req, res) => {
  try {
    let tenant = req.tenant;
    if (!tenant && req.user?.tenantId) {
      // Fallback to tenant id from JWT when tenant-scope header is unavailable.
      tenant = { id: req.user.tenantId };
    }
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const { amount, bank_name, transaction_date, notes } = req.body;

    if (!amount || !transaction_date) {
      return res.status(400).json({ message: 'Amount and transaction_date are required.' });
    }

    // Save file to uploads folder
    const uploadsDir = path.join(__dirname, '../uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const fileName = `bankslip_${tenant.id}_${Date.now()}${path.extname(req.file.originalname)}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, req.file.buffer);

    // Store relative URL for API access
    const fileUrl = `/uploads/${fileName}`;

    const bankSlip = await BankSlip.create({
      tenant_id: tenant.id,
      file_url: fileUrl,
      file_name: req.file.originalname,
      amount: parseFloat(amount),
      bank_name: bank_name || null,
      transaction_date: new Date(transaction_date),
      notes: notes || null,
      status: 'pending',
    });

    const txDate = new Date(transaction_date);
    const periodStart = new Date(txDate.getFullYear(), txDate.getMonth(), 1);
    const periodEnd = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 0);
    const invoiceNumber = `BSL-${tenant.id}-${Date.now()}`;
    const invoiceNotes = `[bank-slip:${bankSlip.id}] Bank slip uploaded (${bankSlip.file_name}). ${notes || ''}`.trim();

    const invoice = await PlatformInvoice.create({
      tenant_id: tenant.id,
      invoice_number: invoiceNumber,
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      amount: parseFloat(amount),
      currency: 'LKR',
      status: 'issued',
      issued_at: new Date(),
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      plan: req.body?.plan || null,
      base_price: parseFloat(amount),
      additional_charges: 0,
      discount: 0,
      notes: invoiceNotes,
      // Reuse pdf_url field to expose uploaded payment proof for admin review in invoice screen.
      pdf_url: fileUrl,
    });

    return res.status(201).json({
      message: 'Bank slip uploaded successfully. Invoice created and pending admin approval.',
      bankSlip,
      invoice,
    });
  } catch (err) {
    console.error('bankSlip.uploadBankSlip error:', err);
    return res.status(500).json({ message: err.message || 'Failed to upload bank slip.' });
  }
};

// ── GET /api/billing/bank-slip/list ──────────────────────────────
// Platform admin lists all bank slips (with filters)
const listBankSlips = async (req, res) => {
  try {
    const { status = 'pending', tenant_id } = req.query;

    const where = {};
    if (status) where.status = status;
    if (tenant_id) where.tenant_id = parseInt(tenant_id);

    const bankSlips = await BankSlip.findAll({
      where,
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'email'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      total: bankSlips.length,
      bankSlips,
    });
  } catch (err) {
    console.error('bankSlip.listBankSlips error:', err);
    return res.status(500).json({ message: err.message || 'Failed to list bank slips.' });
  }
};

// ── PATCH /api/billing/bank-slip/:id/approve ────────────────────
// Platform admin approves a bank slip
const approveBankSlip = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;

    const bankSlip = await BankSlip.findByPk(id);
    if (!bankSlip) return res.status(404).json({ message: 'Bank slip not found.' });
    if (bankSlip.status !== 'pending') {
      return res.status(400).json({ message: `Cannot approve bank slip with status: ${bankSlip.status}` });
    }

    // Update bank slip status
    await bankSlip.update({
      status: 'approved',
      approved_by: adminId,
      approval_date: new Date(),
    });

    // Update tenant plan to the plan stored on the linked invoice
    const tenant = await Tenant.findByPk(bankSlip.tenant_id);
    if (tenant) {
      const invoice = await PlatformInvoice.findOne({
        where: {
          tenant_id: bankSlip.tenant_id,
          notes: { [Op.like]: `%[bank-slip:${bankSlip.id}]%` },
        },
      });
      const newPlan = invoice?.plan || 'basic';
      const caps = getTenantCaps(newPlan);
      await tenant.update({
        plan: newPlan,
        status: 'active',
        max_branches: caps.max_branches,
        max_staff: caps.max_staff,
        trial_ends_at: null,
      });

      // Auto-create Subscription record for bank-slip payment
      if (newPlan !== 'trial') {
        const now = new Date();
        await Subscription.create({
          tenant_id:              bankSlip.tenant_id,
          stripe_subscription_id: `BANK-${bankSlip.tenant_id}-${bankSlip.id}`,
          stripe_price_id:        `BANK-PRICE-${newPlan}`,
          plan:                   newPlan,
          status:                 'active',
          current_period_start:   now,
          current_period_end:     new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          cancel_at_period_end:   false,
        });
      }
    }

    await PlatformInvoice.update(
      { status: 'paid', paid_at: new Date() },
      {
        where: {
          tenant_id: bankSlip.tenant_id,
          status: { [Op.in]: ['draft', 'issued', 'overdue'] },
          notes: { [Op.like]: `%[bank-slip:${bankSlip.id}]%` },
        },
      }
    );

    return res.json({
      message: 'Bank slip approved. Subscription enabled.',
      bankSlip,
      tenant: { id: tenant.id, plan: tenant.plan },
    });
  } catch (err) {
    console.error('bankSlip.approveBankSlip error:', err);
    return res.status(500).json({ message: err.message || 'Failed to approve bank slip.' });
  }
};

// ── PATCH /api/billing/bank-slip/:id/reject ─────────────────────
// Platform admin rejects a bank slip
const rejectBankSlip = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const bankSlip = await BankSlip.findByPk(id);
    if (!bankSlip) return res.status(404).json({ message: 'Bank slip not found.' });
    if (bankSlip.status !== 'pending') {
      return res.status(400).json({ message: `Cannot reject bank slip with status: ${bankSlip.status}` });
    }

    // Update bank slip status
    await bankSlip.update({
      status: 'rejected',
      rejection_reason: rejection_reason || 'No reason provided.',
    });

    return res.json({
      message: 'Bank slip rejected.',
      bankSlip,
    });
  } catch (err) {
    console.error('bankSlip.rejectBankSlip error:', err);
    return res.status(500).json({ message: err.message || 'Failed to reject bank slip.' });
  }
};

// ── GET /api/billing/bank-slip/status ────────────────────────────
// Tenant user checks their bank slip status
const getBankSlipStatus = async (req, res) => {
  try {
    let tenant = req.tenant;
    if (!tenant && req.user?.tenantId) {
      // Fallback to tenant id from JWT when tenant-scope header is unavailable.
      tenant = { id: req.user.tenantId };
    }
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });

    const bankSlips = await BankSlip.findAll({
      where: { tenant_id: tenant.id },
      order: [['createdAt', 'DESC']],
    });

    const latestSlip = bankSlips[0] || null;

    return res.json({
      total: bankSlips.length,
      latestSlip,
      bankSlips,
    });
  } catch (err) {
    console.error('bankSlip.getBankSlipStatus error:', err);
    return res.status(500).json({ message: err.message || 'Failed to get bank slip status.' });
  }
};

module.exports = {
  uploadBankSlip,
  listBankSlips,
  approveBankSlip,
  rejectBankSlip,
  getBankSlipStatus,
};
