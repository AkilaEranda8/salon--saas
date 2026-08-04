'use strict';

const { CrmAiRule } = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const { listActiveRules, formatRulesForPrompt } = require('../services/crmRulesService');

const CATEGORIES = ['behavior', 'booking', 'handoff', 'pricing', 'language', 'custom'];

const DEFAULT_RULES = [
  {
    title: 'This salon only',
    category: 'behavior',
    priority: 110,
    body: 'Only use this salon\'s services, staff, prices, customers, and knowledge. Never mention or invent data from another salon. If asked about another business, say you can only help with this salon.',
  },
  {
    title: 'Reply in customer language',
    category: 'language',
    priority: 100,
    body: 'Detect and reply in the customer\'s language (English or Sinhala). Keep tone friendly and professional.',
  },
  {
    title: 'Never invent prices',
    category: 'pricing',
    priority: 95,
    body: 'Do not invent prices, discounts, or packages. Only use amounts from salon tools or knowledge base. If unknown, say a staff member can confirm.',
  },
  {
    title: 'Booking keyword',
    category: 'booking',
    priority: 90,
    body: 'When the customer wants to book, guide them to say "book" or "book appointment" so the booking flow can collect service, staff, date, and time.',
  },
  {
    title: 'Short WhatsApp replies',
    category: 'behavior',
    priority: 85,
    body: 'Keep replies under 120 words. Prefer short paragraphs and bullet points suitable for WhatsApp.',
  },
  {
    title: 'Handoff on complaints',
    category: 'handoff',
    priority: 80,
    body: 'If the customer is angry, asks for a manager, reports a payment issue, or needs a complex exception, apologize briefly and say a team member will take over.',
  },
  {
    title: 'No medical advice',
    category: 'behavior',
    priority: 75,
    body: 'Do not give medical or dermatological advice. Suggest consulting salon staff in person for skin/hair concerns.',
  },
];

/** Tenant admin JWT tenant only — never trust body/query tenant_id (cross-tenant IDOR). */
function requireTenantId(req, res) {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    res.status(400).json({
      message: 'Tenant context required. Rules are private to each salon — select your salon and try again.',
    });
    return null;
  }
  return Number(tenantId);
}

const list = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const where = { tenant_id: tenantId };
    if (req.query.category) where.category = String(req.query.category).toLowerCase();
    if (req.query.active === '1') where.is_active = true;
    if (req.query.active === '0') where.is_active = false;
    const rows = await CrmAiRule.findAll({
      where,
      order: [['priority', 'DESC'], ['updatedAt', 'DESC']],
    });
    return res.json({
      data: rows,
      categories: CATEGORIES,
      tenant_id: tenantId,
      isolation: 'tenant_scoped',
    });
  } catch (err) {
    console.error('[crm-rules] list', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    // Ignore any client-supplied tenant_id — force JWT/header-resolved salon
    const { title, body, category, priority, is_active } = req.body || {};
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
    const cat = String(category || 'custom').toLowerCase();
    if (!CATEGORIES.includes(cat)) {
      return res.status(400).json({ message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    const row = await CrmAiRule.create({
      tenant_id: tenantId,
      title: String(title).slice(0, 200),
      body: String(body).slice(0, 4000),
      category: cat,
      priority: Number(priority) || 0,
      is_active: is_active !== false,
      updated_by: req.user?.id || null,
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('[crm-rules] create', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const row = await CrmAiRule.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Rule not found' });

    const allowed = ['title', 'body', 'category', 'priority', 'is_active'];
    const patch = { updated_by: req.user?.id || null };
    for (const k of allowed) {
      if (req.body[k] === undefined) continue;
      if (k === 'category') {
        const cat = String(req.body.category).toLowerCase();
        if (!CATEGORIES.includes(cat)) {
          return res.status(400).json({ message: 'Invalid category' });
        }
        patch.category = cat;
      } else if (k === 'title') {
        patch.title = String(req.body.title).slice(0, 200);
      } else if (k === 'body') {
        patch.body = String(req.body.body).slice(0, 4000);
      } else if (k === 'priority') {
        patch.priority = Number(req.body.priority) || 0;
      } else {
        patch[k] = req.body[k];
      }
    }
    // Never allow moving a rule to another tenant
    await row.update(patch);
    return res.json(row);
  } catch (err) {
    console.error('[crm-rules] update', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const row = await CrmAiRule.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Rule not found' });
    await row.destroy();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/rules/seed-defaults — add starter rules if missing by title */
const seedDefaults = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    let created = 0;
    for (const d of DEFAULT_RULES) {
      const exists = await CrmAiRule.findOne({
        where: { tenant_id: tenantId, title: d.title },
      });
      if (exists) continue;
      await CrmAiRule.create({
        tenant_id: tenantId,
        ...d,
        is_active: true,
        updated_by: req.user?.id || null,
      });
      created += 1;
    }
    const rows = await CrmAiRule.findAll({
      where: { tenant_id: tenantId },
      order: [['priority', 'DESC'], ['id', 'ASC']],
    });
    return res.json({ created, data: rows, categories: CATEGORIES, tenant_id: tenantId });
  } catch (err) {
    console.error('[crm-rules] seed', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
  seedDefaults,
  listActiveRules,
  formatRulesForPrompt,
  CATEGORIES,
  DEFAULT_RULES,
  /** Internal: active rules for ai_engine — scoped by path tenantId only */
  getRulesInternal: async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId || req.query.tenantId, 10);
      if (!tenantId || Number.isNaN(tenantId)) {
        return res.status(400).json({ message: 'tenantId required' });
      }
      const rules = await listActiveRules(tenantId);
      return res.json({
        tenant_id: tenantId,
        count: rules.length,
        isolation: 'tenant_scoped',
        rules: rules.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          category: r.category,
          priority: r.priority,
        })),
        rulesBlock: formatRulesForPrompt(rules),
      });
    } catch (err) {
      console.error('[crm-rules] internal', err);
      return res.status(500).json({ message: 'Server error' });
    }
  },
};
