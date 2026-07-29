const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

async function ensureTenantDocsPageColumn() {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('tenants');

  if (!table.docs_page_enabled) {
    await queryInterface.addColumn('tenants', 'docs_page_enabled', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Controls public API and WordPress plugin documentation access',
    });
    console.log('[migration] tenants.docs_page_enabled added');
  }
}

module.exports = { ensureTenantDocsPageColumn };
