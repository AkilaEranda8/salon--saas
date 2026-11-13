const { CommissionPayout, Staff, Branch, User, StaffAdvance } = require('../models');
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
    const role = (req.user?.role || '').toLowerCase();
    if (role === 'staff') {
      const { linkedStaffIdForRequest } = require('../utils/resolveUserBranch');
      const staffId = await linkedStaffIdForRequest(req);
      if (!staffId) return res.json({ data: [], total: 0 });
      where.staff_id = staffId;
    } else if (req.query.staffId) {
      where.staff_id = req.query.staffId;
    }
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
      tenant_id: req.userTenantId ?? req.tenant?.id ?? null,
    });

    // Pending advances for this month are recovered against the payout (salary/commission net).
    const pendingAdvances = await StaffAdvance.findAll({
      where: { staff_id, month, status: 'pending', ...tenantWhere(req) },
    });
    const advanceCleared = pendingAdvances.reduce((s, a) => s + Number(a.amount || 0), 0);

    let accountingWarning = null;
    try {
      const { postCommissionPayoutToGl, resolveAccountingTenant } = require('../services/accountingEngine');
      const acctTenant = await resolveAccountingTenant(req);
      await postCommissionPayoutToGl(payout, {
        tenant: acctTenant,
        userId: req.user?.id,
        advanceCleared,
      });
    } catch (acctErr) {
      const { recordAccountingWarning } = require('../services/accountingEngine');
      accountingWarning = recordAccountingWarning(res, `payout #${payout.id} post`, acctErr);
    }

    if (pendingAdvances.length) {
      await StaffAdvance.update(
        { status: 'deducted' },
        { where: { id: pendingAdvances.map((a) => a.id), ...tenantWhere(req) } }
      );
    }

    const result = await CommissionPayout.findOne({
      where: { id: payout.id },
      include: [
        { model: Staff,  as: 'staff',  attributes: ['id', 'name'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
    });

    const json = result.toJSON();
    if (accountingWarning) json.accounting_warning = accountingWarning;
    return res.status(201).json(json);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const payout = await CommissionPayout.findOne({ where: byIdWhere(req, req.params.id) });
    if (!payout) return res.status(404).json({ message: 'Payout not found.' });

    // Revert advances that were auto-deducted when this payout was created
    await StaffAdvance.update(
      { status: 'pending' },
      { where: { staff_id: payout.staff_id, month: payout.month, status: 'deducted', ...tenantWhere(req) } }
    );

    let accountingWarning = null;
    try {
      const { voidJournalBySource } = require('../services/accountingEngine');
      await voidJournalBySource({
        tenantId: payout.tenant_id,
        sourceType: 'commission_payout',
        sourceId: payout.id,
        userId: req.user?.id,
        reason: `Payout #${payout.id} deleted`,
      });
    } catch (acctErr) {
      const { recordAccountingWarning } = require('../services/accountingEngine');
      accountingWarning = recordAccountingWarning(res, `payout #${payout.id} void`, acctErr);
    }

    await payout.destroy();
    return res.json({
      message: 'Deleted.',
      ...(accountingWarning ? { accounting_warning: accountingWarning } : {}),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, create, remove };
