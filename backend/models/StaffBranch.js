const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Many-to-many: staff can work at multiple branches. */
const StaffBranch = sequelize.define(
  'StaffBranch',
  {
    staff_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    branch_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'staff_branches',
    timestamps: true,
    underscored: false,
  },
);

module.exports = StaffBranch;
