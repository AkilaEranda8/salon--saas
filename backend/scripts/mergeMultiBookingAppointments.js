/**
 * Merge old multi-booking siblings (N one-service appointments) into ONE.
 *
 * Targets unpaid pending/confirmed rows that share customer + date + branch
 * and were created within a short window (default 30s) — typical of the old
 * staff/web "Multiple bookings" flow that posted items[] as separate rows.
 *
 * Usage:
 *   node scripts/mergeMultiBookingAppointments.js --tenant-slug=salon-larvendo --dry-run
 *   node scripts/mergeMultiBookingAppointments.js --tenant-slug=salon-larvendo --confirm
 *   node scripts/mergeMultiBookingAppointments.js --tenant-slug=salon-larvendo --include-paid --confirm
 *   node scripts/mergeMultiBookingAppointments.js --tenant-id=3 --confirm --window-sec=60
 *   node scripts/mergeMultiBookingAppointments.js --all-tenants --dry-run
 *
 * Default: unpaid pending/confirmed only.
 * --include-paid: also merge completed/in_service clusters; re-point payments to survivor.
 */
'use strict';

require('dotenv').config();

const { Op, Transaction } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Tenant,
  Appointment,
  AppointmentService,
  Service,
  Payment,
  PackageRedemption,
  InvConsumption,
  CrmFollowUpJob,
} = require('../models');

const EXTRA_PREFIX = 'Additional services:';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
const allTenants = args.includes('--all-tenants');
const includePaid = args.includes('--include-paid');
const slugArg = args.find((a) => a.startsWith('--tenant-slug='));
const idArg = args.find((a) => a.startsWith('--tenant-id='));
const windowArg = args.find((a) => a.startsWith('--window-sec='));
const sinceArg = args.find((a) => a.startsWith('--since='));
const tenantSlug = slugArg ? slugArg.split('=')[1] : null;
const tenantIdArg = idArg ? Number(idArg.split('=')[1]) : null;
const windowSec = windowArg ? Math.max(5, Number(windowArg.split('=')[1]) || 30) : 30;
const sinceDate = sinceArg ? String(sinceArg.split('=')[1]).trim() : null;

function normPhone(p) {
  return String(p || '').replace(/\D/g, '').replace(/^0+/, '');
}

function customerKey(row) {
  if (row.customer_id) return `c:${row.customer_id}`;
  const phone = normPhone(row.phone);
  const name = String(row.customer_name || '').trim().toLowerCase();
  if (phone) return `p:${phone}|${name}`;
  return `n:${name}|b:${row.branch_id}|d:${row.date}`;
}

function toMinutes(t) {
  const s = String(t || '').slice(0, 5);
  const [h, m] = s.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function stripExtraLine(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(EXTRA_PREFIX))
    .join('\n')
    .trim();
}

function buildNotes(baseNotes, extraNames) {
  const base = stripExtraLine(baseNotes);
  const extras = (extraNames || []).filter(Boolean);
  const extraLine = extras.length ? `${EXTRA_PREFIX} ${extras.join(', ')}` : '';
  return [base, extraLine].filter(Boolean).join('\n') || null;
}

async function ensureJunction() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS appointment_services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id INT NOT NULL,
      service_id INT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NULL,
      updated_at DATETIME NULL,
      UNIQUE KEY uniq_appt_service (appointment_id, service_id),
      KEY idx_appt (appointment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function loadTenants() {
  if (allTenants) {
    return Tenant.findAll({ attributes: ['id', 'slug', 'name'], raw: true });
  }
  if (tenantIdArg) {
    const t = await Tenant.findByPk(tenantIdArg, { attributes: ['id', 'slug', 'name'], raw: true });
    return t ? [t] : [];
  }
  const slug = tenantSlug || 'salon-larvendo';
  const t = await Tenant.findOne({ where: { slug }, attributes: ['id', 'slug', 'name'], raw: true });
  return t ? [t] : [];
}

async function serviceCountMap(apptIds) {
  if (!apptIds.length) return new Map();
  const rows = await AppointmentService.findAll({
    where: { appointment_id: { [Op.in]: apptIds } },
    attributes: ['appointment_id', 'service_id'],
    raw: true,
  });
  const map = new Map();
  for (const r of rows) {
    const id = Number(r.appointment_id);
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(Number(r.service_id));
  }
  return map;
}

async function hardBlockedIds(apptIds) {
  const blocked = new Set();
  if (!apptIds.length) return blocked;

  const [redemptions, consumptions] = await Promise.all([
    PackageRedemption.findAll({
      where: { appointment_id: { [Op.in]: apptIds } },
      attributes: ['appointment_id'],
      raw: true,
    }),
    InvConsumption.findAll({
      where: { appointment_id: { [Op.in]: apptIds } },
      attributes: ['appointment_id'],
      raw: true,
    }),
  ]);
  for (const r of [...redemptions, ...consumptions]) {
    if (r.appointment_id) blocked.add(Number(r.appointment_id));
  }
  return blocked;
}

async function paidIds(apptIds) {
  const paid = new Set();
  if (!apptIds.length) return paid;
  const payments = await Payment.findAll({
    where: { appointment_id: { [Op.in]: apptIds } },
    attributes: ['appointment_id'],
    raw: true,
  });
  for (const r of payments) {
    if (r.appointment_id) paid.add(Number(r.appointment_id));
  }
  return paid;
}

function clusterByCreatedAt(rows, maxGapMs) {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      || Number(a.id) - Number(b.id),
  );
  const clusters = [];
  let cur = [];
  for (const row of sorted) {
    if (!cur.length) {
      cur = [row];
      continue;
    }
    const prev = cur[cur.length - 1];
    const gap = new Date(row.createdAt).getTime() - new Date(prev.createdAt).getTime();
    if (gap <= maxGapMs) {
      cur.push(row);
    } else {
      if (cur.length >= 2) clusters.push(cur);
      cur = [row];
    }
  }
  if (cur.length >= 2) clusters.push(cur);
  return clusters;
}

async function mergeGroup(group, serviceById, svcMap) {
  const ordered = [...group].sort((a, b) => {
    const ta = toMinutes(a.time) ?? 0;
    const tb = toMinutes(b.time) ?? 0;
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });
  const survivor = ordered[0];
  const losers = ordered.slice(1);

  const serviceIds = [];
  for (const appt of ordered) {
    const fromMap = svcMap.get(Number(appt.id));
    if (fromMap && fromMap.size) {
      for (const sid of fromMap) {
        if (!serviceIds.includes(sid)) serviceIds.push(sid);
      }
    } else {
      const sid = Number(appt.service_id);
      if (sid && !serviceIds.includes(sid)) serviceIds.push(sid);
    }
  }

  const amount = ordered.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const primary = serviceIds[0] || Number(survivor.service_id);
  const extraNames = serviceIds
    .slice(1)
    .map((id) => serviceById.get(id)?.name)
    .filter(Boolean);
  const notes = buildNotes(survivor.notes, extraNames);
  const staffId = survivor.staff_id
    || losers.find((a) => a.staff_id)?.staff_id
    || null;

  const statusRank = {
    completed: 5,
    in_service: 4,
    confirmed: 3,
    pending: 2,
    cancelled: 0,
    no_show: 0,
  };
  const bestStatus = ordered.reduce((best, a) => {
    const s = String(a.status || 'pending');
    return (statusRank[s] || 0) >= (statusRank[best] || 0) ? s : best;
  }, String(survivor.status || 'pending'));

  const summary = {
    survivor_id: survivor.id,
    merge_ids: losers.map((a) => a.id),
    customer: survivor.customer_name,
    date: survivor.date,
    time: String(survivor.time).slice(0, 5),
    service_ids: serviceIds,
    amount,
    status: bestStatus,
  };

  if (dryRun) return summary;

  const tx = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
  });
  try {
    await survivor.update({
      service_id: primary,
      amount,
      notes,
      staff_id: staffId,
      status: bestStatus,
      customer_id: survivor.customer_id || losers.find((a) => a.customer_id)?.customer_id || null,
      phone: survivor.phone || losers.find((a) => a.phone)?.phone || null,
    }, { transaction: tx });

    await AppointmentService.destroy({
      where: { appointment_id: survivor.id },
      transaction: tx,
    });
    await AppointmentService.bulkCreate(
      serviceIds.map((sid, idx) => ({
        appointment_id: survivor.id,
        service_id: sid,
        sort_order: idx,
      })),
      { transaction: tx },
    );

    const loserIds = losers.map((a) => a.id);
    await AppointmentService.destroy({
      where: { appointment_id: { [Op.in]: loserIds } },
      transaction: tx,
    });
    // Re-point payments / CRM onto survivor before deleting siblings
    await Payment.update(
      { appointment_id: survivor.id },
      { where: { appointment_id: { [Op.in]: loserIds } }, transaction: tx },
    );
    if (CrmFollowUpJob) {
      await CrmFollowUpJob.update(
        { appointment_id: survivor.id },
        { where: { appointment_id: { [Op.in]: loserIds } }, transaction: tx },
      ).catch(() => {});
    }
    await Appointment.destroy({
      where: { id: { [Op.in]: loserIds } },
      transaction: tx,
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return summary;
}

async function processTenant(tenant) {
  console.log(`\n=== Tenant ${tenant.slug || tenant.id} (${tenant.name || ''}) ===`);
  const statuses = includePaid
    ? ['pending', 'confirmed', 'in_service', 'completed']
    : ['pending', 'confirmed'];
  const where = {
    tenant_id: tenant.id,
    status: { [Op.in]: statuses },
  };
  if (sinceDate) {
    where.date = { [Op.gte]: sinceDate };
  }

  const rows = await Appointment.findAll({
    where,
    order: [['date', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
  });
  if (!rows.length) {
    console.log('No matching appointments.');
    return { groups: 0, merged: 0, skipped: 0 };
  }

  const apptIds = rows.map((r) => Number(r.id));
  const [svcMap, hardBlocked, paid, services] = await Promise.all([
    serviceCountMap(apptIds),
    hardBlockedIds(apptIds),
    paidIds(apptIds),
    Service.findAll({
      where: { tenant_id: tenant.id },
      attributes: ['id', 'name', 'duration_minutes', 'price'],
      raw: true,
    }),
  ]);
  const serviceById = new Map(services.map((s) => [Number(s.id), s]));

  // Single-service rows only. Skip package/inventory links always.
  // Skip paid rows unless --include-paid.
  const candidates = rows.filter((r) => {
    const id = Number(r.id);
    if (hardBlocked.has(id)) return false;
    if (!includePaid && paid.has(id)) return false;
    const linked = svcMap.get(id);
    const count = linked ? linked.size : 1;
    return count <= 1;
  });

  // Bucket by branch + date + customer (old multi-book could use different staff per line)
  const buckets = new Map();
  for (const row of candidates) {
    const key = `${row.branch_id}|${row.date}|${customerKey(row)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const maxGapMs = windowSec * 1000;
  const used = new Set();
  const groups = [];

  for (const list of buckets.values()) {
    const free = list.filter((r) => !used.has(Number(r.id)));
    if (free.length < 2) continue;
    for (const cluster of clusterByCreatedAt(free, maxGapMs)) {
      const ids = cluster.map((c) => Number(c.id));
      if (ids.some((id) => used.has(id))) continue;
      // Need at least 2 distinct services, or 2+ rows created together
      const sids = new Set();
      for (const a of cluster) {
        const linked = svcMap.get(Number(a.id));
        if (linked && linked.size) linked.forEach((x) => sids.add(x));
        else if (a.service_id) sids.add(Number(a.service_id));
      }
      if (cluster.length < 2) continue;
      if (sids.size < 2 && cluster.length < 2) continue;
      groups.push(cluster);
      ids.forEach((id) => used.add(id));
    }
  }

  let merged = 0;
  let skipped = 0;
  for (const group of groups) {
    try {
      const summary = await mergeGroup(group, serviceById, svcMap);
      merged += 1;
      console.log(
        `${dryRun ? '[dry-run]' : '[merged]'} keep #${summary.survivor_id}`
        + ` ← delete [${summary.merge_ids.join(', ')}]`
        + ` | ${summary.customer} ${summary.date} ${summary.time}`
        + ` | services=[${summary.service_ids.join(',')}] amount=${summary.amount}`,
      );
    } catch (err) {
      skipped += 1;
      console.error('[skip]', group.map((g) => g.id).join(','), err.message);
    }
  }

  console.log(`Groups: ${groups.length}, ${dryRun ? 'would merge' : 'merged'}: ${merged}, errors: ${skipped}`);
  return { groups: groups.length, merged, skipped };
}

(async () => {
  await sequelize.authenticate();
  await ensureJunction();
  const tenants = await loadTenants();
  if (!tenants.length) {
    console.error('No tenant found. Pass --tenant-slug=… or --tenant-id=… or --all-tenants');
    process.exit(1);
  }
  console.log(dryRun
    ? 'DRY RUN (pass --confirm to apply).'
    : 'APPLYING merges (--confirm).');
  console.log(
    `Window: ${windowSec}s | since: ${sinceDate || 'all dates'}`
    + ` | includePaid=${includePaid}`,
  );

  let total = 0;
  for (const t of tenants) {
    const r = await processTenant(t);
    total += r.merged;
  }
  console.log(`\nDone. ${dryRun ? 'Would merge' : 'Merged'} ${total} group(s).`);
  await sequelize.close();
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
