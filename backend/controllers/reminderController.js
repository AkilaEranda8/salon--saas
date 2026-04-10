const { Reminder, Branch } = require('../models');
const { notifyBranch } = require('../services/fcmService');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const getBranchWhere = (req) => {
  const where = tenantWhere(req);
  if (req.userBranchId)    where.branch_id = req.userBranchId;
  else if (req.query.branchId) where.branch_id = req.query.branchId;
  return where;
};

const list = async (req, res) => {
  try {
    const where = getBranchWhere(req);
    if (req.query.done !== undefined) where.is_done = req.query.done === 'true';
    if (req.query.type) where.type = req.query.type;

    const rows = await Reminder.findAll({
      where,
      order: [['is_done', 'ASC'], ['priority', 'ASC'], ['due_date', 'ASC']],
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { title, type, priority, due_date } = req.body;
    const branch_id = req.body.branch_id || req.userBranchId || req.user?.branchId;
    if (!branch_id || !title) return res.status(400).json({ message: 'branch_id and title are required.' });
    if (req.userBranchId && Number(branch_id) !== Number(req.userBranchId)) {
      return res.status(403).json({ message: 'You can only create reminders for your branch.' });
    }

    const reminder = await Reminder.create({ branch_id, title, type, priority, due_date, tenant_id: resolveTenantId(req) });

    // Push to all branch staff
    const dueLine = due_date ? ` — Due ${due_date}` : '';
    const typeEmoji = { general: '📝', inventory: '📦', staff: '👤', customer: '👥' };
    const emoji = typeEmoji[type] || '📝';
    notifyBranch(branch_id, `${emoji} New Reminder`, `${title}${dueLine}`, {
      type: 'new_reminder',
      reminder_id: String(reminder.id),
      branch_id:   String(branch_id),
    });

    return res.status(201).json(reminder);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({ where: byIdWhere(req, req.params.id) });
    if (!reminder) return res.status(404).json({ message: 'Reminder not found.' });

    await reminder.update(req.body);
    return res.json(reminder);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const toggle = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({ where: byIdWhere(req, req.params.id) });
    if (!reminder) return res.status(404).json({ message: 'Reminder not found.' });

    await reminder.update({ is_done: !reminder.is_done });
    return res.json(reminder);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({ where: byIdWhere(req, req.params.id) });
    if (!reminder) return res.status(404).json({ message: 'Reminder not found.' });

    await reminder.destroy();
    return res.json({ message: 'Reminder deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, create, update, toggle, remove };
