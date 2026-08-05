'use strict';

const { resolveTenantId } = require('../utils/tenantScope');
const svc = require('../services/crmAutomationService');
const { AUTOMATION_CATALOG } = require('../services/crmAutomationCatalog');

function tid(req) {
  return resolveTenantId(req);
}

/** GET /api/crm/automations/dashboard */
const dashboard = async (req, res) => {
  try {
    const data = await svc.getDashboard(tid(req));
    return res.json(data);
  } catch (err) {
    console.error('[crm-automations] dashboard', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** GET /api/crm/automations */
const list = async (req, res) => {
  try {
    const rows = await svc.listAutomations(tid(req));
    return res.json({
      data: rows,
      catalog: AUTOMATION_CATALOG.map((c) => ({
        type: c.type,
        name: c.name,
        description: c.description,
      })),
    });
  } catch (err) {
    console.error('[crm-automations] list', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** GET /api/crm/automations/history */
const history = async (req, res) => {
  try {
    const data = await svc.listHistory(tid(req), {
      page: req.query.page,
      limit: req.query.limit,
      automationId: req.query.automation_id || req.query.automationId || null,
      status: req.query.status || null,
    });
    return res.json(data);
  } catch (err) {
    console.error('[crm-automations] history', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** GET /api/crm/automations/:id */
const getOne = async (req, res) => {
  try {
    const row = await svc.getAutomation(tid(req), req.params.id);
    if (!row) return res.status(404).json({ message: 'Automation not found' });
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/** POST /api/crm/automations */
const create = async (req, res) => {
  try {
    const row = await svc.createAutomation(tid(req), req.body || {}, req.user?.id || null);
    return res.status(201).json(row);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/** PUT /api/crm/automations/:id */
const update = async (req, res) => {
  try {
    const row = await svc.updateAutomation(tid(req), req.params.id, req.body || {}, req.user?.id || null);
    return res.json(row);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/** DELETE /api/crm/automations/:id */
const remove = async (req, res) => {
  try {
    const result = await svc.deleteAutomation(tid(req), req.params.id, req.user?.id || null);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

/** POST /api/crm/automations/:id/run */
const runNow = async (req, res) => {
  try {
    const result = await svc.enqueueRun(tid(req), req.params.id, {
      actorId: req.user?.id || null,
      customerId: req.body?.customer_id || req.body?.customerId || null,
      source: 'manual_run_now',
      segment: req.body?.segment || null,
    });
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

module.exports = {
  dashboard,
  list,
  history,
  getOne,
  create,
  update,
  remove,
  runNow,
};
