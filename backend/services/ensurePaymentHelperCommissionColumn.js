const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

async function ensurePaymentHelperCommissionColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('payments');

    if (!tableDesc.helper_commission) {
      await qi.addColumn('payments', 'helper_commission', {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Helper staff commission split taken from main worker commission',
      });
      console.log('[migration] payments.helper_commission added');
    }
  } catch (err) {
    console.error('[migration] ensurePaymentHelperCommissionColumn error:', err.message);
  }
}

module.exports = ensurePaymentHelperCommissionColumn;
