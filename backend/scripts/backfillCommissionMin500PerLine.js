/**
 * Recalculate worker (+ helper) commission with per-line Rs.500 skip rule.
 *
 * Usage (backend container / local with DB env):
 *   node scripts/backfillCommissionMin500PerLine.js [--tenant-slug=salon-larvendo] [--dry-run] [--force-min=500]
 *
 * Only updates rows where the recomputed main/helper commission differs.
 */
'use strict';

require('dotenv').config();

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Tenant,
  Payment,
  Service,
  Staff,
  StaffSpecialization,
  Appointment,
  AppointmentService,
  CommissionTransaction,
} = require('../models');
const { computeCommissionDetails } = require('../utils/commissionCalculator');
const { computeHelperCommissionSplit } = require('../utils/helperCommission');
const { recordCommissionTransactions } = require('../services/recordCommissionTransactions');
const {
  allowsServiceWiseOverrides,
  getMinCommissionableAmount,
} = require('../utils/tenantFeatures');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugArg = args.find((a) => a.startsWith('--tenant-slug='));
const tenantSlug = slugArg ? slugArg.split('=')[1] : 'salon-larvendo';
const forceMinArg = args.find((a) => a.startsWith('--force-min='));
const forceMin = forceMinArg ? parseFloat(forceMinArg.split('=')[1]) : null;

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function helpersFromStored(helperCommission) {
  const raw = parseJson(helperCommission);
  const helpers = Array.isArray(raw?.helpers) ? raw.helpers : [];
  return helpers
    .map((h) => ({
      staff_id: Number(h.staff_id),
      staff_name: h.staff_name || null,
      commission_type: h.commission_type || 'percentage_of_main',
      commission_value: parseFloat(h.commission_value),
    }))
    .filter((h) => h.staff_id > 0 && h.commission_value > 0);
}

function serviceHintsFromBreakdown(breakdown) {
  const raw = parseJson(breakdown);
  const lines = Array.isArray(raw?.lines) ? raw.lines : [];
  const withSvc = lines.filter((l) => Number(l.serviceId) > 0);
  if (!withSvc.length) return null;
  const serviceIds = [];
  const servicePrices = {};
  const serviceNames = {};
  for (const line of withSvc) {
    const id = Number(line.serviceId);
    if (!id || serviceIds.includes(id)) continue;
    serviceIds.push(id);
    // Prefer original line share so historical mix stays correct
    const price = parseFloat(line.lineBase);
    servicePrices[id] = Number.isFinite(price) && price >= 0 ? price : 0;
    if (line.serviceName) serviceNames[id] = line.serviceName;
  }
  return serviceIds.length ? { serviceIds, servicePrices, serviceNames } : null;
}

async function resolveServiceIds(payment) {
  const fromBreakdown = serviceHintsFromBreakdown(payment.commission_breakdown);
  if (fromBreakdown?.serviceIds?.length) return fromBreakdown.serviceIds;

  let ids = payment.service_id ? [Number(payment.service_id)].filter(Boolean) : [];
  if (!ids.length && payment.appointment_id) {
    const links = await AppointmentService.findAll({
      where: { appointment_id: Number(payment.appointment_id) },
      attributes: ['service_id'],
    });
    ids = links.map((l) => Number(l.service_id)).filter(Boolean);
    if (!ids.length) {
      const appt = await Appointment.findOne({
        where: { id: payment.appointment_id, tenant_id: payment.tenant_id },
        attributes: ['service_id'],
      });
      if (appt?.service_id) ids = [Number(appt.service_id)];
    }
  }
  return ids;
}

async function buildServiceMaps(payment, tenantId) {
  const hints = serviceHintsFromBreakdown(payment.commission_breakdown);
  const ids = await resolveServiceIds(payment);
  const servicePrices = { ...(hints?.servicePrices || {}) };
  const serviceNames = { ...(hints?.serviceNames || {}) };
  const serviceCommissions = {};

  if (ids.length) {
    const svcRows = await Service.findAll({
      where: { id: ids, tenant_id: tenantId },
      attributes: ['id', 'name', 'price', 'commission_type', 'commission_value'],
    });
    for (const svc of svcRows) {
      if (servicePrices[svc.id] == null || !(servicePrices[svc.id] > 0)) {
        servicePrices[svc.id] = parseFloat(svc.price) || 0;
      }
      if (!serviceNames[svc.id]) serviceNames[svc.id] = svc.name;
      if (svc.commission_value != null && svc.commission_value !== '') {
        serviceCommissions[svc.id] = {
          commission_type: svc.commission_type,
          commission_value: svc.commission_value,
        };
      }
    }
  }

  return { serviceIds: ids, servicePrices, serviceNames, serviceCommissions };
}

function nearlyEqual(a, b) {
  return Math.abs(parseFloat(a || 0) - parseFloat(b || 0)) < 0.015;
}

async function main() {
  const tenant = await Tenant.findOne({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const minAmt = forceMin != null && Number.isFinite(forceMin)
    ? forceMin
    : getMinCommissionableAmount(tenant);

  console.log(`Tenant: ${tenant.name} (#${tenant.id}) slug=${tenant.slug}`);
  console.log(`minCommissionableAmount=${minAmt}${dryRun ? ' [DRY-RUN]' : ''}`);
  if (!(minAmt > 0)) {
    console.warn('WARN: feature skip_commission_under_500 appears OFF. Pass --force-min=500 to apply anyway.');
  }

  const payments = await Payment.findAll({
    where: {
      tenant_id: tenant.id,
      staff_id: { [Op.ne]: null },
      status: 'paid',
      is_advance: false,
    },
    order: [['id', 'ASC']],
  });

  console.log(`Scanning ${payments.length} paid payment(s)…`);

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let reduced = 0;
  let deltaSum = 0;

  for (const payment of payments) {
    const staffMember = await Staff.findOne({
      where: { id: payment.staff_id, tenant_id: tenant.id },
      include: [{ model: StaffSpecialization, as: 'specializations' }],
    });
    if (!staffMember) {
      skipped += 1;
      continue;
    }

    const maps = await buildServiceMaps(payment, tenant.id);
    const computed = computeCommissionDetails({
      staff: staffMember,
      specializations: staffMember.specializations || [],
      allowServiceOverrides: allowsServiceWiseOverrides(tenant),
      minCommissionableAmount: minAmt,
      serviceIds: maps.serviceIds,
      servicePrices: maps.servicePrices,
      serviceCommissions: maps.serviceCommissions,
      serviceNames: maps.serviceNames,
      total_amount: payment.total_amount,
      subtotal: payment.total_amount,
      loyalty_discount: payment.loyalty_discount,
      promo_discount: payment.promo_discount,
    });

    const helpersInput = helpersFromStored(payment.helper_commission);
    const split = computeHelperCommissionSplit(computed.amount, helpersInput);
    if (split.error) {
      console.warn(`Payment #${payment.id}: helper split error — ${split.error} (keeping old values)`);
      skipped += 1;
      continue;
    }

    const newMain = split.mainNet;
    const newHelper = split.helpers.length
      ? {
        grossMain: split.grossMain,
        helpersTotal: split.helpersTotal,
        mainNet: split.mainNet,
        helpers: split.helpers,
      }
      : null;
    const newBreakdown = {
      ...computed.breakdown,
      total: split.mainNet,
      grossMain: split.grossMain,
      helpersTotal: split.helpersTotal,
      helpers: split.helpers,
      note: split.helpers.length
        ? `Main net after helpers: Rs. ${split.mainNet.toFixed(2)} (gross Rs. ${split.grossMain.toFixed(2)})`
        : computed.breakdown?.note,
      backfilled_per_line_min500: true,
      backfilled_at: new Date().toISOString(),
    };

    const oldMain = parseFloat(payment.commission_amount || 0);
    if (nearlyEqual(oldMain, newMain)) {
      // Still refresh breakdown if line skip flags missing but amount same
      unchanged += 1;
      continue;
    }

    const diff = Math.round((newMain - oldMain) * 100) / 100;
    deltaSum += diff;
    if (diff < 0) reduced += 1;
    changed += 1;

    console.log(
      `Payment #${payment.id} ${payment.date} Rs.${payment.total_amount}`
      + ` commission ${oldMain} → ${newMain} (Δ ${diff})`
      + (maps.serviceIds.length ? ` services=[${maps.serviceIds.join(',')}]` : ' (bill-total)'),
    );

    if (dryRun) continue;

    await sequelize.transaction(async (t) => {
      await payment.update({
        commission_amount: newMain,
        commission_breakdown: newBreakdown,
        helper_commission: newHelper,
      }, { transaction: t });

      await CommissionTransaction.destroy({
        where: { payment_id: payment.id },
        transaction: t,
      });

      await recordCommissionTransactions({
        paymentId: payment.id,
        tenantId: payment.tenant_id,
        branchId: payment.branch_id,
        date: payment.date,
        serviceAmount: payment.total_amount,
        workerStaffId: payment.staff_id,
        workerAmount: newMain,
        workerBreakdown: newBreakdown,
        managerStaffId: null,
        managerAmount: 0,
        managerPercent: null,
        managerBreakdown: null,
        helpers: split.helpers,
      }, { transaction: t });
    });
  }

  console.log('── Summary ──');
  console.log(`changed=${changed} unchanged=${unchanged} skipped=${skipped}`);
  console.log(`reduced=${reduced} commissionDeltaSum=${Math.round(deltaSum * 100) / 100}`);
  if (dryRun) console.log('Dry-run only — no DB writes.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
