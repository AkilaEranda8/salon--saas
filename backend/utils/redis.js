/**
 * Shared Redis client (optional — null when REDIS_URL not set / unreachable).
 */
'use strict';

const Redis = require('ioredis');

let client = null;
let connectAttempted = false;

function getRedis() {
  if (client) return client;
  if (connectAttempted) return client;

  const url = process.env.REDIS_URL || '';
  if (!url) {
    connectAttempted = true;
    return null;
  }

  connectAttempted = true;
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', (err) => {
      // Avoid crashing API on Redis blips
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[redis]', err.message);
      }
    });
  } catch (err) {
    console.warn('[redis] init failed:', err.message);
    client = null;
  }
  return client;
}

function cacheKey(tenantId, ...parts) {
  return ['t', tenantId == null ? '0' : String(tenantId), ...parts.map(String)].join(':');
}

module.exports = { getRedis, cacheKey };
