const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const { Payment, PaymentSplit, Branch, Staff, Customer, Service, Appointment, AppointmentService, CustomerPackage, Package: PkgModel, PackageRedemption } = require('../models');
const { notifyPaymentReceipt, notifyLoyaltyPoints, notifyReviewRequest } = require('../services/notificationService');
const FIXED_POINTS_PER_PAYMENT = 5;
const APPT_EXTRA_SERVICES_PREFIX = 'Additional services:';

const parseAdditionalServiceNames = (notes = '') => {
  const line = String(notes).split('\n').find((l) => l.trim().startsWith(APPT_EXTRA_SERVICES_PREFIX));
  if (!line) return [];
  return line
    .replace(APPT_EXTRA_SERVICES_PREFIX, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};
const stripAdditionalServicesLine = (notes = '') =>
  String(notes)
    .split('\n')
    .filter((line) => !/^\s*additional\s+services?\s*[:\-]?\s*/i.test(line))
    .join('\n')
    .trim();
const normalizeServiceIds = (ids = []) => {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(
    ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
  ));
};
const syncAppointmentServices = async (appointmentId, serviceIds, transaction = null) => {
  const normalized = normalizeServiceIds(serviceIds);
  await AppointmentService.destroy({ where: { appointment_id: appointmentId }, transaction });
  if (!normalized.length) return;
  await AppointmentService.bulkCreate(
    normalized.map((serviceId, idx) => ({
      appointment_id: appointmentId,
      service_id: serviceId,
      sort_order: idx,
    })),
    { transaction },
  );
};

const getBranchWhere = (req) => {
  const where = {};
  if (req.userBranchId)    where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = (page - 1) * limit;

    const where = getBranchWhere(req);
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last  = new Date(year, month, 0).getDate();
      where.date  = { [Op.between]: [start, `${year}-${month}-${last}`] };
    }

    const { count, rows } = await Payment.findAndCountAll({
      where,
      limit,
      offset,
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      include: [
        { model: Branch,   as: 'branch',   attributes: ['id', 'name'] },
        { model: Staff,    as: 'staff',    attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name'] },
        { model: Service,  as: 'service',  attributes: ['id', 'name'] },
        { model: PaymentSplit, as: 'splits' },
      ],
    });

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        { model: Branch,      as: 'branch'      },
        { model: Staff,       as: 'staff'       },
        { model: Customer,    as: 'customer'    },
        { model: Service,     as: 'service'     },
        { model: Appointment, as: 'appointment' },
        { model: PaymentSplit, as: 'splits'     },
      ],
    });

    if (!payment) return res.status(404).json({ message: 'Payment not found.' });
    return res.json(payment);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      branch_id, staff_id, customer_id, service_id, appointment_id,
      customer_name, phone, service_ids = [], splits = [], loyalty_discount = 0, usePoints = false,
    } = req.body;
    const normalizedServiceIds = normalizeServiceIds(service_ids);
    const primaryServiceId = Number(service_id) || normalizedServiceIds[0] || null;
    const selectedServiceIds = normalizedServiceIds.length
      ? [primaryServiceId, ...normalizedServiceIds.filter((id) => id !== primaryServiceId)]
      : (primaryServiceId ? [primaryServiceId] : []);


    if (!branch_id) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id is required.' });
    }

    if (!splits.length) {
      await t.rollback();
      return res.status(400).json({ message: 'At least one payment split is required.' });
    }

    const total_amount = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
    // Business rule: award a fixed 5 loyalty points per successful payment.
    const points_earned = FIXED_POINTS_PER_PAYMENT;

    // Fetch staff to calculate commission
    let commission_amount = 0;
    if (staff_id) {
      const { Staff: StaffModel } = require('../models');
      const staffMember = await StaffModel.findByPk(staff_id, { transaction: t });
      if (staffMember) {
        const commissionBase = Math.max(0, total_amount - loyalty_discount);
        commission_amount = staffMember.commission_type === 'percentage'
          ? (commissionBase * parseFloat(staffMember.commission_value)) / 100
          : parseFloat(staffMember.commission_value);
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    const payment = await Payment.create({
      branch_id,
      staff_id:       staff_id       || null,
      customer_id:    customer_id    || null,
      service_id:     primaryServiceId,
      appointment_id: appointment_id || null,
      customer_name, total_amount, loyalty_discount, points_earned,
      commission_amount, date: today, status: 'paid',
    }, { transaction: t });

    // Save splits
    const splitRows = splits.map((s) => ({
      payment_id: payment.id,
      method: s.method,
      amount: s.amount,
      customer_package_id: s.customer_package_id || null,
    }));
    await PaymentSplit.bulkCreate(splitRows, { transaction: t });

    // Redeem package sessions for 'Package' splits
    for (const s of splits) {
      if (s.method === 'Package' && s.customer_package_id) {
        const cp = await CustomerPackage.findByPk(s.customer_package_id, {
          include: [{ model: PkgModel, as: 'package' }],
          transaction: t,
        });
        if (cp && cp.status === 'active' && cp.sessions_remaining > 0) {
          await PackageRedemption.create({
            customer_package_id: cp.id,
            payment_id: payment.id,
            service_id: primaryServiceId,
            redeemed_at: new Date(),
            redeemed_by: staff_id || null,
          }, { transaction: t });
          const newUsed = (cp.sessions_used || 0) + 1;
          const updates = { sessions_used: newUsed };
          if (newUsed >= cp.sessions_total) updates.status = 'completed';
          await cp.update(updates, { transaction: t });
        }
      }
    }

    // Update customer stats
    if (customer_id) {
      const { Customer: CustModel } = require('../models');
      const cust = await CustModel.findByPk(customer_id, { transaction: t });
      if (cust) {
        let newPoints = cust.loyalty_points + points_earned;
        if (usePoints && loyalty_discount > 0) {
          const pointsUsed = Math.floor(loyalty_discount);
          newPoints = Math.max(0, cust.loyalty_points - pointsUsed) + points_earned;
        }
        await cust.update({
          visits:         (cust.visits || 0) + 1,
          total_spent:    parseFloat(cust.total_spent || 0) + total_amount,
          loyalty_points: newPoints,
          last_visit:     today,
        }, { transaction: t });
      }
    }

    // Mark appointment commission
    if (appointment_id) {
      const { Appointment: ApptModel } = require('../models');
      if (selectedServiceIds.length) {
        const appt = await ApptModel.findByPk(appointment_id, { transaction: t, attributes: ['id', 'notes'] });
        const selectedServices = await Service.findAll({
          where: { id: { [Op.in]: selectedServiceIds } },
          attributes: ['id', 'name'],
          transaction: t,
        });
        const nameById = new Map(selectedServices.map((s) => [Number(s.id), s.name]));
        const extraNames = selectedServiceIds
          .slice(1)
          .map((id) => nameById.get(id))
          .filter(Boolean);
        const baseNote = stripAdditionalServicesLine(appt?.notes || '');
        const mergedNotes = [
          baseNote,
          extraNames.length ? `${APPT_EXTRA_SERVICES_PREFIX} ${extraNames.join(', ')}` : '',
        ].filter(Boolean).join('\n');

        await ApptModel.update({
          service_id: selectedServiceIds[0],
          amount: total_amount,
          notes: mergedNotes || null,
          commission_paid: commission_amount,
        }, {
          where: { id: appointment_id },
          transaction: t,
        });
        await syncAppointmentServices(appointment_id, selectedServiceIds, t);
      } else {
        await ApptModel.update({ commission_paid: commission_amount }, {
          where: { id: appointment_id },
          transaction: t,
        });
      }
    }

    await t.commit();

    // Fire-and-forget notifications (after transaction commits successfully).
    // Important: Appointment page may submit payment without customer_id.
    // In that case, fall back to appointment phone/customer details.
    {
      const [branch, customer, appointmentForNotify] = await Promise.all([
        Branch.findByPk(branch_id,   { attributes: ['id', 'name', 'phone'] }),
        (async () => {
          if (!customer_id) return null;
          const { Customer: CustModel } = require('../models');
          return CustModel.findByPk(customer_id, { attributes: ['id', 'name', 'phone', 'email', 'loyalty_points'] });
        })(),
        (async () => {
          if (!appointment_id) return null;
          return Appointment.findByPk(appointment_id, {
            attributes: ['id', 'customer_id', 'customer_name', 'phone', 'notes', 'service_id'],
            include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email', 'loyalty_points'] }],
          });
        })(),
      ]);

      const toPlain = (row) => {
        if (!row) return null;
        return row.get && typeof row.get === 'function' ? row.get({ plain: true }) : { ...row };
      };

      let recipient = toPlain(customer)
        || toPlain(appointmentForNotify?.customer)
        || (appointmentForNotify
          ? {
              id: appointmentForNotify.customer_id || null,
              name: appointmentForNotify.customer_name || customer_name || 'Valued Customer',
              phone: appointmentForNotify.phone || null,
              email: null,
              loyalty_points: 0,
            }
          : null);

      // Customer profile often has no phone; appointment row usually has the number (walk-in / web).
      const apptPhone = appointmentForNotify?.phone ? String(appointmentForNotify.phone).trim() : '';
      const reqPhone = phone ? String(phone).trim() : '';
      if (!recipient) {
        recipient = {
          id: null,
          name: customer_name || 'Valued Customer',
          phone: reqPhone || null,
          email: null,
          loyalty_points: 0,
        };
      }
      if (recipient && reqPhone && !String(recipient.phone || '').trim()) {
        recipient = { ...recipient, phone: reqPhone };
      }
      if (recipient && apptPhone && !String(recipient.phone || '').trim()) {
        recipient = { ...recipient, phone: apptPhone };
      }

      if (recipient && (recipient.phone || recipient.email)) {
        let servicesForNotify = [];
        if (normalizedServiceIds.length) {
          servicesForNotify = await Service.findAll({
            where: { id: { [Op.in]: normalizedServiceIds } },
            attributes: ['id', 'name'],
          });
        } else if (appointmentForNotify) {
          const apptPrimaryId = Number(appointmentForNotify.service_id || 0);
          const extraNames = parseAdditionalServiceNames(appointmentForNotify.notes || '');
          const [apptPrimary, apptExtras] = await Promise.all([
            apptPrimaryId ? Service.findByPk(apptPrimaryId, { attributes: ['id', 'name'] }) : null,
            extraNames.length
              ? Service.findAll({ where: { name: { [Op.in]: extraNames } }, attributes: ['id', 'name'] })
              : [],
          ]);
          servicesForNotify = [apptPrimary, ...apptExtras].filter(Boolean);
        } else if (primaryServiceId) {
          const one = await Service.findByPk(primaryServiceId, { attributes: ['id', 'name'] });
          if (one) servicesForNotify = [one];
        }

        const serviceNames = Array.from(new Set(
          servicesForNotify
            .map((s) => (s.get ? s.get('name') : s.name))
            .filter(Boolean),
        ));
        const serviceForNotify = {
          id: primaryServiceId,
          name: serviceNames.join(', ') || '—',
        };

        const splitsForNotify = await PaymentSplit.findAll({ where: { payment_id: payment.id } });
        notifyPaymentReceipt(
          { ...payment.toJSON(), splits: splitsForNotify },
          branch, serviceForNotify, recipient
        );

        if (customer_id && points_earned > 0) {
          const { Customer: CustModel } = require('../models');
          const freshCust = await CustModel.findByPk(customer_id, { attributes: ['id', 'name', 'phone', 'email', 'loyalty_points'] });
          if (freshCust) {
            notifyLoyaltyPoints(freshCust, points_earned, freshCust.loyalty_points || 0, branch);
          }
        }

        // Generate review token and send review request when we have at least a reachable recipient.
        const { randomUUID } = require('crypto');
        const reviewToken = randomUUID();
        await Payment.update({ review_token: reviewToken }, { where: { id: payment.id } });
        notifyReviewRequest(payment.toJSON(), recipient, serviceForNotify, branch, reviewToken);
      }
    }

    return res.status(201).json(payment);
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const summary = async (req, res) => {
  try {
    const where = getBranchWhere(req);
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last  = new Date(year, month, 0).getDate();
      where.date  = { [Op.between]: [start, `${year}-${month}-${last}`] };
    }

    const totals = await Payment.findAll({
      where,
      attributes: [
        'branch_id',
        [fn('SUM', col('total_amount')),    'revenue'],
        [fn('SUM', col('commission_amount')), 'commission'],
        [fn('COUNT', col('id')),            'count'],
      ],
      // Keep summary resilient across environments where optional branch fields
      // (like color) may not exist yet in DB schema.
      group: ['Payment.branch_id', 'branch.id', 'branch.name'],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return res.json(totals);
  } catch (err) {
    console.error('Payment summary error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, summary };
