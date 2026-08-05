'use strict';

const { sequelize } = require('../config/database');
const InvProduct = require('../models/InvProduct');
const InvStockMovement = require('../models/InvStockMovement');

/**
 * Apply a stock movement atomically.
 * Consumption may reduce any non-equipment product (consumable, chemical, accessories, retail).
 */

function isUsableProductType(type) {
  return String(type || '').toLowerCase() !== 'equipment';
}

async function applyStockChange({
  product,
  delta,
  movementType,
  tenantId,
  branchId,
  userId,
  referenceType,
  referenceId,
  remarks,
  transaction,
  allowNegative = false,
}) {
  const opening = parseFloat(product.current_stock) || 0;
  let change = parseFloat(delta) || 0;

  if (movementType === 'consumption' && change < 0) {
    // Equipment is tracked but never used up. chemical / accessories / retail / consumable are all usable.
    if (String(product.product_type || '').toLowerCase() === 'equipment') {
      const err = new Error('Equipment products cannot be consumed.');
      err.status = 400;
      throw err;
    }
  }

  const closing = opening + change;
  if (!allowNegative && closing < -0.0001) {
    const err = new Error(`Insufficient stock for ${product.name}. Available: ${opening} ${product.unit}`);
    err.status = 400;
    throw err;
  }

  await product.update({ current_stock: closing }, { transaction });

  const movement = await InvStockMovement.create({
    tenant_id: tenantId,
    branch_id: branchId || product.branch_id,
    product_id: product.id,
    movement_type: movementType,
    opening_qty: opening,
    quantity_changed: change,
    closing_qty: closing,
    reference_type: referenceType || null,
    reference_id: referenceId || null,
    user_id: userId || null,
    remarks: remarks || null,
    moved_at: new Date(),
  }, { transaction });

  return { product, movement, opening, closing, change };
}

async function getProductForUpdate(productId, tenantWhere, transaction) {
  return InvProduct.findOne({
    where: { id: productId, ...tenantWhere },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

module.exports = {
  applyStockChange,
  getProductForUpdate,
  isUsableProductType,
  sequelize,
};
