'use strict';
const { slToday } = require('./dateUtils');

/**
 * Redeem a customer package against services in a payment.
 * Deducts one session per included service redeemed.
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

  const sessionsNeeded = redeemIds.length;
  if (cp.sessions_remaining !== null && cp.sessions_remaining < sessionsNeeded) {
    const err = new Error(`Not enough sessions remaining (need ${sessionsNeeded}, have ${cp.sessions_remaining}).`);
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
