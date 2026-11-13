'use strict';

const { sequelize } = require('../../../config/database');
const { money } = require('../balance');
const { splitInclusiveVat } = require('../vat');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { voidJournalBySource } = require('../journal');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

function tenderToAccountId(method, settings) {
  const m = String(method || 'Cash').toLowerCase();
  // Redemption: debit liability (not cash) — package/loyalty cash was already taken when sold/earned.
  if (m.includes('package') || m.includes('prepaid') || m.includes('voucher')) {
    return settings.default_package_liability_id || settings.default_revenue_account_id;
  }
  if (m.includes('loyalty') || m.includes('points') || m.includes('reward')) {
    return settings.default_loyalty_liability_id || settings.default_revenue_account_id;
  }
  if (m.includes('cash')) return settings.default_cash_account_id;
  if (m.includes('card') || m.includes('bank') || m.includes('online') || m.includes('transfer')) {
    return settings.default_bank_account_id || settings.default_cash_account_id;
  }
  return settings.default_cash_account_id;
}

/** Use the passed tenant, else load by tenantId / payment.tenant_id. */
async function resolvePaymentTenant(payment, { tenant = null, tenantId = null, transaction = null } = {}) {
  if (tenant) return tenant;
  const tid = tenantId ?? payment?.tenant_id ?? null;
  if (!tid) return null;
  const { Tenant } = require('../../../models');
  return Tenant.findByPk(tid, { transaction });
}

/**
 * Debit lines (one per tender) scaled to the gross amount. Any rounding drift is
 * absorbed by the last debit line so total debits === gross exactly.
 */
function buildTenderDebitLines(tenderRows, gross, settings) {
  const tenderTotal = money(tenderRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0));
  const scale = tenderTotal > 0 ? gross / tenderTotal : 1;

  const lines = [];
  for (const row of tenderRows) {
    const amt = money(parseFloat(row.amount || 0) * scale);
    if (!(amt > 0)) continue;
    const acct = tenderToAccountId(row.method, settings) || settings.default_cash_account_id;
    if (!acct) continue;
    lines.push({ account_id: acct, debit: amt, credit: 0, memo: row.method || 'Tender' });
  }

  if (!lines.length) {
    if (!settings.default_cash_account_id) return [];
    return [{
      account_id: settings.default_cash_account_id,
      debit: gross,
      credit: 0,
      memo: 'Cash',
    }];
  }

  const debitTotal = money(lines.reduce((s, l) => s + l.debit, 0));
  const drift = money(gross - debitTotal);
  if (drift !== 0) {
    const last = lines[lines.length - 1];
    last.debit = money(last.debit + drift);
  }
  return lines;
}

async function postPaymentToGl(
  payment,
  {
    tenant = null, tenantId = null, splits = [], userId = null, transaction = null,
  } = {},
) {
  const resolvedTenant = await resolvePaymentTenant(payment, { tenant, tenantId, transaction });
  if (!resolvedTenant || !hasTenantFeature(resolvedTenant, 'accounting')) return null;
  if (!payment.tenant_id) return null;
  const settings = await getSettings(payment.tenant_id, { transaction });
  if (!settings?.auto_post_payments) return null;
  if (String(payment.status) !== 'paid') return null;

  const gross = money(payment.total_amount);
  if (!(gross > 0)) return null;

  const tenderRows = Array.isArray(splits) && splits.length
    ? splits
    : [{ method: 'Cash', amount: gross }];

  const lines = buildTenderDebitLines(tenderRows, gross, settings);
  if (!lines.length) return null;

  if (payment.is_advance) {
    // Customer deposit: money received but service not yet delivered → liability, not revenue.
    const depositLiabilityId = settings.default_deposit_liability_id
      || settings.default_package_liability_id;
    if (!depositLiabilityId) return null;
    lines.push({
      account_id: depositLiabilityId,
      debit: 0,
      credit: gross,
      memo: 'Customer deposit',
    });
    return postFromSource({
      tenantId: payment.tenant_id,
      sourceType: 'payment',
      sourceId: payment.id,
      date: payment.date,
      memo: `Payment #${payment.id} (Customer deposit)`,
      lines,
      userId,
      transaction,
    });
  }

  const revenueId = settings.default_revenue_account_id;
  const vatOutId = settings.output_vat_account_id;
  if (!revenueId) return null;

  let net = gross;
  let vat = 0;
  if (settings.vat_enabled && vatOutId) {
    const split = splitInclusiveVat(gross, settings.vat_rate);
    net = split.net;
    vat = split.vat;
  }

  lines.push({ account_id: revenueId, debit: 0, credit: net, memo: 'Service revenue' });
  if (vat > 0 && vatOutId) {
    lines.push({ account_id: vatOutId, debit: 0, credit: vat, memo: 'VAT output' });
  }

  return postFromSource({
    tenantId: payment.tenant_id,
    sourceType: 'payment',
    sourceId: payment.id,
    date: payment.date,
    memo: `Payment #${payment.id}`,
    lines,
    userId,
    transaction,
  });
}

/** Void the posted GL journal for this payment (if any). No-op when none exists. */
async function voidPaymentGl(payment, {
  userId = null, reason = null, transaction = null,
} = {}) {
  if (!payment?.tenant_id || payment.id == null) return null;
  return voidJournalBySource({
    tenantId: payment.tenant_id,
    sourceType: 'payment',
    sourceId: payment.id,
    userId,
    reason: reason || `Payment #${payment.id} voided`,
    transaction,
  });
}

/**
 * Void the existing GL journal for this payment (if any) and post again from the
 * payment's current state. Atomic: if the re-post fails the void is rolled back.
 */
async function repostPaymentToGl(payment, opts = {}) {
  const { userId = null, reason = null, transaction: outerTx = null } = opts;
  const run = async (transaction) => {
    await voidPaymentGl(payment, {
      userId,
      reason: reason || `Payment #${payment.id} updated (repost)`,
      transaction,
    });
    return postPaymentToGl(payment, { ...opts, transaction });
  };
  if (outerTx) return run(outerTx);
  return sequelize.transaction(run);
}

module.exports = {
  postPaymentToGl,
  voidPaymentGl,
  repostPaymentToGl,
  tenderToAccountId,
  buildTenderDebitLines,
};
