const { sequelize } = require('../config/database');

async function ensureServiceCommissionColumns() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('services');

    if (!tableDesc.commission_type) {
      await qi.addColumn('services', 'commission_type', {
        type: require('sequelize').DataTypes.ENUM('percentage', 'fixed'),
        allowNull: true,
        after: 'price',
      });
      console.log('[migration] services.commission_type added');
    }

    if (!tableDesc.commission_value) {
      await qi.addColumn('services', 'commission_value', {
        type: require('sequelize').DataTypes.DECIMAL(10, 2),
        allowNull: true,
        after: 'commission_type',
      });
      console.log('[migration] services.commission_value added');
    }
  } catch (err) {
    console.error('[migration] ensureServiceCommissionColumns error:', err.message);
  }
}

module.exports = ensureServiceCommissionColumns;
