'use strict';
const { Router } = require('express');
const { Op } = require('sequelize');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { tenantWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken, branchAccess);

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId) where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = parseInt(req.query.branchId, 10);
  return where;
};

// ─── GET /api/marketing/birthday-customers ────────────────────────────────────
// Customers whose birthday is within next N days
router.get('/birthday-customers', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { Customer } = require('../models');
    const { sequelize } = require('../config/database');
    const days = Math.min(parseInt(req.query.days || '7', 10), 90);
    const where = getBranchWhere(req);
    where.dob = { [Op.not]: null };

    // Find customers whose birthday (month-day) falls within next `days`
    const customers = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'email', 'dob', 'loyalty_points', 'total_spent', 'visits'],
    });

    const today = new Date();
    const upcoming = customers.filter((c) => {
      if (!c.dob) return false;
      const bday = new Date(c.dob);
      const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
      const target   = thisYear >= today ? thisYear : nextYear;
      const diff     = Math.ceil((target - today) / 86400000);
      c.dataValues.days_until_birthday = diff;
      return diff >= 0 && diff <= days;
    });

    upcoming.sort((a, b) => (a.dataValues.days_until_birthday || 0) - (b.dataValues.days_until_birthday || 0));
    return res.json(upcoming);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/marketing/inactive-customers ────────────────────────────────────
// Customers who haven't visited in X days
router.get('/inactive-customers', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { Customer } = require('../models');
    const days = Math.min(parseInt(req.query.days || '60', 10), 365);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const where  = getBranchWhere(req);
    where.last_visit = { [Op.or]: [{ [Op.lt]: cutoff }, null] };

    const customers = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'email', 'last_visit', 'total_spent', 'visits'],
      order: [['total_spent', 'DESC']],
      limit: 200,
    });
    return res.json(customers);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/marketing/send-birthday ───────────────────────────────────────
// Send birthday SMS/notification to given customer IDs
router.post('/send-birthday', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { sendSMS } = require('../services/notificationService');
    const { Customer, NotificationLog, Branch } = require('../models');
    const { customer_ids, message_template } = req.body;
    if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ message: 'customer_ids array required.' });
    }

    const tenantId = resolveTenantId(req);
    const where    = { id: { [Op.in]: customer_ids.map(Number) } };
    if (tenantId) where.tenant_id = tenantId;

    const customers = await Customer.findAll({ where });
    const results   = { sent: 0, failed: 0, skipped: 0 };

    for (const c of customers) {
      if (!c.phone) { results.skipped++; continue; }
      const body_text = (message_template || `Happy Birthday {name}! 🎂 As a special gift, enjoy 10% off your next visit at our salon. Book now!`)
        .replace('{name}', c.name);
      try {
        await sendSMS(c.phone, body_text);
        results.sent++;
        // Log notification
        await NotificationLog.create({
          tenant_id: tenantId,
          branch_id: req.userBranchId || c.branch_id,
          type: 'sms',
          recipient: c.phone,
          message: body_text,
          status: 'sent',
        }).catch(() => {});
      } catch {
        results.failed++;
      }
    }

    return res.json({ ...results, total: customers.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/marketing/send-winback ────────────────────────────────────────
// Win-back SMS to inactive customers
router.post('/send-winback', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { sendSMS } = require('../services/notificationService');
    const { Customer, NotificationLog } = require('../models');
    const { customer_ids, message_template } = req.body;
    if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ message: 'customer_ids array required.' });
    }

    const tenantId = resolveTenantId(req);
    const where    = { id: { [Op.in]: customer_ids.map(Number) } };
    if (tenantId) where.tenant_id = tenantId;

    const customers = await Customer.findAll({ where });
    const results   = { sent: 0, failed: 0, skipped: 0 };

    for (const c of customers) {
      if (!c.phone) { results.skipped++; continue; }
      const body_text = (message_template || `Hi {name}, we miss you! It's been a while since your last visit. Book now and enjoy a special returning-customer discount!`)
        .replace('{name}', c.name);
      try {
        await sendSMS(c.phone, body_text);
        results.sent++;
        await NotificationLog.create({
          tenant_id: tenantId,
          branch_id: req.userBranchId || c.branch_id,
          type: 'sms',
          recipient: c.phone,
          message: body_text,
          status: 'sent',
        }).catch(() => {});
      } catch {
        results.failed++;
      }
    }

    return res.json({ ...results, total: customers.length });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/marketing/rebook-suggestions ────────────────────────────────────
// Appointment completed 3–8 weeks ago with no follow-up
router.get('/rebook-suggestions', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { Appointment, Customer, Service } = require('../models');
    const weeks = Math.min(parseInt(req.query.weeks || '6', 10), 24);
    const from  = new Date(Date.now() - weeks * 7 * 86400000).toISOString().slice(0, 10);
    const to    = new Date(Date.now() - 3 * 7 * 86400000).toISOString().slice(0, 10);
    const where = getBranchWhere(req);
    where.status = 'completed';
    where.date   = { [Op.between]: [from, to] };

    const appts = await Appointment.findAll({
      where,
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        { model: Service,  as: 'service',  attributes: ['id', 'name', 'duration_minutes', 'price'] },
      ],
      order: [['date', 'ASC']],
      limit: 200,
    });

    return res.json(appts);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
