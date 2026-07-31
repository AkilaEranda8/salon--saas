'use strict';
const { Router } = require('express');
const { sequelize } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { featureGate } = require('../middleware/featureGate');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken, branchAccess, featureGate('loyalty'));

// ─── GET /api/loyalty/rules ───────────────────────────────────────────────────
router.get('/rules', async (req, res) => {
  try {
    const { LoyaltyRule } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = tenantId ? { tenant_id: tenantId } : {};
    const rule = await LoyaltyRule.findOne({ where, order: [['id', 'ASC']] });
    // Return default if not configured yet
    if (!rule) return res.json({ earn_per_amount: 100, earn_points: 1, redeem_points: 100, redeem_value: 50, min_points_redeem: 100, expiry_days: null, is_active: true });
    return res.json(rule);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── PUT /api/loyalty/rules ───────────────────────────────────────────────────
router.put('/rules', requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const { LoyaltyRule } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = tenantId ? { tenant_id: tenantId } : {};
    const { earn_per_amount, earn_points, redeem_points, redeem_value, min_points_redeem, expiry_days, is_active } = req.body;

    let rule = await LoyaltyRule.findOne({ where });
    if (!rule) {
      rule = await LoyaltyRule.create({ tenant_id: tenantId, earn_per_amount, earn_points, redeem_points, redeem_value, min_points_redeem, expiry_days, is_active });
    } else {
      await rule.update({ earn_per_amount, earn_points, redeem_points, redeem_value, min_points_redeem, expiry_days, is_active });
    }
    return res.json(rule);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/loyalty/earn — earn points on payment ─────────────────────────
// Called from payment flow: { customer_id, payment_id, amount_paid, branch_id }
router.post('/earn', async (req, res) => {
  try {
    const { LoyaltyRule, LoyaltyTransaction, Customer } = require('../models');
    const { customer_id, payment_id, amount_paid, branch_id } = req.body;
    if (!customer_id || !amount_paid) return res.status(400).json({ message: 'customer_id and amount_paid required.' });

    const tenantId = resolveTenantId(req);
    const ruleWhere = tenantId ? { tenant_id: tenantId } : {};
    const rule = await LoyaltyRule.findOne({ where: ruleWhere });
    if (!rule || !rule.is_active) return res.json({ points_earned: 0, message: 'Loyalty program not active.' });

    const pointsEarned = Math.floor(Number(amount_paid) / Number(rule.earn_per_amount)) * rule.earn_points;
    if (pointsEarned < 1) return res.json({ points_earned: 0 });

    const customer = await Customer.findByPk(customer_id);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });

    const newBalance = (customer.loyalty_points || 0) + pointsEarned;
    await customer.update({ loyalty_points: newBalance });

    const expiresAt = rule.expiry_days ? new Date(Date.now() + rule.expiry_days * 86400000) : null;
    const tx = await LoyaltyTransaction.create({
      tenant_id: tenantId,
      customer_id,
      branch_id: branch_id || null,
      payment_id: payment_id || null,
      type: 'earn',
      points: pointsEarned,
      balance_after: newBalance,
      description: `Earned on payment of Rs. ${Number(amount_paid).toLocaleString()}`,
      expires_at: expiresAt,
    });

    return res.json({ points_earned: pointsEarned, balance: newBalance, transaction: tx });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/loyalty/redeem — redeem points for discount ───────────────────
// { customer_id, points_to_redeem }
router.post('/redeem', async (req, res) => {
  try {
    const { LoyaltyRule, LoyaltyTransaction, Customer } = require('../models');
    const { customer_id, points_to_redeem, branch_id } = req.body;
    if (!customer_id || !points_to_redeem) return res.status(400).json({ message: 'customer_id and points_to_redeem required.' });

    const tenantId = resolveTenantId(req);
    const ruleWhere = tenantId ? { tenant_id: tenantId } : {};
    const rule = await LoyaltyRule.findOne({ where: ruleWhere });
    if (!rule || !rule.is_active) return res.status(400).json({ message: 'Loyalty program not active.' });

    const customer = await Customer.findByPk(customer_id);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });

    const currentPoints = customer.loyalty_points || 0;
    if (currentPoints < rule.min_points_redeem) return res.status(400).json({ message: `Need at least ${rule.min_points_redeem} points to redeem.` });
    if (points_to_redeem > currentPoints) return res.status(400).json({ message: 'Not enough points.' });

    // Points must be a multiple of redeem_points
    if (points_to_redeem % rule.redeem_points !== 0) {
      return res.status(400).json({ message: `Points must be in multiples of ${rule.redeem_points}.` });
    }

    const discount = (points_to_redeem / rule.redeem_points) * Number(rule.redeem_value);
    const newBalance = currentPoints - points_to_redeem;
    await customer.update({ loyalty_points: newBalance });

    await LoyaltyTransaction.create({
      tenant_id: tenantId,
      customer_id,
      branch_id: branch_id || null,
      type: 'redeem',
      points: -points_to_redeem,
      balance_after: newBalance,
      description: `Redeemed ${points_to_redeem} pts for Rs. ${discount} discount`,
    });

    return res.json({ discount_amount: discount, points_used: points_to_redeem, balance: newBalance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/loyalty/adjust — manual add/subtract points ───────────────────
// { customer_id, points, description?, branch_id? }
// points: positive = add, negative = subtract (or pass direction: 'add'|'subtract' + amount)
router.post('/adjust', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { LoyaltyTransaction, Customer } = require('../models');
    const { customer_id, branch_id, description } = req.body;
    if (!customer_id) return res.status(400).json({ message: 'customer_id is required.' });

    let delta = Number(req.body.points);
    if (!Number.isFinite(delta) || delta === 0) {
      const amount = Math.abs(Number(req.body.amount));
      const direction = String(req.body.direction || 'subtract').toLowerCase();
      if (!(amount > 0)) {
        return res.status(400).json({ message: 'points (non-zero) or amount is required.' });
      }
      delta = direction === 'add' ? amount : -amount;
    }
    delta = Math.trunc(delta);
    if (delta === 0) return res.status(400).json({ message: 'Adjustment cannot be zero.' });

    const tenantId = resolveTenantId(req);
    const customer = await Customer.findOne({
      where: byIdWhere(req, customer_id),
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });

    const currentPoints = Number(customer.loyalty_points) || 0;
    if (delta < 0 && currentPoints + delta < 0) {
      return res.status(400).json({
        message: `Not enough points. Balance is ${currentPoints}; cannot subtract ${Math.abs(delta)}.`,
      });
    }

    const newBalance = currentPoints + delta;
    const updates = { loyalty_points: newBalance };
    // Keep −50 reductions in a separate group (loyalty_mark)
    if (delta === -50) {
      updates.loyalty_mark = 'reduced_50';
    }
    await customer.update(updates);

    const absPts = Math.abs(delta);
    const defaultDesc = delta < 0
      ? `Loyalty points reduced by ${absPts}`
      : `Loyalty points increased by ${absPts}`;
    const note = String(description || '').trim() || defaultDesc;

    const tx = await LoyaltyTransaction.create({
      tenant_id: tenantId,
      customer_id: customer.id,
      branch_id: branch_id || req.userBranchId || customer.branch_id || null,
      type: 'adjust',
      points: delta,
      balance_after: newBalance,
      description: note.slice(0, 255),
    });

    return res.json({
      balance: newBalance,
      points_adjusted: delta,
      loyalty_mark: updates.loyalty_mark || customer.loyalty_mark || null,
      transaction: tx,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/loyalty/marked — customers in a special group (e.g. reduced_50) ─
router.get('/marked', async (req, res) => {
  try {
    const { Customer } = require('../models');
    const mark = String(req.query.mark || 'reduced_50').trim() || 'reduced_50';
    const where = { ...tenantWhere(req), loyalty_mark: mark };
    if (req.userBranchId) where.branch_id = req.userBranchId;

    const rows = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'loyalty_points', 'loyalty_mark', 'total_spent', 'visits'],
      order: [['updatedAt', 'DESC']],
      limit: 500,
    });
    return res.json({ mark, total: rows.length, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/loyalty/transactions/:customerId ─────────────────────────────
router.get('/transactions/:customerId', async (req, res) => {
  try {
    const { LoyaltyTransaction, Customer } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = { customer_id: req.params.customerId };
    if (tenantId) where.tenant_id = tenantId;

    const [customer, txns] = await Promise.all([
      Customer.findByPk(req.params.customerId, { attributes: ['id', 'name', 'loyalty_points'] }),
      LoyaltyTransaction.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 }),
    ]);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });
    return res.json({ customer, transactions: txns });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/loyalty/leaderboard — customers by points (filterable list) ─────
router.get('/leaderboard', async (req, res) => {
  try {
    const { Customer } = require('../models');
    const { Op } = require('sequelize');
    const tenantId = resolveTenantId(req);
    const where = { loyalty_points: { [Op.gt]: 0 } };
    if (tenantId) where.tenant_id = tenantId;
    if (req.userBranchId) where.branch_id = req.userBranchId;

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 500)
      : 200;

    const top = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'loyalty_points', 'loyalty_mark', 'total_spent', 'visits'],
      order: [['loyalty_points', 'DESC']],
      limit,
    });
    return res.json(top);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
