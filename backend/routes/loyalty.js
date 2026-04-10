'use strict';
const { Router } = require('express');
const { sequelize } = require('../config/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken, branchAccess);

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

// ─── GET /api/loyalty/leaderboard — top 20 customers by points ───────────────
router.get('/leaderboard', async (req, res) => {
  try {
    const { Customer } = require('../models');
    const { Op } = require('sequelize');
    const tenantId = resolveTenantId(req);
    const where = { loyalty_points: { [Op.gt]: 0 } };
    if (tenantId) where.tenant_id = tenantId;
    if (req.userBranchId) where.branch_id = req.userBranchId;

    const top = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'loyalty_points', 'total_spent', 'visits'],
      order: [['loyalty_points', 'DESC']],
      limit: 20,
    });
    return res.json(top);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
