const apiStats = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  byMethod: {},
  byStatus: {},
  recent: [],
};

const RECENT_LIMIT = 100;

// Strip query strings to avoid logging sensitive token/search params
function sanitizePath(url = '') {
  try {
    const idx = url.indexOf('?');
    return idx === -1 ? url : url.substring(0, idx);
  } catch (_) {
    return url;
  }
}

function apiMonitorMiddleware(req, res, next) {
  const started = Date.now();
  apiStats.totalRequests += 1;
  apiStats.byMethod[req.method] = (apiStats.byMethod[req.method] || 0) + 1;

  res.on('finish', () => {
    const statusKey = String(res.statusCode);
    apiStats.byStatus[statusKey] = (apiStats.byStatus[statusKey] || 0) + 1;

    apiStats.recent.push({
      at:         new Date().toISOString(),
      method:     req.method,
      path:       sanitizePath(req.originalUrl || req.url),
      status:     res.statusCode,
      durationMs: Date.now() - started,
    });

    if (apiStats.recent.length > RECENT_LIMIT) {
      apiStats.recent.splice(0, apiStats.recent.length - RECENT_LIMIT);
    }
  });

  next();
}

function getApiMonitoringSnapshot() {
  return {
    ...apiStats,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - new Date(apiStats.startedAt).getTime()) / 1000)),
    recent: [...apiStats.recent],
    byMethod: { ...apiStats.byMethod },
    byStatus: { ...apiStats.byStatus },
  };
}

module.exports = { apiMonitorMiddleware, getApiMonitoringSnapshot };
