/** Haversine distance in metres */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function parseCoord(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Whether this attendance write needs GPS (present / late / clock times).
 * Leave / absent can be marked remotely.
 */
function requiresGpsForWrite({ status, check_in, check_out }) {
  if (check_in != null && check_in !== '') return true;
  if (check_out != null && check_out !== '') return true;
  const s = String(status || '').toLowerCase();
  return s === 'present' || s === 'late';
}

/**
 * Validate staff GPS against branch geofence.
 * @returns {null|{ status:number, message:string, distance_m?:number, radius_m?:number }}
 */
function assertWithinBranchGeofence(branch, { latitude, longitude }, opts = {}) {
  const salonLat = parseCoord(branch?.latitude);
  const salonLng = parseCoord(branch?.longitude);
  if (salonLat == null || salonLng == null) {
    // Branch location not configured — do not block
    return null;
  }

  const userLat = parseCoord(latitude);
  const userLng = parseCoord(longitude);
  if (userLat == null || userLng == null) {
    return {
      status: 400,
      message: 'GPS location is required to mark attendance at this salon. Enable location and try again.',
      code: 'GPS_REQUIRED',
    };
  }

  if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
    return { status: 400, message: 'Invalid GPS coordinates.', code: 'GPS_INVALID' };
  }

  const radius = Math.max(30, parseInt(branch.attendance_radius_m, 10) || 150);
  const dist = Math.round(distanceMeters(userLat, userLng, salonLat, salonLng));

  if (dist > radius) {
    return {
      status: 403,
      message: `You are ${dist}m from the salon. Move within ${radius}m to mark attendance.`,
      code: 'OUTSIDE_GEOFENCE',
      distance_m: dist,
      radius_m: radius,
    };
  }

  if (opts.attachDistance) {
    return { ok: true, distance_m: dist, radius_m: radius };
  }
  return null;
}

module.exports = {
  distanceMeters,
  parseCoord,
  requiresGpsForWrite,
  assertWithinBranchGeofence,
};
