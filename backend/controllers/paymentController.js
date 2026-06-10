const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const { Payment, PaymentSplit, Branch, Staff, StaffSpecialization, Customer, Service, Appointment, AppointmentService, CustomerPackage, Package: PkgModel, PackageRedemption, LoyaltyRule } = require('../models');
const { calculatePaymentCommission } = require('../utils/commissionCalculator');
const { hasTenantFeature } = require('../utils/tenantFeatures');
const { notifyPaymentReceipt, notifyLoyaltyPoints } = require('../services/notificationService');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { slToday } = require('../utils/dateUtils');

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
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
    if (req.query.customerId) where.customer_id = req.query.customerId;

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
    const payment = await Payment.findOne({
      where: byIdWhere(req, req.params.id),
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
      branch_id, staff_id, customer_id, service_id, service_ids, appointment_id,
      customer_name, phone, walkin_token, splits = [], subtotal: bodySubtotal,
      loyalty_discount = 0, promo_discount = 0, usePoints = false,
    } = req.body;

    if (!branch_id) {
      await t.rollback();
      return res.status(400).json({ message: 'branch_id is required.' });
    }

    if (!splits.length) {
      await t.rollback();
      return res.status(400).json({ message: 'At least one payment split is required.' });
    }

    const total_amount = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

    // Loyalty rule — look up once, fall back to defaults (100 Rs = 1 pt)
    const tenantId = resolveTenantId(req);
    const loyaltyRule = await LoyaltyRule.findOne({
      where: { tenant_id: tenantId, is_active: true },
    }).catch(() => null);
    const earnPerAmount = parseFloat(loyaltyRule?.earn_per_amount) || 100;
    const earnPoints    = parseInt(loyaltyRule?.earn_points)    || 1;
    const redeemPoints  = parseInt(loyaltyRule?.redeem_points)  || 100;
    const redeemValue   = parseFloat(loyaltyRule?.redeem_value) || 50;
    const points_earned = Math.floor(total_amount / earnPerAmount) * earnPoints;

    // Staff commission — per selected service (staff_specializations) or staff default
    let commission_amount = 0;
    if (staff_id) {
      const staffMember = await Staff.findOne({
        where: byIdWhere(req, staff_id),
        include: [{ model: StaffSpecialization, as: 'specializations' }],
        transaction: t,
      });
      if (staffMember) {
        let ids = Array.isArray(service_ids) && service_ids.length
          ? service_ids.map(Number).filter(Boolean)
          : (service_id ? [Number(service_id)].filter(Boolean) : []);

        if (!ids.length && appointment_id) {
          const links = await AppointmentService.findAll({
            where: { appointment_id: Number(appointment_id) },
            attributes: ['service_id'],
            transaction: t,
          });
          ids = links.map((l) => Number(l.service_id)).filter(Boolean);
          if (!ids.length) {
            const appt = await Appointment.findOne({
              where: byIdWhere(req, appointment_id),
              attributes: ['service_id'],
              transaction: t,
            });
            if (appt?.service_id) ids = [Number(appt.service_id)];
          }
        }

        const servicePrices = {};
        const serviceCommissions = {};
        if (ids.length) {
          const svcRows = await Service.findAll({
            where: { id: ids, ...tenantWhere(req) },
            attributes: ['id', 'price', 'commission_type', 'commission_value'],
            transaction: t,
          });
          for (const svc of svcRows) {
            servicePrices[svc.id] = svc.price;
            if (svc.commission_value != null && svc.commission_value !== '') {
              serviceCommissions[svc.id] = {
                commission_type: svc.commission_type,
                commission_value: svc.commission_value,
              };
            }
          }
        }
        commission_amount = calculatePaymentCommission({
          staff: staffMember,
          specializations: staffMember.specializations || [],
          serviceIds: ids,
          servicePrices,
          serviceCommissions,
          total_amount,
          subtotal: bodySubtotal,
          loyalty_discount,
          promo_discount,
          allowServiceOverrides: hasTenantFeature(req.tenant, 'service_wise_commission'),
        });
      }
    }

    const today = slToday();

    const payment = await Payment.create({
      branch_id,
      staff_id:       staff_id       || null,
      customer_id:    customer_id    || null,
      service_id:     service_id     || null,
      appointment_id: appointment_id || null,
      customer_name, total_amount, loyalty_discount, promo_discount, points_earned,
      commission_amount, date: today, status: 'paid',
      tenant_id: resolveTenantId(req),
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
        const cp = await CustomerPackage.findOne({
          where: byIdWhere(req, s.customer_package_id),
          include: [{ model: PkgModel, as: 'package' }],
          transaction: t,
        });
        if (cp && cp.status === 'active' && (cp.sessions_remaining === null || cp.sessions_remaining > 0)) {
          await PackageRedemption.create({
            customer_package_id: cp.id,
            payment_id: payment.id,
            service_id: service_id || null,
            redeemed_at: new Date(),
            redeemed_by: staff_id || null,
            tenant_id: resolveTenantId(req),
          }, { transaction: t });
          const newUsed = (cp.sessions_used || 0) + 1;
          const updates = { sessions_used: newUsed };
          if (cp.sessions_total > 0 && newUsed >= cp.sessions_total) updates.status = 'completed';
          await cp.update(updates, { transaction: t });
        }
      }
    }

    // Update customer stats
    if (customer_id) {
      const { Customer: CustModel } = require('../models');
      const cust = await CustModel.findOne({ where: byIdWhere(req, customer_id), transaction: t });
      if (cust) {
        let newPoints = cust.loyalty_points + points_earned;
        if (usePoints && loyalty_discount > 0) {
          // Convert rupee discount back to points using loyalty rule ratio
          const pointsUsed = Math.ceil((loyalty_discount / redeemValue) * redeemPoints);
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
      await ApptModel.update({ commission_paid: commission_amount }, {
        where: { id: appointment_id, ...tenantWhere(req) },
        transaction: t,
      });
    }

    await t.commit();

    // Fire-and-forget notifications (after transaction commits successfully)
    // Walk-in: send SMS if phone provided even without customer_id
    if (!customer_id && phone) {
      const [branch, service] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, service_id), attributes: ['id', 'name'] }),
      ]);
      const walkinCustomer = { name: customer_name || 'Guest', phone, email: null, loyalty_points: 0 };
      notifyPaymentReceipt(
        { ...payment.toJSON(), walkin_token, splits: await PaymentSplit.findAll({ where: { payment_id: payment.id } }) },
        branch, service, walkinCustomer
      );
    }
    if (customer_id) {
      const [branch, service, customer] = await Promise.all([
        Branch.findOne({ where: byIdWhere(req, branch_id), attributes: ['id', 'name', 'phone'] }),
        Service.findOne({ where: byIdWhere(req, service_id), attributes: ['id', 'name'] }),
        (async () => {
          const { Customer: CustModel } = require('../models');
          return CustModel.findOne({ where: byIdWhere(req, customer_id), attributes: ['id', 'name', 'phone', 'email', 'loyalty_points'] });
        })(),
      ]);
      if (customer) {
        const updatedPoints = (customer.loyalty_points || 0);
        notifyPaymentReceipt(
          { ...payment.toJSON(), splits: await PaymentSplit.findAll({ where: { payment_id: payment.id } }) },
          branch, service, customer
        );
        if (points_earned > 0) {
          notifyLoyaltyPoints(customer, points_earned, updatedPoints, branch);
        }
      }
    }

    return res.status(201).json(payment);
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where: byIdWhere(req, req.params.id) });
    if (!payment) return res.status(404).json({ message: 'Payment not found.' });
    const allowed = ['status', 'date', 'total_amount'];
    const fields  = {};
    for (const k of allowed) { if (req.body[k] !== undefined) fields[k] = req.body[k]; }
    await payment.update(fields);
    return res.json(payment);
  } catch (err) {
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
        [fn('SUM', col('total_amount')), 'revenue'],
        [fn('SUM', col('commission_amount')), 'commission'],
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['branch_id'],
      raw: true,
    });

    const branchIds = totals
      .map((row) => row.branch_id)
      .filter((id) => id !== null && id !== undefined);

    const branches = branchIds.length
      ? await Branch.findAll({
          where: {
            ...tenantWhere(req),
            id: { [Op.in]: branchIds },
          },
          attributes: ['id', 'name', 'color'],
          raw: true,
        })
      : [];

    const branchMap = new Map(branches.map((branch) => [String(branch.id), branch]));

    const payload = totals.map((row) => ({
      ...row,
      branch: branchMap.get(String(row.branch_id)) || null,
    }));

    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, summary };
