const { Op, fn, col } = require('sequelize');
const { Attendance, Staff, Branch } = require('../models');

const list = async (req, res) => {
  try {
    const where = {};
    if (req.query.staffId) where.staff_id = req.query.staffId;
    if (req.query.date)    where.date     = req.query.date;

    // Month filter
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last  = new Date(year, month, 0).getDate();
      where.date  = { [Op.between]: [start, `${year}-${month}-${last}`] };
    }

    const staffWhere = {};
    if (req.userBranchId) staffWhere.branch_id = req.userBranchId;
    else if (req.query.branchId) staffWhere.branch_id = req.query.branchId;

    const rows = await Attendance.findAll({
      where,
      order: [['date', 'DESC']],
      include: [{
        model: Staff,
        as: 'staff',
        where: Object.keys(staffWhere).length ? staffWhere : undefined,
        attributes: ['id', 'name', 'branch_id'],
        include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
      }],
    });

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const upsert = async (req, res) => {
  try {
    const { staff_id, date, check_in, check_out, status, note } = req.body;
    if (!staff_id || !date) return res.status(400).json({ message: 'staff_id and date are required.' });

    const [record, created] = await Attendance.findOrCreate({
      where: { staff_id, date },
      defaults: { check_in, check_out, status, note },
    });

    if (!created) {
      const updates = {};
      if (check_in  !== undefined) updates.check_in  = check_in;
      if (check_out !== undefined) updates.check_out = check_out;
      if (status    !== undefined) updates.status    = status;
      if (note      !== undefined) updates.note      = note;
      await record.update(updates);
    }

    return res.status(created ? 201 : 200).json(record);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const record = await Attendance.findByPk(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found.' });

    await record.update(req.body);
    return res.json(record);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const summary = async (req, res) => {
  try {
    const staffWhere = {};
    if (req.userBranchId) staffWhere.branch_id = req.userBranchId;
    else if (req.query.branchId) staffWhere.branch_id = req.query.branchId;

    const where = {};
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last  = new Date(year, month, 0).getDate();
      where.date  = { [Op.between]: [start, `${year}-${month}-${last}`] };
    }

    const rows = await Attendance.findAll({
      where,
      attributes: [
        'staff_id',
        'status',
        [fn('COUNT', col('Attendance.id')), 'count'],
      ],
      group: ['staff_id', 'status'],
      include: [{
        model: Staff,
        as: 'staff',
        attributes: ['id', 'name'],
        where: Object.keys(staffWhere).length ? staffWhere : undefined,
      }],
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, upsert, update, summary };
