'use strict';
/**
 * Ensures supplier/reorder columns on inventory table exist.
 * Adds: supplier_name, supplier_contact, reorder_qty, notes
 */
const { sequelize } = require('../config/database');

let _ran = false;

async function ensureInventorySupplierColumns() {
  if (_ran) return;
  try {
    const [cols] = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory'",
    );
    const existing = new Set(cols.map((c) => c.COLUMN_NAME));

    const ddl = [];
    if (!existing.has('supplier_name'))
      ddl.push("ADD COLUMN `supplier_name` VARCHAR(150) NULL AFTER `sell_price`");
    if (!existing.has('supplier_contact'))
      ddl.push("ADD COLUMN `supplier_contact` VARCHAR(100) NULL AFTER `supplier_name`");
    if (!existing.has('reorder_qty'))
      ddl.push("ADD COLUMN `reorder_qty` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `supplier_contact`");
    if (!existing.has('notes'))
      ddl.push("ADD COLUMN `notes` TEXT NULL AFTER `reorder_qty`");

    if (ddl.length) {
      await sequelize.query(`ALTER TABLE inventory ${ddl.join(', ')}`);
      console.log('[ensureInventorySupplierColumns] Added columns:', ddl.map((d) => d.replace(/^ADD COLUMN /, '').split(' ')[0]).join(', '));
    }
    _ran = true;
  } catch (err) {
    console.error('[ensureInventorySupplierColumns] Error:', err.message);
  }
}

module.exports = { ensureInventorySupplierColumns };
