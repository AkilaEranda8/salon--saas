const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

async function ensureFranchiseCommissionSchema() {
  try {
    const qi = sequelize.getQueryInterface();

    try {
      const branchDesc = await qi.describeTable('branches');
      if (!branchDesc.manager_commission_percent) {
        await qi.addColumn('branches', 'manager_commission_percent', {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true,
          comment: 'Branch manager override commission % of total service amount',
        });
        console.log('[migration] branches.manager_commission_percent added');
      }
    } catch (e) {
      if (!/no such table|doesn't exist/i.test(e.message)) throw e;
    }

    try {
      const tenantDesc = await qi.describeTable('tenants');
      if (!tenantDesc.default_manager_commission_percent) {
        await qi.addColumn('tenants', 'default_manager_commission_percent', {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: true,
          comment: 'Tenant-wide default manager override % when branch % not set',
        });
        console.log('[migration] tenants.default_manager_commission_percent added');
      }
    } catch (e) {
      if (!/no such table|doesn't exist/i.test(e.message)) throw e;
    }

    const tables = await qi.showAllTables();
    const hasTable = tables.some((t) => String(t).toLowerCase() === 'commission_transactions');
    if (!hasTable) {
      await qi.createTable('commission_transactions', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        tenant_id: { type: DataTypes.INTEGER, allowNull: false },
        payment_id: { type: DataTypes.INTEGER, allowNull: false },
        branch_id: { type: DataTypes.INTEGER, allowNull: true },
        transaction_type: {
          type: DataTypes.ENUM('worker', 'manager_override'),
          allowNull: false,
        },
        worker_staff_id: { type: DataTypes.INTEGER, allowNull: true },
        manager_staff_id: { type: DataTypes.INTEGER, allowNull: true },
        service_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        commission_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
        commission_amount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        breakdown: { type: DataTypes.JSON, allowNull: true },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      console.log('[migration] commission_transactions table created');
    }
  } catch (err) {
    console.error('[migration] ensureFranchiseCommissionSchema error:', err.message);
  }
}

module.exports = ensureFranchiseCommissionSchema;
