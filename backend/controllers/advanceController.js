const { StaffAdvance, Staff, Branch, User } = require('../models');
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
    if (req.query.status)  where.status   = req.query.status;

    const rows = await StaffAdvance.findAll({
      where,
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      include: [
        { model: Staff,  as: 'staff',   attributes: ['id', 'name'] },
        { model: Branch, as: 'branch',  attributes: ['id', 'name'] },
        { model: User,   as: 'creator', attributes: ['id', 'name'], required: false },
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
    const { staff_id, branch_id, amount, date, month, reason } = req.body;
    if (!staff_id || !amount || !date || !month) {
      return res.status(400).json({ message: 'staff_id, amount, date and month are required.' });
    }

    const effectiveBranchId = req.userBranchId || branch_id;
    if (!effectiveBranchId) {
      return res.status(400).json({ message: 'branch_id is required.' });
    }

    const advance = await StaffAdvance.create({
      staff_id,
      branch_id: effectiveBranchId,
      amount,
      date,
      month,
      reason: reason || null,
      status: 'pending',
      created_by: req.user?.id || null,
      tenant_id:  req.userTenantId ?? req.tenant?.id ?? null,
    });

    const result = await StaffAdvance.findOne({
      where: { id: advance.id },
      include: [
        { model: Staff,  as: 'staff',   attributes: ['id', 'name'] },
        { model: Branch, as: 'branch',  attributes: ['id', 'name'] },
      ],
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const markDeducted = async (req, res) => {
  try {
    const advance = await StaffAdvance.findOne({ where: byIdWhere(req, req.params.id) });
    if (!advance) return res.status(404).json({ message: 'Advance not found.' });
    if (advance.status === 'deducted') {
      return res.status(400).json({ message: 'Already marked as deducted.' });
    }
    await advance.update({ status: 'deducted' });
    return res.json(advance);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const advance = await StaffAdvance.findOne({ where: byIdWhere(req, req.params.id) });
    if (!advance) return res.status(404).json({ message: 'Advance not found.' });
    await advance.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, create, markDeducted, remove };
