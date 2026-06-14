const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

async function ensurePaymentManagerCommissionColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('payments');

    if (!tableDesc.manager_staff_id) {
      await qi.addColumn('payments', 'manager_staff_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Branch manager staff who earns oversight commission on this payment',
      });
      console.log('[migration] payments.manager_staff_id added');
    }

    if (!tableDesc.manager_commission_amount) {
      await qi.addColumn('payments', 'manager_commission_amount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
        comment: 'Manager oversight commission from other staff work',
      });
      console.log('[migration] payments.manager_commission_amount added');
    }

    if (!tableDesc.manager_commission_breakdown) {
      await qi.addColumn('payments', 'manager_commission_breakdown', {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Manager oversight commission calculation snapshot',
      });
      console.log('[migration] payments.manager_commission_breakdown added');
    }
  } catch (err) {
    console.error('[migration] ensurePaymentManagerCommissionColumns error:', err.message);
  }
}

module.exports = ensurePaymentManagerCommissionColumns;
