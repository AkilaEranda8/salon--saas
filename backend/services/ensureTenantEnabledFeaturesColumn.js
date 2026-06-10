const { sequelize } = require('../config/database');

async function ensureTenantEnabledFeaturesColumn() {
  const qi = sequelize.getQueryInterface();
  const tableDesc = await qi.describeTable('tenants');
  if (!tableDesc.enabled_features) {
    await qi.addColumn('tenants', 'enabled_features', {
      type: require('sequelize').DataTypes.JSON,
      allowNull: true,
      comment: 'Platform-admin per-tenant module toggles',
    });
    console.log('[migration] tenants.enabled_features added');
  }
}

module.exports = { ensureTenantEnabledFeaturesColumn };
