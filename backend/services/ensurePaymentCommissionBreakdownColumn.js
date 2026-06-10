const { sequelize } = require('../config/database');

async function ensurePaymentCommissionBreakdownColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('payments');
    if (!tableDesc.commission_breakdown) {
      await qi.addColumn('payments', 'commission_breakdown', {
        type: require('sequelize').DataTypes.JSON,
        allowNull: true,
        comment: 'Line-by-line commission calculation snapshot',
      });
      console.log('[migration] payments.commission_breakdown added');
    }
  } catch (err) {
    console.error('[migration] ensurePaymentCommissionBreakdownColumn error:', err.message);
  }
}

module.exports = ensurePaymentCommissionBreakdownColumn;
