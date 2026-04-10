const { Op } = require('sequelize');
const { SupportTicket, SupportTicketReply, Tenant, User } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const STATUS_SET = new Set(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']);
const PRIORITY_SET = new Set(['low', 'medium', 'high', 'urgent']);
const CATEGORY_SET = new Set(['technical', 'billing', 'account', 'feature', 'other']);

const generateTicketNo = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `TKT-${ts}-${rnd}`;
};

const list = async (req, res) => {
  try {
    const where = { ...tenantWhere(req) };

    const isPlatform = req.user?.role === 'platform_admin';
    if (isPlatform && req.query.tenant_id) {
      where.tenant_id = parseInt(req.query.tenant_id, 10);
    }

    if (req.query.status && STATUS_SET.has(req.query.status)) {
      where.status = req.query.status;
    }

    if (req.query.priority && PRIORITY_SET.has(req.query.priority)) {
      where.priority = req.query.priority;
    }

    const q = String(req.query.q || '').trim();
    if (q) {
      where[Op.or] = [
        { subject: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

    const rows = await SupportTicket.findAll({
      where,
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'], required: false },
        {
          model: SupportTicketReply,
          as: 'replies',
          required: false,
          attributes: ['id', 'ticket_id', 'user_id', 'message', 'is_internal', 'createdAt'],
          include: [
            { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'], required: false },
            { model: User, as: 'author', attributes: ['id', 'name', 'username', 'role'], required: false },
          ],
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit,
    });

    return res.json(rows);
  } catch (err) {
    console.error('support.list error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const description = String(req.body?.message || req.body?.description || '').trim();
    const priority = String(req.body?.priority || 'medium').trim();
    const category = String(req.body?.category || 'other').trim();

    if (!subject) {
      return res.status(400).json({ message: 'Subject is required.' });
    }

    if (!PRIORITY_SET.has(priority)) {
      return res.status(400).json({ message: 'Invalid priority.' });
    }

    if (!CATEGORY_SET.has(category)) {
      return res.status(400).json({ message: 'Invalid category.' });
    }

    let tenantId = resolveTenantId(req);
    if (req.user?.role === 'platform_admin' && req.body?.tenant_id) {
      tenantId = parseInt(req.body.tenant_id, 10) || null;
    }

    if (!tenantId && req.user?.role !== 'platform_admin') {
      return res.status(400).json({ message: 'Tenant scope is required.' });
    }

    const row = await SupportTicket.create({
      ticket_no: generateTicketNo(),
      tenant_id: tenantId,
      branch_id: null,
      created_by_user_id: req.user?.id,
      assigned_to_user_id: null,
      subject,
      description,
      category,
      priority,
      status: 'open',
      source: req.user?.role === 'platform_admin' ? 'platform' : 'web',
      last_activity_at: new Date(),
      resolved_at: null,
    });

    const full = await SupportTicket.findByPk(row.id, {
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'], required: false }],
    });

    return res.status(201).json(full);
  } catch (err) {
    console.error('support.create error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const where = byIdWhere(req, req.params.id);
    const row = await SupportTicket.findOne({ where });
    if (!row) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    const updates = {};
    if (req.body.subject !== undefined) {
      const subject = String(req.body.subject || '').trim();
      if (!subject) return res.status(400).json({ message: 'Subject cannot be empty.' });
      updates.subject = subject;
    }

    if (req.body.message !== undefined || req.body.description !== undefined) {
      updates.description = String(req.body.message ?? req.body.description ?? '').trim();
    }

    if (req.body.priority !== undefined) {
      const priority = String(req.body.priority || '').trim();
      if (!PRIORITY_SET.has(priority)) return res.status(400).json({ message: 'Invalid priority.' });
      updates.priority = priority;
    }

    if (req.body.status !== undefined) {
      const status = String(req.body.status || '').trim();
      if (!STATUS_SET.has(status)) return res.status(400).json({ message: 'Invalid status.' });
      updates.status = status;
      updates.resolved_at = (status === 'resolved' || status === 'closed') ? new Date() : null;
    }

    updates.last_activity_at = new Date();
    await row.update(updates);

    const full = await SupportTicket.findByPk(row.id, {
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'], required: false }],
    });

    return res.json(full);
  } catch (err) {
    console.error('support.update error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    if (req.user?.role !== 'platform_admin') {
      return res.status(403).json({ message: 'Only platform admins can delete tickets.' });
    }

    const row = await SupportTicket.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    await row.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('support.remove error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createReply = async (req, res) => {
  try {
    const where = byIdWhere(req, req.params.id);
    const ticket = await SupportTicket.findOne({ where });
    if (!ticket) {
      return res.status(404).json({ message: 'Support ticket not found.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ message: 'Reply message is required.' });
    }

    const isPlatform = req.user?.role === 'platform_admin';
    const reply = await SupportTicketReply.create({
      ticket_id: ticket.id,
      tenant_id: ticket.tenant_id || resolveTenantId(req),
      user_id: req.user?.id,
      message,
      is_internal: isPlatform ? !!req.body?.is_internal : false,
    });

    const nextStatus = isPlatform ? 'waiting_customer' : 'open';
    await ticket.update({
      status: ticket.status === 'closed' ? 'closed' : nextStatus,
      last_activity_at: new Date(),
      resolved_at: null,
    });

    return res.status(201).json(reply);
  } catch (err) {
    console.error('support.createReply error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
  createReply,
};
