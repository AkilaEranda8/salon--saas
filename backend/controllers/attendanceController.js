const { Op, fn, col } = require('sequelize');
const { Attendance, Staff, Branch } = require('../models');
const { tenantWhere } = require('../utils/tenantScope');
const { resolveStaffRecordForRequest } = require('../utils/resolveUserBranch');
const {
  requiresGpsForWrite,
  assertWithinBranchGeofence,
} = require('../utils/attendanceGeo');

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
        attributes: ['id', 'name', 'branch_id'],
        include: [{
          model: Branch,
          as: 'branch',
          attributes: ['id', 'name', 'latitude', 'longitude', 'attendance_radius_m'],
        }],
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

    const staff = await Staff.findOne({
      where: { id: staff_id, ...tenantWhere(req) },
      attributes: ['id'],
    });
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    const [record, created] = await Attendance.findOrCreate({
      where: { staff_id, date, tenant_id: tenantId },
      defaults: { check_in, check_out, status, note, tenant_id: tenantId },
    });

    if (!created) {
      const updates = {};
      if (check_in !== undefined) updates.check_in = check_in;
      if (check_out !== undefined) updates.check_out = check_out;
      if (status !== undefined) updates.status = status;
      if (note !== undefined) updates.note = note;
      await record.update(updates);
    }

    return res.status(created ? 201 : 200).json(record);
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

    const updates = {};
    if (check_in !== undefined) updates.check_in = check_in;
    if (check_out !== undefined) updates.check_out = check_out;
    if (status !== undefined) updates.status = status;
    if (note !== undefined) updates.note = note;
    await record.update(updates);
    return res.json(record);
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
