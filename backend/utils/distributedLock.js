/**
 * Acquire Redis lock helper used by workers / reminders.
 */
'use strict';

const { getRedis, cacheKey } = require('./redis');

/**
 * @param {string} name
 * @param {number} ttlSec
 * @param {Function} fn
 */
async function withDistributedLock(name, ttlSec, fn) {
  const redis = getRedis();
  if (!redis) {
    return { skipped: true, reason: 'redis_unavailable' };
  }
  const key = cacheKey(0, 'lock', name);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const ok = await redis.set(key, token, 'EX', ttlSec, 'NX');
  if (!ok) return { skipped: true, reason: 'lock_held' };
  try {
    return await fn();
  } finally {
    try {
      const cur = await redis.get(key);
      if (cur === token) await redis.del(key);
    } catch { /* ignore */ }
  }
}

module.exports = { withDistributedLock };
