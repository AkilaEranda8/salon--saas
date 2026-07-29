'use strict';
const { slToday } = require('./dateUtils');
const { getSessionsRemaining } = require('./customerPackageHelpers');

/**
 * Redeem a customer package against services in a payment.
 * One visit / payment consumes one session (even if multiple package services are used).
 * Each service still gets a redemption row for history.
 */
async function redeemPackageForPayment({
  req,
  transaction,
  customerPackageId,
  serviceIds = [],
  paymentId = null,
  appointmentId = null,
  staffId = null,
}) {
  const { CustomerPackage, PackageRedemption, Package: PkgModel } = require('../models');
  const { byIdWhere, resolveTenantId } = require('./tenantScope');

  if (!customerPackageId) {
    const err = new Error('customer_package_id is required for Package payment.');
    err.status = 400;
    throw err;
  }

  const cp = await CustomerPackage.findOne({
    where: byIdWhere(req, customerPackageId),
    include: [{ model: PkgModel, as: 'package' }],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });

  if (!cp) {
    const err = new Error('Customer package not found.');
    err.status = 404;
    throw err;
  }

  if (cp.status !== 'active') {
    const err = new Error(`Package is ${cp.status}. Cannot redeem.`);
    err.status = 400;
    throw err;
  }

  const today = slToday();
  if (cp.expiry_date < today) {
    await cp.update({ status: 'expired' }, { transaction });
    const err = new Error('Package has expired.');
    err.status = 400;
    throw err;
  }

  const allowed = new Set((cp.package?.services || []).map(Number));
  const redeemIds = [...new Set(serviceIds.map(Number).filter(Boolean))].filter((id) => allowed.has(id));

  if (!redeemIds.length) {
    const err = new Error('None of the selected services are included in this package.');
    err.status = 400;
    throw err;
  }

  const invalid = serviceIds.map(Number).filter(Boolean).filter((id) => !allowed.has(id));
  if (invalid.length) {
    const err = new Error('Some selected services are not included in the package.');
    err.status = 400;
    throw err;
  }

  // One payment / visit = one session, regardless of how many package services are used
  const sessionsNeeded = 1;
  const sessionsLeft = getSessionsRemaining(cp);
  if (sessionsLeft !== null && sessionsLeft < sessionsNeeded) {
    const err = new Error(`Not enough sessions remaining (need ${sessionsNeeded}, have ${sessionsLeft}).`);
    err.status = 400;
    throw err;
  }

  const tenantId = resolveTenantId(req);
  for (const serviceId of redeemIds) {
    await PackageRedemption.create({
      customer_package_id: cp.id,
      appointment_id: appointmentId || null,
      payment_id: paymentId || null,
      service_id: serviceId,
      redeemed_at: new Date(),
      redeemed_by: staffId || null,
      tenant_id: tenantId,
    }, { transaction });
  }

  const newUsed = (cp.sessions_used || 0) + sessionsNeeded;
  const updates = { sessions_used: newUsed };
  if (cp.sessions_total > 0 && newUsed >= cp.sessions_total) updates.status = 'completed';
  await cp.update(updates, { transaction });

  return { customerPackageId: cp.id, redeemedServiceIds: redeemIds, sessionsUsed: sessionsNeeded };
}

module.exports = { redeemPackageForPayment };
