const { Op, fn, col, where: sqlWhere } = require('sequelize');
const { Customer, Branch, Appointment, Service, Staff, InvConsumption, InvProduct } = require('../models');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const {
  ensureWalkInCustomerForTenant,
  sortWalkInFirst,
  WALK_IN_CUSTOMER_NAME,
} = require('../services/ensureWalkInCustomer');
const {
  verifyCheckInQr,
  buildPhoneVariants,
  issueCheckInQr,
  STAFF_DEFAULT_TTL_SEC,
  STAFF_MAX_TTL_SEC,
} = require('../services/customerQrService');

const todayYmd = () => new Date().toISOString().slice(0, 10);

async function loadQrCustomerContext(req, payload) {
  const tenantId = resolveTenantId(req);
  if (tenantId && Number(payload.tenantId) !== Number(tenantId)) {
    const err = new Error('QR belongs to a different salon.');
    err.status = 403;
    throw err;
  }

  const variants = buildPhoneVariants(payload.phone);
  const phoneWhere = { phone: { [Op.or]: variants } };
  const scope = { ...tenantWhere(req), ...phoneWhere };

  let customer = null;
  if (payload.customerId) {
    customer = await Customer.findOne({
      where: { ...tenantWhere(req), id: payload.customerId },
      attributes: ['id', 'name', 'phone', 'email', 'loyalty_points', 'branch_id'],
    });
  }
  if (!customer) {
    customer = await Customer.findOne({
      where: scope,
      attributes: ['id', 'name', 'phone', 'email', 'loyalty_points', 'branch_id'],
      order: [['updatedAt', 'DESC']],
    });
  }

  const appointments = await Appointment.findAll({
    where: {
      ...scope,
      date: todayYmd(),
      status: { [Op.in]: ['pending', 'confirmed', 'in_service'] },
    },
    include: [
      { model: Service, as: 'service', attributes: ['id', 'name', 'duration_minutes', 'price'] },
      { model: Branch, as: 'branch', attributes: ['id', 'name'] },
    ],
    order: [['time', 'ASC']],
  });

  return {
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          loyalty_points: customer.loyalty_points || 0,
          branch_id: customer.branch_id,
        }
      : {
          id: null,
          name: payload.name || 'Customer',
          phone: payload.phone,
          email: null,
          loyalty_points: 0,
          branch_id: null,
        },
    appointments,
    phone: payload.phone,
    tenant_id: payload.tenantId,
  };
}

/**
 * Branch filter for customers:
 * - Explicit ?branchId= filters that branch + shared (null branch) customers.
 * - Without ?branchId=, return all customers for the tenant (booking / inventory pickers).
 * - JWT branch is NOT applied on list — managers need full salon customer pickers.
 */
const getCustomerListWhere = (req) => {
  const where = tenantWhere(req);
  const and = [];

  const branchId = req.query.branchId || null;
  if (branchId) {
    and.push({
      [Op.or]: [
        { branch_id: branchId },
        { branch_id: null },
      ],
    });
  }

  const q = String(req.query.search || req.query.q || '').trim();
  if (q) {
    const or = [
      { name:  { [Op.like]: `%${q}%` } },
      { phone: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
    ];

    // Digit-normalized phone search (spaces/dashes and 0 / 94 prefixes).
    // e.g. query 0712438116 matches stored 94712438116.
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      const phoneNorm = fn(
        'REPLACE',
        fn('REPLACE', fn('REPLACE', col('Customer.phone'), ' ', ''), '-', ''),
        '+',
        ''
      );
      let core = digits;
      if (core.startsWith('94') && core.length >= 11) core = core.slice(2);
      else if (core.startsWith('0') && core.length >= 9) core = core.slice(1);

      const variants = new Set([digits, core]);
      if (core) {
        variants.add(`0${core}`);
        variants.add(`94${core}`);
        if (core.length >= 9) variants.add(core.slice(-9));
      }
      if (digits.startsWith('0') && digits.length > 1) variants.add(digits.slice(1));
      if (digits.startsWith('94') && digits.length > 2) variants.add(digits.slice(2));
      if (digits.length >= 9) variants.add(digits.slice(-9));

      for (const v of variants) {
        if (v.length >= 3) {
          or.push(sqlWhere(phoneNorm, { [Op.like]: `%${v}%` }));
        }
      }
    }

    and.push({ [Op.or]: or });
  }

  if (and.length === 1) Object.assign(where, and[0]);
  else if (and.length > 1) where[Op.and] = and;

  return where;
};

const list = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (tenantId) {
      await ensureWalkInCustomerForTenant(tenantId);
    }

    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 2000);
    const offset = (page - 1) * limit;

    const where = getCustomerListWhere(req);

    const { count, rows } = await Customer.findAndCountAll({
      where,
      limit,
      offset,
      distinct: true,
      col: 'id',
      order: [
        // Walk-in Customer always first within the page
        [Customer.sequelize.literal(
          `CASE WHEN \`Customer\`.\`name\` = ${Customer.sequelize.escape(WALK_IN_CUSTOMER_NAME)} THEN 0 ELSE 1 END`
        ), 'ASC'],
        ['name', 'ASC'],
      ],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return res.json({ total: count, page, limit, data: sortWalkInFirst(rows) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const cust = await Customer.findOne({
      where: byIdWhere(req, req.params.id),
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        {
          model: Appointment,
          as: 'appointments',
          limit: 15,
          separate: true,
          order: [['date', 'DESC'], ['time', 'DESC']],
          include: [
            { model: Service, as: 'service', attributes: ['id', 'name'] },
            { model: Staff, as: 'staff', attributes: ['id', 'name'], required: false },
            { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false },
          ],
        },
      ],
    });

    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

    // Previously used products (inventory consumptions linked to this customer).
    let usedProductRows = [];
    try {
      usedProductRows = await InvConsumption.findAll({
        where: {
          ...tenantWhere(req),
          customer_id: cust.id,
          status: { [Op.ne]: 'cancelled' },
        },
        include: [
          {
            model: InvProduct,
            as: 'product',
            attributes: ['id', 'name', 'sku', 'product_type', 'unit'],
            required: false,
          },
          {
            model: Service,
            as: 'service',
            attributes: ['id', 'name'],
            required: false,
          },
          {
            model: Staff,
            as: 'staff',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
        order: [['consumption_date', 'DESC'], ['id', 'DESC']],
        limit: 80,
      });
    } catch (invErr) {
      console.warn('[customers][getOne] used products:', invErr.message);
    }

    const used_products = usedProductRows.map((row) => {
      const j = row.toJSON();
      return {
        id: j.id,
        consumption_date: j.consumption_date,
        quantity_used: Number(j.quantity_used || 0),
        unit: j.unit || j.product?.unit || 'pcs',
        reason: j.reason || null,
        status: j.status,
        product: j.product
          ? {
              id: j.product.id,
              name: j.product.name,
              sku: j.product.sku,
              product_type: j.product.product_type,
            }
          : null,
        service: j.service ? { id: j.service.id, name: j.service.name } : null,
        staff: j.staff ? { id: j.staff.id, name: j.staff.name } : null,
      };
    });

    // Aggregate unique products (most recent first).
    const summaryMap = new Map();
    for (const row of used_products) {
      const pid = row.product?.id;
      if (!pid) continue;
      const prev = summaryMap.get(pid);
      if (!prev) {
        summaryMap.set(pid, {
          product_id: pid,
          name: row.product.name,
          sku: row.product.sku,
          product_type: row.product.product_type,
          unit: row.unit,
          times_used: 1,
          total_qty: row.quantity_used,
          last_used: row.consumption_date,
        });
      } else {
        prev.times_used += 1;
        prev.total_qty += row.quantity_used;
        if (String(row.consumption_date) > String(prev.last_used || '')) {
          prev.last_used = row.consumption_date;
        }
      }
    }
    const used_products_summary = Array.from(summaryMap.values())
      .sort((a, b) => String(b.last_used || '').localeCompare(String(a.last_used || '')));

    const payload = cust.toJSON();
    payload.used_products = used_products;
    payload.used_products_summary = used_products_summary;
    return res.json(payload);
  } catch (err) {
    console.error('[customers][getOne]', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, phone, email, branch_id } = req.body;
    if (!name) return res.status(400).json({ message: 'Customer name is required.' });

    const effectiveBranchId = req.userBranchId || branch_id || req.user?.branchId || null;
    if (req.userBranchId && effectiveBranchId && Number(effectiveBranchId) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'You can only create customers in your branch.' });
    }

    const emailNorm = email != null && String(email).trim() !== '' ? String(email).trim() : null;

    const cust = await Customer.create({
      name,
      phone,
      email: emailNorm,
      branch_id: effectiveBranchId,
      tenant_id: resolveTenantId(req),
    });

    // Fire-and-forget welcome automation when enabled
    try {
      const tenantId = resolveTenantId(req);
      const { getEnabledByType, enqueueRun } = require('../services/crmAutomationService');
      const welcome = await getEnabledByType(tenantId, 'welcome_message');
      if (welcome && cust.phone) {
        await enqueueRun(tenantId, welcome.id, {
          customerId: cust.id,
          source: 'customer_registration',
          actorId: req.user?.id || null,
        });
      }
    } catch (e) {
      console.warn('[customers] welcome automation', e.message);
    }

    return res.status(201).json(cust);
  } catch (err) {
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: err.errors?.[0]?.message || 'Validation failed.' });
    }
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const cust = await Customer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

    const allowed = ['name', 'phone', 'email', 'branch_id'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.email !== undefined) {
      updates.email = updates.email != null && String(updates.email).trim() !== ''
        ? String(updates.email).trim()
        : null;
    }
    await cust.update(updates);
    return res.json(cust);
  } catch (err) {
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({ message: err.errors?.[0]?.message || 'Validation failed.' });
    }
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const cust = await Customer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });
    if (cust.name === WALK_IN_CUSTOMER_NAME) {
      return res.status(400).json({ message: 'Walk-in Customer is a system record and cannot be deleted.' });
    }

    await cust.destroy();
    return res.json({ message: 'Customer deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const loyalty = async (req, res) => {
  try {
    const { action, points } = req.body;
    if (!['add', 'redeem'].includes(action) || !Number.isInteger(points) || points <= 0) {
      return res.status(400).json({ message: 'action must be "add" or "redeem" and points must be a positive integer.' });
    }

    const cust = await Customer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });

    if (action === 'redeem') {
      if (cust.loyalty_points < points) {
        return res.status(400).json({ message: 'Insufficient loyalty points.' });
      }
      await cust.update({ loyalty_points: cust.loyalty_points - points });
    } else {
      await cust.update({ loyalty_points: cust.loyalty_points + points });
    }

    return res.json({ loyalty_points: cust.loyalty_points, action, points });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** POST /api/customers/qr/resolve — staff scans customer check-in QR */
const qrResolve = async (req, res) => {
  try {
    const payload = verifyCheckInQr(req.body?.code || req.body?.token || req.body?.qr);
    const ctx = await loadQrCustomerContext(req, payload);
    return res.json({
      ok: true,
      customer: ctx.customer,
      appointments: ctx.appointments,
      phone: ctx.phone,
      tenant_id: ctx.tenant_id,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('customers.qrResolve error:', err);
    return res.status(status).json({ message: err.message || 'Failed to resolve QR.' });
  }
};

/**
 * GET /api/customers/:id/checkin-qr — staff issues printable / downloadable check-in QR.
 * Optional query: ttlDays (1–365, default 90).
 */
const issueCheckinQr = async (req, res) => {
  try {
    const cust = await Customer.findOne({
      where: byIdWhere(req, req.params.id),
      attributes: ['id', 'name', 'phone', 'loyalty_points', 'branch_id'],
    });
    if (!cust) return res.status(404).json({ message: 'Customer not found.' });
    if (!cust.phone) {
      return res.status(400).json({ message: 'Customer phone is required to create a check-in QR.' });
    }

    const tenantId = resolveTenantId(req) || cust.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ message: 'tenantId is required.' });
    }

    let ttlDays = parseInt(req.query.ttlDays ?? req.query.ttl_days ?? '90', 10);
    if (!Number.isInteger(ttlDays) || ttlDays < 1) ttlDays = 90;
    if (ttlDays > 365) ttlDays = 365;
    const ttlSec = Math.min(ttlDays * 24 * 60 * 60, STAFF_MAX_TTL_SEC) || STAFF_DEFAULT_TTL_SEC;

    const issued = issueCheckInQr({
      phone: cust.phone,
      tenantId,
      customerId: cust.id,
      name: cust.name,
      ttlSec,
      maxTtlSec: STAFF_MAX_TTL_SEC,
    });

    return res.json({
      code: issued.code,
      expires_at: issued.expires_at,
      expires_in: issued.expires_in,
      ttl_days: ttlDays,
      customer: {
        id: cust.id,
        name: cust.name,
        phone: cust.phone,
        loyalty_points: cust.loyalty_points || 0,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('customers.issueCheckinQr error:', err);
    return res.status(status).json({ message: err.message || 'Failed to create check-in QR.' });
  }
};

/**
 * POST /api/customers/qr/checkin — mark today's appointment as arrived (confirmed).
 * Body: { code, appointmentId? }
 */
const qrCheckin = async (req, res) => {
  try {
    const payload = verifyCheckInQr(req.body?.code || req.body?.token || req.body?.qr);
    const ctx = await loadQrCustomerContext(req, payload);

    let appointmentId = parseInt(req.body?.appointmentId ?? req.body?.appointment_id, 10);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      const first = ctx.appointments.find((a) => ['pending', 'confirmed'].includes(a.status));
      appointmentId = first ? Number(first.id) : null;
    }

    if (!appointmentId) {
      return res.status(404).json({
        message: 'No active appointment found for today. Add a walk-in or book first.',
        customer: ctx.customer,
        appointments: ctx.appointments,
      });
    }

    const appt = await Appointment.findOne({
      where: { ...tenantWhere(req), id: appointmentId },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name', 'duration_minutes', 'price'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
    });
    if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

    const variants = buildPhoneVariants(payload.phone);
    const apptVariants = buildPhoneVariants(appt.phone);
    const phoneMatch = variants.some((v) => apptVariants.includes(v));
    const customerMatch =
      ctx.customer.id != null && Number(appt.customer_id) === Number(ctx.customer.id);
    if (!phoneMatch && !customerMatch) {
      return res.status(403).json({ message: 'Appointment does not match this QR customer.' });
    }

    if (req.userBranchId && Number(appt.branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'Access denied for this branch.' });
    }

    if (['completed', 'cancelled'].includes(appt.status)) {
      return res.status(400).json({ message: `Cannot check in a ${appt.status} appointment.` });
    }

    // pending → confirmed (arrived). confirmed / in_service left as-is.
    if (appt.status === 'pending') {
      await appt.update({ status: 'confirmed' });
      await appt.reload({
        include: [
          { model: Service, as: 'service', attributes: ['id', 'name', 'duration_minutes', 'price'] },
          { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        ],
      });
    }

    return res.json({
      ok: true,
      checked_in: true,
      customer: ctx.customer,
      appointment: appt,
      appointments: ctx.appointments.map((a) => (Number(a.id) === Number(appt.id) ? appt : a)),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('customers.qrCheckin error:', err);
    return res.status(status).json({ message: err.message || 'Failed to check in.' });
  }
};

module.exports = {
  list, getOne, create, update, remove, loyalty,
  qrResolve, qrCheckin, issueCheckinQr,
};
