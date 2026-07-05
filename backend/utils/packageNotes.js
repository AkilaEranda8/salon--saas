'use strict';

const { byIdWhere } = require('./tenantScope');

/** True when appointment / walk-in notes include a customer package reference. */
function notesUsesPackage(notes) {
  return /^\s*package\s*[:\-]?\s*#\d+/im.test(String(notes || ''));
}

/** Parse customer_package id from notes (Package: #123 - name). */
function parsePackageIdFromNotes(notes) {
  const match = String(notes || '').match(/package\s*[:\-]?\s*#(\d+)/i);
  return match ? Number(match[1]) : null;
}

function usesPackageBooking({ notes, customer_package_id: customerPackageId, customerPackageId: altId } = {}) {
  return !!(customerPackageId || altId || notesUsesPackage(notes));
}

/** Bundle price for a sold customer package row. */
async function resolvePackageBundlePrice(req, customerPackageId, transaction = null) {
  if (!customerPackageId) return 0;
  const { CustomerPackage, Package: PkgModel } = require('../models');
  const cp = await CustomerPackage.findOne({
    where: byIdWhere(req, customerPackageId),
    include: [{ model: PkgModel, as: 'package', attributes: ['package_price'] }],
    transaction,
  });
  return Number(cp?.package?.package_price || 0);
}

module.exports = {
  notesUsesPackage,
  parsePackageIdFromNotes,
  usesPackageBooking,
  resolvePackageBundlePrice,
};
