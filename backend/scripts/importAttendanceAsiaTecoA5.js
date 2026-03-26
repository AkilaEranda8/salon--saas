/**
 * Import attendance data exported from Asia-Teco A5 biometric devices.
 *
 * Supported input formats (examples):
 * 1) Format 1 (with explicit status)
 *    UserID,Date,Time,Status
 *    101,2026-03-25,08:30:12,IN
 *    101,2026-03-25,17:45:55,OUT
 *
 * 2) Format 2 (status codes)
 *    RecordID,UserID,Date,Time,Code
 *    1,101,2026-03-25,08:30,0
 *    1,101,2026-03-25,17:45,1
 *    where: 0 => check-in, 1 => check-out
 *
 * 3) Format 3 (no explicit status)
 *    UserID,Date Time
 *    101,2026-03-25 08:30:12
 *    101,2026-03-25 17:45:55
 *
 * NOTE: This script writes directly to the DB (no auth).
 * Run it inside the backend container so it can access the DB.
 */

const fs = require('fs');
const path = require('path');

const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Attendance, Staff } = require('../models');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeDate(d) {
  // Accept: YYYY-MM-DD or YYYY/MM/DD
  const s = String(d || '').trim();
  if (!s) return null;
  const iso = s.replace(/\//g, '-');
  // If date came like "2026-3-5" normalize by Date parsing then reformat.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const dt = new Date(iso + 'T00:00:00');
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return iso;
}

function normalizeTime(t) {
  // Accept: HH:mm or HH:mm:ss
  const s = String(t || '').trim();
  if (!s) return null;
  const clean = s.replace(/"/g, '').replace(/'/g, '');
  const parts = clean.split(':');
  if (parts.length === 2) {
    const [hh, mm] = parts;
    return `${String(parseInt(hh, 10)).padStart(2, '0')}:${String(parseInt(mm, 10)).padStart(2, '0')}:00`;
  }
  if (parts.length >= 3) {
    const [hh, mm, ss] = parts;
    return `${String(parseInt(hh, 10)).padStart(2, '0')}:${String(parseInt(mm, 10)).padStart(2, '0')}:${String(parseInt(ss, 10)).padStart(2, '0')}`;
  }
  return null;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return hh * 60 + mm;
}

function parseStatus(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  // Status codes (Format 2)
  if (s === '0') return 'in';
  if (s === '1') return 'out';
  // Common strings (Format 1)
  if (s === 'IN' || s === 'CHECK-IN' || s === 'CHECKIN') return 'in';
  if (s === 'OUT' || s === 'CHECK-OUT' || s === 'CHECKOUT') return 'out';
  return null;
}

function splitColumns(line) {
  // Accept: CSV (comma), TSV (tab), semicolon.
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.includes('\t')) return trimmed.split('\t');
  if (trimmed.includes(';')) return trimmed.split(';');
  if (trimmed.includes(',')) return trimmed.split(',');
  // Last resort: whitespace-separated exports
  return trimmed.split(/\s+/);
}

function parseLine(line) {
  const cols = splitColumns(line);
  // Skip headers / junk lines
  if (!cols.length) return null;
  const joined = cols.join(' ').toLowerCase();
  if (joined.includes('userid') && joined.includes('date')) return null;
  if (joined.includes('status')) return null;

  // Try detect common patterns by column count
  // Format 1: UserID,Date,Time,Status  (4 cols)
  if (cols.length === 4) {
    const userId = cols[0];
    const date = normalizeDate(cols[1]);
    const time = normalizeTime(cols[2]);
    const status = parseStatus(cols[3]);
    if (!userId || !date || !time) return null;
    return { userId: String(userId).trim(), date, time, status };
  }

  // Format 2: RecordID,UserID,Date,Time,Code (5 cols)
  if (cols.length === 5) {
    const userId = cols[1];
    const date = normalizeDate(cols[2]);
    const time = normalizeTime(cols[3]);
    const status = parseStatus(cols[4]);
    if (!userId || !date || !time) return null;
    return { userId: String(userId).trim(), date, time, status };
  }

  // Format 3: UserID,DateTime (2 cols)
  if (cols.length === 2) {
    const userId = cols[0];
    const dateTime = String(cols[1] || '').trim();
    // dateTime can be: "2026-03-25 08:30:12" or "2026/03/25 08:30"
    const dtParts = dateTime.split(/\s+/);
    if (dtParts.length < 2) return null;
    const date = normalizeDate(dtParts[0]);
    const time = normalizeTime(dtParts[1]);
    if (!userId || !date || !time) return null;
    return { userId: String(userId).trim(), date, time, status: null };
  }

  // Sometimes devices output 3 cols: userId, date, time (no status)
  if (cols.length === 3) {
    const userId = cols[0];
    const date = normalizeDate(cols[1]);
    // Some exports put time in cols[2] as "08:30" or "08:30:12"
    const time = normalizeTime(cols[2]);
    if (!userId || !date || !time) return null;
    return { userId: String(userId).trim(), date, time, status: null };
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  if (!file) {
    console.error('Usage: node importAttendanceAsiaTecoA5.js --file /path/export.txt [--userIdMapJson ./map.json] [--lateAfter 09:00] [--dryRun]');
    process.exit(1);
  }

  const lateAfter = args.lateAfter ? normalizeTime(args.lateAfter) : null; // "09:00" supported
  const lateAfterMin = lateAfter ? timeToMinutes(lateAfter) : null;

  const dryRun = Boolean(args.dryRun);

  let userIdMap = null;
  if (args.userIdMapJson) {
    const mapPath = path.isAbsolute(args.userIdMapJson) ? args.userIdMapJson : path.join(process.cwd(), args.userIdMapJson);
    userIdMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }

  const rawText = fs.readFileSync(file, 'utf8');
  const lines = rawText.split(/\r?\n/).filter(Boolean);

  const entries = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    entries.push(parsed);
  }

  if (!entries.length) {
    console.error('No valid attendance lines found in file.');
    process.exit(1);
  }

  // Deduplicate exact records
  const seen = new Set();
  const deduped = [];
  for (const e of entries) {
    const key = `${e.userId}|${e.date}|${e.time}|${e.status || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  // Group: userId + date
  const groups = new Map();
  for (const e of deduped) {
    const key = `${e.userId}|${e.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  // Validate staff ids (optional but helpful). We'll build a set of staff ids used.
  const staffIdsToLoad = new Set();
  const getStaffId = (userId) => {
    if (userIdMap && userIdMap[userId] !== undefined) return Number(userIdMap[userId]);
    // Default assumption: machine UserID == system Staff.id
    return Number(userId);
  };
  for (const [k] of groups.entries()) {
    const [userId] = k.split('|');
    const staffId = getStaffId(userId);
    if (Number.isFinite(staffId)) staffIdsToLoad.add(staffId);
  }

  const staffRows = await Staff.findAll({
    where: { id: { [Op.in]: [...staffIdsToLoad] } },
    attributes: ['id', 'name', 'branch_id'],
    raw: true,
  });
  const staffSet = new Set(staffRows.map(r => Number(r.id)));

  const toUpsert = [];
  for (const [key, groupEntries] of groups.entries()) {
    const [userId, date] = key.split('|');
    const staffId = getStaffId(userId);
    if (!Number.isFinite(staffId) || !staffSet.has(staffId)) continue;
    const sorted = [...groupEntries].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    const hasExplicit = sorted.some(e => e.status === 'in' || e.status === 'out');

    let check_in = null;
    let check_out = null;

    if (hasExplicit) {
      const ins = sorted.filter(e => e.status === 'in');
      const outs = sorted.filter(e => e.status === 'out');
      if (ins.length) check_in = ins.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0].time;
      if (outs.length) check_out = outs.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)).slice(-1)[0].time;

      // Fallback if one side missing
      if (!check_in) check_in = sorted[0]?.time || null;
      if (!check_out) check_out = sorted.slice(-1)[0]?.time || null;
    } else {
      check_in = sorted[0]?.time || null;
      check_out = sorted.length >= 2 ? sorted.slice(-1)[0].time : null;
    }

    if (!check_in) continue;

    let status = 'present';
    if (lateAfterMin !== null && lateAfterMin !== undefined) {
      const inMin = timeToMinutes(check_in);
      if (inMin !== null && inMin > lateAfterMin) status = 'late';
    }

    const note = 'Imported from Asia-Teco A5 (USB export)';
    toUpsert.push({ staffId, date, check_in, check_out, status, note });
  }

  console.log(`Parsed entries: ${deduped.length}`);
  console.log(`Groups: ${groups.size}`);
  console.log(`Will upsert attendance records: ${toUpsert.length}`);

  if (dryRun) {
    console.log('Dry run enabled. No DB writes performed.');
    process.exit(0);
  }

  let created = 0;
  let updated = 0;

  for (const r of toUpsert) {
    const [record, wasCreated] = await Attendance.findOrCreate({
      where: { staff_id: r.staffId, date: r.date },
      defaults: {
        check_in: r.check_in,
        check_out: r.check_out,
        status: r.status,
        note: r.note,
      },
    });

    if (wasCreated) {
      created++;
    } else {
      await record.update({
        check_in: r.check_in,
        check_out: r.check_out,
        status: r.status,
        note: r.note,
      });
      updated++;
    }
  }

  await sequelize.close();
  console.log(`Done. Created: ${created}, Updated: ${updated}`);
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  try {
    await sequelize.close();
  } catch (_) {}
  process.exit(1);
});

