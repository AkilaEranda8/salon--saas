'use strict';

const { money } = require('../balance');
const { splitInclusiveVat } = require('../vat');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

function tenderToAccountId(method, settings) {
  const m = String(method || 'Cash').toLowerCase();
  if (m.includes('cash')) return settings.default_cash_account_id;
  if (m.includes('card') || m.includes('bank') || m.includes('online') || m.includes('transfer')) {
    return settings.default_bank_account_id || settings.default_cash_account_id;
  }
  // Loyalty / package — treat as revenue contra via cash for simplicity (no cash movement)
  return settings.default_cash_account_id;
}

async function postPaymentToGl(payment, { tenant, splits = [], userId = null, transaction = null } = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const settings = await getSettings(payment.tenant_id, { transaction });
  if (!settings?.auto_post_payments) return null;
  if (String(payment.status) !== 'paid') return null;
  if (payment.is_advance) return null;

  const gross = money(payment.total_amount);
  if (!(gross > 0)) return null;

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

  const lines = [];
  const tenderRows = Array.isArray(splits) && splits.length
    ? splits
    : [{ method: 'Cash', amount: gross }];

  const tenderTotal = money(tenderRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0));
  const scale = tenderTotal > 0 ? gross / tenderTotal : 1;

  for (const row of tenderRows) {
    const amt = money(parseFloat(row.amount || 0) * scale);
    if (!(amt > 0)) continue;
    const acct = tenderToAccountId(row.method, settings);
    if (!acct) continue;
    lines.push({ account_id: acct, debit: amt, credit: 0, memo: row.method || 'Tender' });
  }

  // If no tender lines resolved, debit cash
  if (!lines.length) {
    lines.push({
      account_id: settings.default_cash_account_id,
      debit: gross,
      credit: 0,
      memo: 'Cash',
    });
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

module.exports = { postPaymentToGl, tenderToAccountId };
