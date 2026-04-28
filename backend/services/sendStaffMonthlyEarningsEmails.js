'use strict';

const { Op } = require('sequelize');
const {
  Staff,
  Payment,
  Service,
  Appointment,
  Branch,
} = require('../models');
const { staffWhereForBranch } = require('../utils/staffBranchFilter');
const { buildStaffEarningsPdfBuffer } = require('./staffEarningsPdf');
const { sendEmail } = require('./notificationService');

function padMonth(m) {
  return String(m).padStart(2, '0');
}

/** Previous calendar month (local server time). */
function previousMonthBounds() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Send monthly earnings PDF by email to each staff member who has an email.
 * @param {{ year?: number, month?: number, userRole?: string, userBranchId?: number }} opts
 * @returns {Promise<{ year: number, month: number, summary: object, results: object[] }>}
 */
async function runStaffMonthlyEarningsEmails(opts = {}) {
  let { year, month } = opts;
  if (!year || !month) {
    const p = previousMonthBounds();
    year = p.year;
    month = p.month;
  }
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('Invalid year or month.');
  }

  const userRole = opts.userRole;
  const userBranchId = opts.userBranchId != null ? Number(opts.userBranchId) : null;

  let staffWhere = { is_active: true };
  if (userRole === 'manager' && userBranchId) {
    const b = await staffWhereForBranch(userBranchId);
    staffWhere = { [Op.and]: [staffWhere, b] };
  }

  const staffRows = await Staff.findAll({
    where: staffWhere,
    include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    order: [['name', 'ASC']],
  });

  const start = `${y}-${padMonth(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${padMonth(m)}-${lastDay}`;

  const results = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const staff of staffRows) {
    const email = staff.email && String(staff.email).trim();
    if (!email) {
      skipped += 1;
      results.push({
        staffId: staff.id,
        name: staff.name,
        email: null,
        status: 'skipped',
        message: 'No email on file',
      });
      continue;
    }

    const payments = await Payment.findAll({
      where: {
        staff_id: staff.id,
        date: { [Op.between]: [start, end] },
      },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: Appointment, as: 'appointment', attributes: ['id', 'date', 'time', 'customer_name'] },
      ],
      order: [['date', 'ASC']],
    });

    const totalCommission = payments.reduce((acc, p) => acc + parseFloat(p.commission_amount || 0), 0);
    let buffer;
    try {
      buffer = await buildStaffEarningsPdfBuffer({
        staff,
        payments,
        year: y,
        month: m,
        totalCommission,
      });
    } catch (e) {
      failed += 1;
      results.push({
        staffId: staff.id,
        name: staff.name,
        email,
        status: 'failed',
        message: e.message || 'PDF error',
      });
      continue;
    }

    const label = `${new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`;
    const safeName = String(staff.name || 'staff').replace(/[^\w\-]+/g, '_').slice(0, 40);
    const filename = `Earnings_${y}-${padMonth(m)}_${safeName}.pdf`;

    const mailResult = await sendEmail({
      to: email,
      subject: `Your earnings report — ${label}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111;">
          <p>Hi <strong>${String(staff.name || '').replace(/</g, '')}</strong>,</p>
          <p>Please find your <strong>monthly earnings report</strong> (${label}) attached as a PDF.</p>
          <p style="color:#64748B;font-size:13px;">Total commission for this period: <strong>Rs. ${totalCommission.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>
          <p style="color:#64748B;font-size:12px;margin-top:24px;">— ${process.env.COMPANY_NAME || 'HEXA SALON'}</p>
        </div>`,
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
      meta: {
        customer_name: staff.name,
        event_type: 'staff_monthly_earnings',
        branch_id: staff.branch_id || null,
      },
    });

    if (mailResult?.ok) {
      sent += 1;
      results.push({
        staffId: staff.id,
        name: staff.name,
        email,
        status: 'sent',
        message: 'OK',
        lines: payments.length,
        totalCommission,
      });
    } else {
      failed += 1;
      results.push({
        staffId: staff.id,
        name: staff.name,
        email,
        status: 'failed',
        message: mailResult?.error || (mailResult?.skipped ? 'SMTP not configured' : 'Send error'),
      });
    }
  }

  return {
    year: y,
    month: m,
    period: { start, end },
    summary: { sent, skipped, failed, totalStaff: staffRows.length },
    results,
  };
}

module.exports = { runStaffMonthlyEarningsEmails, previousMonthBounds };
