const { Op } = require('sequelize');

/**
 * Sequelize `where` for Staff: primary branch_id matches OR linked via staff_branches.
 */
async function staffWhereForBranch(branchId) {
  if (branchId == null || branchId === '') return {};
  const bid = parseInt(branchId, 10);
  if (Number.isNaN(bid)) return {};

  const { StaffBranch } = require('../models');
  const rows = await StaffBranch.findAll({
    where: { branch_id: bid },
    attributes: ['staff_id'],
    raw: true,
  });
  const extraIds = [...new Set(rows.map((r) => r.staff_id))];
  const or = [{ branch_id: bid }];
  if (extraIds.length) or.push({ id: { [Op.in]: extraIds } });
  return { [Op.or]: or };
}

async function staffBelongsToBranch(staffId, branchId) {
  if (branchId == null || branchId === '') return true;
  const bid = parseInt(branchId, 10);
  if (Number.isNaN(bid)) return false;

  const { Staff, StaffBranch } = require('../models');
  const staff = await Staff.findByPk(staffId, { attributes: ['id', 'branch_id'] });
  if (!staff) return false;
  if (Number(staff.branch_id) === bid) return true;
  const n = await StaffBranch.count({ where: { staff_id: staffId, branch_id: bid } });
  return n > 0;
}

module.exports = { staffWhereForBranch, staffBelongsToBranch };
