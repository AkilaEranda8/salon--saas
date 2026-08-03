const { Op, fn, col } = require('sequelize');
const { Attendance, Staff, Branch } = require('../models');
const { tenantWhere } = require('../utils/tenantScope');
const { resolveStaffRecordForRequest } = require('../utils/resolveUserBranch');
const {
  requiresGpsForWrite,
  assertWithinBranchGeofence,
} = require('../utils/attendanceGeo');
const {
  resolveAttendanceSchedule,
  applyScheduleStatus,
  buildScheduleWindow,
} = require('../utils/attendanceSchedule');
const { normalizeWorkingHours } = require('../utils/staffSchedule');

function isTeamAttendanceRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'superadmin' || r === 'admin' || r === 'manager';
}

function roleOf(req) {
  return req.user?.role || req.userRole || '';
}

async function assertCanWriteStaffAttendance(req, staffId) {
  if (isTeamAttendanceRole(roleOf(req))) return null;
  const linked = await resolveStaffRecordForRequest(req);
  if (!linked) {
    return { status: 403, message: 'No staff profile linked to this account.' };
  }
  if (Number(linked.id) !== Number(staffId)) {
    return { status: 403, message: 'You can only mark your own attendance.' };
  }
  return null;
}

/**
 * Enforce salon GPS geofence for self check-in / present / late.
 * Managers/admins can override (team marking from office).
 */
async function assertAttendanceGeo(req, staffId, body) {
  if (isTeamAttendanceRole(roleOf(req))) return null;
  if (!requiresGpsForWrite(body)) return null;

  const staff = await Staff.findOne({
    where: { id: staffId, ...tenantWhere(req) },
    attributes: ['id', 'branch_id'],
  });
  if (!staff?.branch_id) {
    return { status: 400, message: 'Staff has no branch assigned.' };
  }

  const branch = await Branch.findOne({
    where: { id: staff.branch_id, ...tenantWhere(req) },
    attributes: ['id', 'name', 'latitude', 'longitude', 'attendance_radius_m'],
  });
  if (!branch) return { status: 404, message: 'Branch not found.' };

  const denied = assertWithinBranchGeofence(branch, {
    latitude: body.latitude ?? body.lat,
    longitude: body.longitude ?? body.lng ?? body.lon,
  });
  return denied;
}

async function loadStaffForAttendance(req, staffId) {
  return Staff.findOne({
    where: { id: staffId, ...tenantWhere(req) },
    attributes: ['id', 'name', 'branch_id', 'working_hours'],
    include: [{
      association: 'offDays',
      attributes: ['id', 'date', 'reason'],
      required: false,
    }],
  });
}

function attachScheduleToStaffJson(staffJson, dateStr) {
  if (!staffJson || !dateStr) return staffJson;
  const off = (staffJson.offDays || staffJson.off_days || []).find(
    (d) => String(d.date).slice(0, 10) === String(dateStr).slice(0, 10)
  );
  const schedule = buildScheduleWindow(staffJson.working_hours, dateStr, off || null);
  return {
    ...staffJson,
    working_hours: normalizeWorkingHours(staffJson.working_hours),
    schedule,
  };
}

const list = async (req, res) => {
  try {
    const where = tenantWhere(req);
    if (req.query.staffId) where.staff_id = req.query.staffId;
    if (req.query.date) where.date = req.query.date;

    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last = new Date(year, month, 0).getDate();
      where.date = { [Op.between]: [start, `${year}-${month}-${last}`] };
    }

    // Staff self-service: force own records unless team role
    if (!isTeamAttendanceRole(roleOf(req))) {
      const linked = await resolveStaffRecordForRequest(req);
      if (!linked) return res.json([]);
      where.staff_id = linked.id;
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
        attributes: ['id', 'name', 'branch_id', 'working_hours'],
        include: [
          {
            model: Branch,
            as: 'branch',
            attributes: ['id', 'name', 'latitude', 'longitude', 'attendance_radius_m'],
          },
          {
            association: 'offDays',
            attributes: ['id', 'date', 'reason'],
            required: false,
            ...(req.query.date ? { where: { date: req.query.date } } : {}),
          },
        ],
      }],
    });

    const data = rows.map((row) => {
      const json = row.toJSON();
      if (json.staff) {
        json.staff = attachScheduleToStaffJson(json.staff, json.date);
        json.schedule = json.staff.schedule;
      }
      return json;
    });

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const upsert = async (req, res) => {
  try {
    const {
      staff_id, date, check_in, check_out, status, note,
      latitude, longitude, lat, lng, lon,
    } = req.body;
    if (!staff_id || !date) {
      return res.status(400).json({ message: 'staff_id and date are required.' });
    }

    const denied = await assertCanWriteStaffAttendance(req, staff_id);
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const geoDenied = await assertAttendanceGeo(req, staff_id, {
      status, check_in, check_out,
      latitude: latitude ?? lat,
      longitude: longitude ?? lng ?? lon,
    });
    if (geoDenied) {
      return res.status(geoDenied.status).json({
        message: geoDenied.message,
        code: geoDenied.code,
        distance_m: geoDenied.distance_m,
        radius_m: geoDenied.radius_m,
      });
    }

    const tenantId = req.userTenantId ?? req.user?.tenantId ?? null;

    const staff = await loadStaffForAttendance(req, staff_id);
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    const schedule = await resolveAttendanceSchedule(staff, date, tenantId);
    let nextStatus = status;
    let nextCheckIn = check_in;

    // Link working hours → late detection when checking in as present/late
    if (nextStatus === 'present' || nextStatus === 'late' || nextCheckIn) {
      const applied = applyScheduleStatus({
        status: nextStatus || 'present',
        check_in: nextCheckIn,
        schedule,
      });
      nextStatus = applied.status;
    }

    const [record, created] = await Attendance.findOrCreate({
      where: { staff_id, date, tenant_id: tenantId },
      defaults: {
        check_in: nextCheckIn,
        check_out,
        status: nextStatus,
        note,
        tenant_id: tenantId,
      },
    });

    if (!created) {
      const updates = {};
      if (check_in !== undefined) updates.check_in = check_in;
      if (check_out !== undefined) updates.check_out = check_out;
      if (note !== undefined) updates.note = note;

      const effectiveCheckIn = check_in !== undefined ? check_in : record.check_in;
      let effectiveStatus = status !== undefined ? status : record.status;
      if (
        (effectiveStatus === 'present' || effectiveStatus === 'late')
        && (status !== undefined || check_in !== undefined)
      ) {
        effectiveStatus = applyScheduleStatus({
          status: effectiveStatus,
          check_in: effectiveCheckIn,
          schedule,
        }).status;
        updates.status = effectiveStatus;
      } else if (status !== undefined) {
        updates.status = status;
      }

      await record.update(updates);
    }

    const json = record.toJSON();
    json.schedule = schedule;
    return res.status(created ? 201 : 200).json(json);
  } catch (err) {
    console.error('attendance upsert error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const where = { id: req.params.id, ...tenantWhere(req) };
    const record = await Attendance.findOne({ where });
    if (!record) return res.status(404).json({ message: 'Attendance record not found.' });

    const denied = await assertCanWriteStaffAttendance(req, record.staff_id);
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const {
      check_in, check_out, status, note,
      latitude, longitude, lat, lng, lon,
    } = req.body;

    const geoDenied = await assertAttendanceGeo(req, record.staff_id, {
      status, check_in, check_out,
      latitude: latitude ?? lat,
      longitude: longitude ?? lng ?? lon,
    });
    if (geoDenied) {
      return res.status(geoDenied.status).json({
        message: geoDenied.message,
        code: geoDenied.code,
        distance_m: geoDenied.distance_m,
        radius_m: geoDenied.radius_m,
      });
    }

    const tenantId = req.userTenantId ?? req.user?.tenantId ?? record.tenant_id ?? null;
    const staff = await loadStaffForAttendance(req, record.staff_id);
    const schedule = staff
      ? await resolveAttendanceSchedule(staff, record.date, tenantId)
      : null;

    const updates = {};
    if (check_in !== undefined) updates.check_in = check_in;
    if (check_out !== undefined) updates.check_out = check_out;
    if (note !== undefined) updates.note = note;

    const effectiveCheckIn = check_in !== undefined ? check_in : record.check_in;
    let effectiveStatus = status !== undefined ? status : record.status;

    if (
      schedule
      && (effectiveStatus === 'present' || effectiveStatus === 'late')
      && (status !== undefined || check_in !== undefined)
    ) {
      effectiveStatus = applyScheduleStatus({
        status: effectiveStatus,
        check_in: effectiveCheckIn,
        schedule,
      }).status;
    }
    if (status !== undefined || (check_in !== undefined && (record.status === 'present' || record.status === 'late'))) {
      updates.status = effectiveStatus;
    }

    await record.update(updates);
    const json = record.toJSON();
    json.schedule = schedule;
    return res.json(json);
  } catch (err) {
    console.error('attendance update error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const summary = async (req, res) => {
  try {
    if (!isTeamAttendanceRole(roleOf(req))) {
      return res.status(403).json({ message: 'Attendance summary is for managers.' });
    }

    const staffWhere = {};
    if (req.userBranchId) staffWhere.branch_id = req.userBranchId;
    else if (req.query.branchId) staffWhere.branch_id = req.query.branchId;

    const where = { ...tenantWhere(req) };
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      const start = `${year}-${month}-01`;
      const last = new Date(year, month, 0).getDate();
      where.date = { [Op.between]: [start, `${year}-${month}-${last}`] };
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
        where: Object.keys(staffWhere).length
          ? { ...tenantWhere(req), ...staffWhere }
          : { ...tenantWhere(req) },
      }],
    });

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, upsert, update, summary };
