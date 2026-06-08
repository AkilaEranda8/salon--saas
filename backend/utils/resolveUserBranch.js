const { Op } = require('sequelize');
const { Staff, User, Branch } = require('../models');
const { tenantWhere } = require('./tenantScope');

const STAFF_LINK_ROLES = new Set(['staff', 'manager']);

function normalizeKey(value) {
  return `${value ?? ''}`.trim().toLowerCase();
}

function candidateNameKeys(user, req) {
  const keys = new Set();
  const add = (v) => {
    const k = normalizeKey(v);
    if (k) keys.add(k);
  };
  add(user?.name);
  add(user?.username);
  add(req?.user?.name);
  add(req?.user?.username);
  const raw = `${req?.user?.username ?? user?.username ?? ''}`.trim();
  if (raw.includes('__')) add(raw.split('__').pop());
  return keys;
}

/**
 * Resolve portal users.id from JWT (db_user_id) or username (Keycloak preferred_username).
 */
async function resolveDbUserId(req) {
  if (req.user?.id) return req.user.id;

  const raw = `${req.user?.username ?? ''}`.trim();
  if (!raw) return null;

  const scope = tenantWhere(req);
  const baseWhere = { is_active: true, ...scope };

  let user = await User.findOne({
    where: { username: raw, ...baseWhere },
    attributes: ['id'],
  });
  if (!user && raw.includes('__')) {
    const short = raw.split('__').pop();
    if (short) {
      user = await User.findOne({
        where: { username: short, ...baseWhere },
        attributes: ['id'],
      });
    }
  }
  return user?.id ?? null;
}

/**
 * Find (and optionally link) the Staff row for the logged-in portal user.
 */
async function resolveStaffRecordForRequest(req, { autoLink = true } = {}) {
  const scope = tenantWhere(req);
  const userId = await resolveDbUserId(req);
  if (!userId) return null;

  const staffInclude = [
    { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
  ];

  const linked = await Staff.findOne({
    where: { user_id: userId, ...scope },
    attributes: ['id', 'name', 'branch_id', 'user_id', 'email'],
    include: staffInclude,
  });
  if (linked) return linked;

  const user = await User.findOne({
    where: { id: userId, ...scope },
    attributes: ['id', 'name', 'username', 'email', 'branch_id', 'role'],
  });
  if (!user) return null;

  const role = normalizeKey(user.role);
  if (!STAFF_LINK_ROLES.has(role)) return null;

  const nameKeys = candidateNameKeys(user, req);
  const emailKey = normalizeKey(user.email);
  if (!nameKeys.size && !emailKey) return null;

  const branchFilter = user.branch_id ? { branch_id: user.branch_id } : {};

  const pool = await Staff.findAll({
    where: { ...scope, is_active: true, ...branchFilter },
    attributes: ['id', 'name', 'branch_id', 'user_id', 'email'],
    include: staffInclude,
    limit: 100,
  });

  const takenIds = new Set(
    pool
      .map((r) => r.user_id)
      .filter((id) => id != null && Number(id) !== Number(userId)),
  );
  let blockedIds = new Set();
  if (takenIds.size) {
    const owners = await User.findAll({
      where: { id: { [Op.in]: [...takenIds] } },
      attributes: ['id'],
    });
    blockedIds = new Set(owners.map((o) => Number(o.id)));
  }

  const matches = pool.filter((row) => {
    const uid = row.user_id != null ? Number(row.user_id) : null;
    if (uid != null && uid !== Number(userId) && blockedIds.has(uid)) return false;

    const staffName = normalizeKey(row.name);
    const staffEmail = normalizeKey(row.email);
    if (nameKeys.has(staffName)) return true;
    if (emailKey && staffEmail && emailKey === staffEmail) return true;
    return false;
  });

  let match = null;
  if (matches.length === 1) {
    match = matches[0];
  } else if (matches.length > 1) {
    const prefer = normalizeKey(user.name) || normalizeKey(user.username);
    match = matches.find((r) => normalizeKey(r.name) === prefer) || null;
  }

  if (!match) return null;

  if (autoLink) {
    await match.update({ user_id: user.id });
    if (!user.branch_id && match.branch_id) {
      await user.update({ branch_id: match.branch_id });
    }
  }

  return match;
}

/**
 * Staff.id for the logged-in portal user (staff.user_id link, with name/email fallback).
 */
async function linkedStaffIdForRequest(req) {
  const staff = await resolveStaffRecordForRequest(req);
  return staff?.id ?? null;
}

/**
 * Primary branch from the Staff row linked to a portal user (set when staff is added via API).
 */
async function primaryBranchIdFromStaffUser(user, tenantId) {
  if (!user?.id) return null;

  const where = { user_id: user.id };
  if (tenantId != null) where.tenant_id = tenantId;

  const staff = await Staff.findOne({
    where,
    attributes: ['branch_id'],
  });

  const bid = staff?.branch_id;
  if (bid == null || bid === '') return null;
  const n = Number(bid);
  return Number.isFinite(n) ? n : null;
}

/** Branch id for manager/staff when JWT has no branch_id claim. */
async function primaryBranchIdForRequest(req) {
  const staff = await resolveStaffRecordForRequest(req, { autoLink: false });
  if (staff?.branch_id != null) {
    const n = Number(staff.branch_id);
    if (Number.isFinite(n)) return n;
  }

  const userId = await resolveDbUserId(req);
  if (!userId) return null;
  return primaryBranchIdFromStaffUser({ id: userId }, req.userTenantId ?? req.user?.tenantId);
}

module.exports = {
  resolveDbUserId,
  resolveStaffRecordForRequest,
  linkedStaffIdForRequest,
  primaryBranchIdFromStaffUser,
  primaryBranchIdForRequest,
};
