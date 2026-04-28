const { CommissionPayout, Staff, Branch, User } = require('../models');
const { tenantWhere, byIdWhere } = require('../utils/tenantScope');

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId)        where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const list = async (req, res) => {
  try {
    const where = getBranchWhere(req);
    if (req.query.staffId) where.staff_id = req.query.staffId;
    if (req.query.month)   where.month    = req.query.month;

    const rows = await CommissionPayout.findAll({
      where,
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      include: [
        { model: Staff,  as: 'staff',  attributes: ['id', 'name'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
        { model: User,   as: 'paidBy', attributes: ['id', 'name'], required: false },
      ],
    });

    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { staff_id, branch_id, amount, date, month, notes } = req.body;
    if (!staff_id || !amount || !date || !month) {
      return res.status(400).json({ message: 'staff_id, amount, date and month are required.' });
    }

    const effectiveBranchId = req.userBranchId || branch_id;
    if (!effectiveBranchId) {
      return res.status(400).json({ message: 'branch_id is required.' });
    }

    const payout = await CommissionPayout.create({
      staff_id,
      branch_id: effectiveBranchId,
      amount,
      date,
      month,
      notes: notes || null,
      paid_by:   req.user?.id || null,
      tenant_id: req.tenantId  || null,
    });

    const result = await CommissionPayout.findOne({
      where: { id: payout.id },
      include: [
        { model: Staff,  as: 'staff',  attributes: ['id', 'name'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const payout = await CommissionPayout.findOne({ where: byIdWhere(req, req.params.id) });
    if (!payout) return res.status(404).json({ message: 'Payout not found.' });
    await payout.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, create, remove };
