'use strict';

const { sequelize } = require('../config/database');

/**
 * Expense categories were a fixed ENUM — allow custom labels as VARCHAR.
 * Idempotent: safe on every boot.
 */
async function ensureExpenseCategoryFlexible() {
  try {
    const [rows] = await sequelize.query(`
      SELECT DATA_TYPE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'expenses'
        AND COLUMN_NAME = 'category'
      LIMIT 1
    `);
    const col = rows?.[0];
    if (!col) return;
    const dataType = String(col.DATA_TYPE || '').toLowerCase();
    if (dataType === 'enum' || String(col.COLUMN_TYPE || '').toLowerCase().startsWith('enum')) {
      await sequelize.query(
        'ALTER TABLE `expenses` MODIFY COLUMN `category` VARCHAR(80) NOT NULL'
      );
      console.log('[Schema] expenses.category ENUM → VARCHAR(80)');
    }
  } catch (e) {
    console.warn('[Schema] expenses.category:', e.message);
  }
}

module.exports = ensureExpenseCategoryFlexible;
