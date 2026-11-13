'use strict';

const { money } = require('../balance');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { voidJournalBySource } = require('../journal');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

function tenderAccountId(method, settings) {
  const m = String(method || 'Cash').toLowerCase();
  if (m.includes('card') || m.includes('bank') || m.includes('online') || m.includes('transfer')) {
    return settings.default_bank_account_id || settings.default_cash_account_id;
  }
  return settings.default_cash_account_id;
}

/**
 * Package / membership sale: Dr cash/bank, Cr full gross to unearned liability.
 * Do NOT recognize VAT here — redemption (payment with Package tender) posts
 * Dr liability / Cr revenue+VAT, so splitting VAT at sale would double-count.
 */
async function postPackagePurchaseToGl(customerPackage, {
  tenant = null, userId = null, transaction = null,
} = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  if (!customerPackage?.tenant_id) return null;

  const settings = await getSettings(customerPackage.tenant_id, { transaction });
  if (!settings?.auto_post_payments) return null;

  const gross = money(customerPackage.amount_paid);
  if (!(gross > 0)) return null;

  const cashAcct = tenderAccountId(customerPackage.payment_method, settings);
  const liabilityId = settings.default_package_liability_id;
  if (!cashAcct || !liabilityId) return null;

  const lines = [
    {
      account_id: cashAcct,
      debit: gross,
      credit: 0,
      memo: customerPackage.payment_method || 'Cash',
    },
    {
      account_id: liabilityId,
      debit: 0,
      credit: gross,
      memo: 'Unearned package',
    },
  ];

  return postFromSource({
    tenantId: customerPackage.tenant_id,
    sourceType: 'package_sale',
    sourceId: customerPackage.id,
    date: customerPackage.purchase_date,
    memo: `Package sale #${customerPackage.id}`,
    lines,
    userId,
    transaction,
  });
}

async function voidPackageSaleGl(customerPackage, {
  userId = null, reason = null, transaction = null,
} = {}) {
  if (!customerPackage?.tenant_id || customerPackage.id == null) return null;
  return voidJournalBySource({
    tenantId: customerPackage.tenant_id,
    sourceType: 'package_sale',
    sourceId: customerPackage.id,
    userId,
    reason: reason || `Package sale #${customerPackage.id} voided`,
    transaction,
  });
}

module.exports = {
  postPackagePurchaseToGl,
  postPackageSaleToGl: postPackagePurchaseToGl,
  voidPackageSaleGl,
};
