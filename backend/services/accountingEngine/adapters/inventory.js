'use strict';

const { money } = require('../balance');
const { getSettings } = require('../coa');
const { postFromSource } = require('../posting');
const { hasTenantFeature } = require('../../../utils/tenantFeatures');

function tenderCreditAccount(paymentMethod, settings, hasSupplier) {
  const m = String(paymentMethod || '').toLowerCase();
  if (m.includes('cash')) return settings.default_cash_account_id;
  if (m.includes('card') || m.includes('bank') || m.includes('online') || m.includes('transfer')) {
    return settings.default_bank_account_id || settings.default_cash_account_id;
  }
  if (hasSupplier) {
    return settings.default_ap_account_id || settings.default_cash_account_id;
  }
  return settings.default_cash_account_id;
}

/**
 * Goods receipt (GRN): Dr Inventory, Cr AP / cash / bank.
 *
 * Supports both call shapes used by controllers:
 *   postGoodsReceiptToGl(grn, { totalCost, tenant, ... })
 *   postGoodsReceiptToGl(grn, items[], { tenant, paymentMethod, ... })
 */
async function postGoodsReceiptToGl(grn, itemsOrOpts = {}, maybeOpts = {}) {
  const itemsAreArray = Array.isArray(itemsOrOpts);
  const opts = itemsAreArray ? (maybeOpts || {}) : (itemsOrOpts || {});
  const items = itemsAreArray ? itemsOrOpts : null;

  const {
    tenant = null,
    totalCost = null,
    paymentMethod = null,
    supplierName = null,
    userId = null,
    transaction = null,
  } = opts;

  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  if (!grn?.tenant_id) return null;

  const settings = await getSettings(grn.tenant_id, { transaction });
  if (!settings) return null;

  let amount = money(totalCost);
  if (!(amount > 0) && items?.length) {
    amount = money(items.reduce((sum, it) => {
      const qty = parseFloat(it.quantity_received ?? it.quantity ?? 0) || 0;
      const cost = parseFloat(it.unit_cost ?? it.cost ?? 0) || 0;
      return sum + (qty * cost);
    }, 0));
  }
  if (!(amount > 0)) return null;

  const inventoryId = settings.default_inventory_account_id;
  const creditId = tenderCreditAccount(paymentMethod, settings, Boolean(grn.supplier_id));
  if (!inventoryId || !creditId) return null;

  const creditMemo = paymentMethod
    ? String(paymentMethod)
    : (grn.supplier_id
      ? (supplierName ? `AP: ${supplierName}` : 'Accounts payable')
      : 'Cash purchase');

  const lines = [
    {
      account_id: inventoryId,
      debit: amount,
      credit: 0,
      memo: `GRN ${grn.grn_number || grn.id}`,
    },
    {
      account_id: creditId,
      debit: 0,
      credit: amount,
      memo: creditMemo,
    },
  ];

  return postFromSource({
    tenantId: grn.tenant_id,
    sourceType: 'goods_receipt',
    sourceId: grn.id,
    date: grn.received_date,
    memo: `Goods receipt #${grn.id}${grn.grn_number ? ` (${grn.grn_number})` : ''}`,
    lines,
    userId,
    transaction,
  });
}

/**
 * Stock consumption / day-end usage: Dr COGS, Cr Inventory.
 */
async function postConsumptionToGl({
  tenant = null,
  tenantId = null,
  sourceId,
  date,
  totalCost = 0,
  memo = null,
  userId = null,
  transaction = null,
} = {}) {
  if (!tenant || !hasTenantFeature(tenant, 'accounting')) return null;
  const tid = tenantId || tenant?.id;
  if (!tid || sourceId == null) return null;

  const settings = await getSettings(tid, { transaction });
  if (!settings) return null;

  const amount = money(totalCost);
  if (!(amount > 0)) return null;

  const cogsId = settings.default_cogs_account_id || settings.default_expense_account_id;
  const inventoryId = settings.default_inventory_account_id;
  if (!cogsId || !inventoryId) return null;

  return postFromSource({
    tenantId: tid,
    sourceType: 'inv_consumption',
    sourceId,
    date,
    memo: memo || `Inventory consumption #${sourceId}`,
    lines: [
      { account_id: cogsId, debit: amount, credit: 0, memo: 'COGS' },
      { account_id: inventoryId, debit: 0, credit: amount, memo: 'Inventory' },
    ],
    userId,
    transaction,
  });
}

module.exports = { postGoodsReceiptToGl, postConsumptionToGl };
