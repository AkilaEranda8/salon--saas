'use strict';

/** Remaining sessions on a customer package row (null = unlimited). */
function getSessionsRemaining(cp) {
  const total = cp?.sessions_total ?? cp?.getDataValue?.('sessions_total');
  const used = cp?.sessions_used ?? cp?.getDataValue?.('sessions_used') ?? 0;
  if (total === null || total === undefined || Number(total) === 0) return null;
  return Math.max(0, Number(total) - Number(used));
}

function withSessionsRemaining(cp) {
  const json = typeof cp.toJSON === 'function' ? cp.toJSON() : { ...cp };
  json.sessions_remaining = getSessionsRemaining(cp);
  return json;
}

function hasSessionsLeft(cp) {
  const left = getSessionsRemaining(cp);
  return left == null || left > 0;
}

module.exports = { getSessionsRemaining, withSessionsRemaining, hasSessionsLeft };
