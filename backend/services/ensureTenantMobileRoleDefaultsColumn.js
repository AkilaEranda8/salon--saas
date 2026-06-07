const { sequelize } = require('../config/database');

async function ensureTenantMobileRoleDefaultsColumn() {
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable('tenants');

    if (!tableDesc.mobile_role_defaults) {
      await qi.addColumn('tenants', 'mobile_role_defaults', {
        type: require('sequelize').DataTypes.JSON,
        allowNull: true,
        after: 'helapay_notify_url',
      });
      console.log('[migration] tenants.mobile_role_defaults added');
    }
  } catch (err) {
    console.error('[migration] ensureTenantMobileRoleDefaultsColumn error:', err.message);
  }
}

module.exports = ensureTenantMobileRoleDefaultsColumn;
