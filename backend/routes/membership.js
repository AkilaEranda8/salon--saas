'use strict';
const { Router } = require('express');
const { Op } = require('sequelize');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { featureGate } = require('../middleware/featureGate');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken, branchAccess, featureGate('membership'));

// ─── Plans CRUD ───────────────────────────────────────────────────────────────

// GET /api/membership/plans
router.get('/plans', async (req, res) => {
  try {
    const { MembershipPlan } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = tenantId ? { tenant_id: tenantId } : {};
    if (req.query.active === 'true') where.is_active = true;

    const plans = await MembershipPlan.findAll({ where, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
    return res.json(plans);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/membership/plans
router.post('/plans', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { MembershipPlan } = require('../models');
    const { name, description, price, billing_cycle, discount_percent, free_services_count, bonus_loyalty_points, color, sort_order } = req.body;
    if (!name?.trim() || price === undefined) return res.status(400).json({ message: 'name and price are required.' });

    const plan = await MembershipPlan.create({
      tenant_id: resolveTenantId(req),
      name: name.trim(),
      description,
      price,
      billing_cycle: billing_cycle || 'monthly',
      discount_percent: discount_percent || 0,
      free_services_count: free_services_count || 0,
      bonus_loyalty_points: bonus_loyalty_points || 0,
      color: color || '#6366f1',
      sort_order: sort_order || 0,
    });
    return res.status(201).json(plan);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/membership/plans/:id
router.put('/plans/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { MembershipPlan } = require('../models');
    const plan = await MembershipPlan.findOne({ where: byIdWhere(req, req.params.id) });
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    const allowed = ['name', 'description', 'price', 'billing_cycle', 'discount_percent', 'free_services_count', 'bonus_loyalty_points', 'color', 'is_active', 'sort_order'];
    for (const f of allowed) { if (req.body[f] !== undefined) plan[f] = req.body[f]; }
    await plan.save();
    return res.json(plan);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/membership/plans/:id
router.delete('/plans/:id', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { MembershipPlan, CustomerMembership } = require('../models');
    const plan = await MembershipPlan.findOne({ where: byIdWhere(req, req.params.id) });
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    // Soft delete — just deactivate if enrollments exist
    const count = await CustomerMembership.count({ where: { plan_id: plan.id, status: 'active' } });
    if (count > 0) {
      plan.is_active = false;
      await plan.save();
      return res.json({ message: 'Plan deactivated (has active enrollments).' });
    }
    await plan.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── Customer Enrollments ─────────────────────────────────────────────────────

// GET /api/membership/enrollments
router.get('/enrollments', async (req, res) => {
  try {
    const { CustomerMembership, MembershipPlan, Customer } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = tenantId ? { tenant_id: tenantId } : {};
    if (req.userBranchId) where.branch_id = req.userBranchId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.plan_id) where.plan_id = req.query.plan_id;

    const rows = await CustomerMembership.findAll({
      where,
      include: [
        { model: MembershipPlan, as: 'plan', attributes: ['id', 'name', 'price', 'billing_cycle', 'color'] },
        { model: Customer,       as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/membership/enroll
router.post('/enroll', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { CustomerMembership, MembershipPlan, Customer, LoyaltyTransaction } = require('../models');
    const { customer_id, plan_id, start_date, amount_paid, payment_reference, notes, branch_id } = req.body;
    if (!customer_id || !plan_id || !start_date) return res.status(400).json({ message: 'customer_id, plan_id, start_date required.' });

    const tenantId = resolveTenantId(req);
    const plan = await MembershipPlan.findByPk(plan_id);
    if (!plan || !plan.is_active) return res.status(404).json({ message: 'Plan not found or inactive.' });

    const customer = await Customer.findByPk(customer_id);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });

    // Calculate end_date based on billing_cycle
    const start = new Date(start_date);
    let end = null;
    if (plan.billing_cycle === 'monthly')    { end = new Date(start); end.setMonth(end.getMonth() + 1); }
    if (plan.billing_cycle === 'quarterly')  { end = new Date(start); end.setMonth(end.getMonth() + 3); }
    if (plan.billing_cycle === 'yearly')     { end = new Date(start); end.setFullYear(end.getFullYear() + 1); }

    const enrollment = await CustomerMembership.create({
      tenant_id: tenantId,
      customer_id,
      plan_id,
      branch_id: req.userBranchId || branch_id || null,
      start_date,
      end_date: end ? end.toISOString().slice(0, 10) : null,
      status: 'active',
      free_credits_remaining: plan.free_services_count || 0,
      amount_paid: amount_paid || plan.price,
      payment_reference,
      notes,
      enrolled_by: req.user?.id,
    });

    // Award bonus loyalty points
    if (plan.bonus_loyalty_points > 0) {
      const newBalance = (customer.loyalty_points || 0) + plan.bonus_loyalty_points;
      await customer.update({ loyalty_points: newBalance });
      await LoyaltyTransaction.create({
        tenant_id: tenantId,
        customer_id,
        type: 'earn',
        points: plan.bonus_loyalty_points,
        balance_after: newBalance,
        description: `Membership bonus: ${plan.name}`,
      }).catch(() => {});
    }

    return res.status(201).json(enrollment);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/membership/enrollments/:id/status
router.patch('/enrollments/:id/status', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { CustomerMembership } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = { id: req.params.id };
    if (tenantId) where.tenant_id = tenantId;

    const enr = await CustomerMembership.findOne({ where });
    if (!enr) return res.status(404).json({ message: 'Enrollment not found.' });

    const valid = ['active', 'expired', 'cancelled', 'paused'];
    if (!valid.includes(req.body.status)) return res.status(400).json({ message: 'Invalid status.' });
    enr.status = req.body.status;
    await enr.save();
    return res.json(enr);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/membership/customer/:customerId — active membership for a customer
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { CustomerMembership, MembershipPlan } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = { customer_id: req.params.customerId, status: 'active' };
    if (tenantId) where.tenant_id = tenantId;

    const enr = await CustomerMembership.findOne({
      where,
      include: [{ model: MembershipPlan, as: 'plan' }],
      order: [['createdAt', 'DESC']],
    });
    return res.json(enr || null);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
