const {
  Appointment,
  AppointmentService,
  Payment,
  Service,
  Staff,
  StaffSpecialization,
} = require('../models');
const { computeCommissionDetails } = require('../utils/commissionCalculator');
const { allowsServiceWiseOverrides } = require('../utils/tenantFeatures');
const { tenantWhere, byIdWhere } = require('../utils/tenantScope');

function parseStoredBreakdown(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  return raw?.lines?.length ? raw : null;
}

async function resolveServiceIdsForPayment(payment, reqLike = {}) {
  let ids = payment.service_id ? [Number(payment.service_id)].filter(Boolean) : [];
  if (!ids.length && payment.appointment_id) {
    const links = await AppointmentService.findAll({
      where: { appointment_id: Number(payment.appointment_id) },
      attributes: ['service_id'],
    });
    ids = links.map((l) => Number(l.service_id)).filter(Boolean);
    if (!ids.length) {
      const appt = await Appointment.findOne({
        where: { id: payment.appointment_id, ...tenantWhere(reqLike) },
        attributes: ['service_id'],
      });
      if (appt?.service_id) ids = [Number(appt.service_id)];
    }
  }
  return ids;
}

async function breakdownForPayment(payment, tenant, reqLike = {}) {
  const stored = parseStoredBreakdown(payment.commission_breakdown);
  if (stored) return stored;

  if (!payment.staff_id) {
    return {
      netTotal: parseFloat(payment.total_amount || 0),
      paidAmount: parseFloat(payment.total_amount || 0),
      loyaltyDiscount: parseFloat(payment.loyalty_discount || 0),
      promoDiscount: parseFloat(payment.promo_discount || 0),
      lines: [],
      total: parseFloat(payment.commission_amount || 0),
      note: 'No staff assigned — commission not calculated.',
    };
  }

  const staffMember = await Staff.findOne({
    where: byIdWhere(reqLike, payment.staff_id),
    include: [{ model: StaffSpecialization, as: 'specializations' }],
  });
  if (!staffMember) {
    return {
      netTotal: parseFloat(payment.total_amount || 0),
      lines: [],
      total: parseFloat(payment.commission_amount || 0),
      note: 'Staff record not found.',
    };
  }

  const ids = await resolveServiceIdsForPayment(payment, reqLike);
  const servicePrices = {};
  const serviceCommissions = {};
  const serviceNames = {};

  if (ids.length) {
    const svcRows = await Service.findAll({
      where: { id: ids, ...tenantWhere(reqLike) },
      attributes: ['id', 'name', 'price', 'commission_type', 'commission_value'],
    });
    for (const svc of svcRows) {
      servicePrices[svc.id] = svc.price;
      serviceNames[svc.id] = svc.name;
      if (svc.commission_value != null && svc.commission_value !== '') {
        serviceCommissions[svc.id] = {
          commission_type: svc.commission_type,
          commission_value: svc.commission_value,
        };
      }
    }
  }

  const { breakdown } = computeCommissionDetails({
    staff: staffMember,
    specializations: staffMember.specializations || [],
    serviceIds: ids,
    servicePrices,
    serviceCommissions,
    serviceNames,
    total_amount: payment.total_amount,
    subtotal: payment.total_amount,
    loyalty_discount: payment.loyalty_discount,
    promo_discount: payment.promo_discount,
    allowServiceOverrides: allowsServiceWiseOverrides(tenant),
  });

  return breakdown;
}

module.exports = { breakdownForPayment, parseStoredBreakdown };
