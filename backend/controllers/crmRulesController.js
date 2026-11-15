'use strict';

const { Op } = require('sequelize');
const { CrmAiRule } = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const { listActiveRules, formatRulesForPrompt } = require('../services/crmRulesService');

const CATEGORIES = ['behavior', 'booking', 'handoff', 'pricing', 'language', 'hours', 'custom'];

const CATEGORY_META = {
  behavior: { label: 'Behavior', hint: 'Tone, length, listing style' },
  booking: { label: 'Booking', hint: 'How to start and guide bookings' },
  handoff: { label: 'Handoff', hint: 'When to escalate to staff' },
  pricing: { label: 'Pricing', hint: 'Prices, discounts, packages' },
  language: { label: 'Language', hint: 'Customer language matching' },
  hours: { label: 'Hours & location', hint: 'Open times, branches, directions' },
  custom: { label: 'Custom', hint: 'Salon-specific policies' },
};

const DEFAULT_RULES = [
  {
    title: 'This salon only',
    category: 'behavior',
    priority: 120,
    body: 'Only use this salon\'s services, staff, prices, customers, and knowledge. Never mention or invent data from another salon. If asked about another business, say you can only help with this salon.',
  },
  {
    title: 'Natural customer care',
    category: 'behavior',
    priority: 115,
    body:
      'Sound natural on WhatsApp: short, clear, caring. Acknowledge the guest first, answer the question, then offer one next step ' +
      '(book, pick a day, or talk to staff). Avoid robotic phrases like "As an AI" or long formal essays. ' +
      'If unsure, be honest and offer to connect a team member.',
  },
  {
    title: 'Ask before listing all services',
    category: 'behavior',
    priority: 112,
    body:
      'When a customer asks about services or prices, do NOT dump the full service catalogue. ' +
      'First ask what kind of service they need (e.g. haircut, colour, facial, bridal, nails). ' +
      'Then show ONLY matching services with prices. ' +
      'Send the complete list ONLY if they clearly ask for "all services", "full list", "okkom", or "සියලු සේවා".',
  },
  {
    title: 'Reply in customer language',
    category: 'language',
    priority: 110,
    body: 'Detect and reply in the customer\'s language (English, Sinhala, Tamil, or natural Singlish mix). Keep tone warm, human, and professional — like a great salon receptionist, not a stiff bot.',
  },
  {
    title: 'Never invent prices',
    category: 'pricing',
    priority: 108,
    body: 'Do not invent prices, discounts, or packages. Only use amounts from salon tools or knowledge base. If unknown, say a staff member can confirm.',
  },
  {
    title: 'Confirm before discount claims',
    category: 'pricing',
    priority: 104,
    body: 'Never promise a discount, free add-on, or package upgrade unless it appears in active offers/knowledge. If unsure, say staff can confirm promotions in salon.',
  },
  {
    title: 'Booking keyword',
    category: 'booking',
    priority: 100,
    body: 'When the customer wants to book, guide them to say "book" or "book appointment" so the booking flow can collect service, staff, date, and time. Do not pretend a booking is confirmed until tools succeed.',
  },
  {
    title: 'Collect booking details one step at a time',
    category: 'booking',
    priority: 96,
    body: 'For bookings, ask for missing details one at a time (service → preferred staff if any → date → time). Do not ask for everything in one long message.',
  },
  {
    title: 'Short WhatsApp replies',
    category: 'behavior',
    priority: 92,
    body: 'Keep replies under 100–120 words. Prefer short paragraphs and light bullets suitable for WhatsApp mobile reading.',
  },
  {
    title: 'No medical advice',
    category: 'behavior',
    priority: 88,
    body: 'Do not give medical or dermatological advice. Suggest consulting salon staff in person for skin/hair concerns.',
  },
  {
    title: 'Handoff on complaints',
    category: 'handoff',
    priority: 86,
    body: 'If the customer is angry, asks for a manager, reports a payment issue, or needs a complex exception, apologize briefly, say a team member will take over, and escalate.',
  },
  {
    title: 'Handoff on payment disputes',
    category: 'handoff',
    priority: 84,
    body: 'For refunds, failed payments, invoice disputes, or membership billing issues, do not negotiate amounts. Escalate to staff immediately.',
  },
  {
    title: 'Opening hours honesty',
    category: 'hours',
    priority: 80,
    body: 'Only state opening hours or branch address from salon knowledge/tools. If unknown, say staff can confirm and offer to help with booking instead.',
  },
  {
    title: 'Never invent wait times',
    category: 'hours',
    priority: 76,
    body: 'Do not invent current queue wait times or "walk-in available now" claims unless tools/knowledge confirm it. Offer to check booking slots instead.',
  },
];

/** Extra insertable templates (not auto-seeded). */
const RULE_TEMPLATES = [
  {
    title: 'Bridal / party packages first',
    category: 'pricing',
    priority: 70,
    body: 'For bridal, party, or event requests, ask event date and guest count first, then share matching packages — not the full catalogue.',
  },
  {
    title: 'Deposit reminder',
    category: 'booking',
    priority: 70,
    body: 'If salon policy requires an advance/deposit, mention it clearly after a booking is confirmed, using only published policy text.',
  },
  {
    title: 'Late arrival policy',
    category: 'custom',
    priority: 65,
    body: 'If asked about lateness, explain the salon late-arrival policy from knowledge. Do not invent grace periods.',
  },
  {
    title: 'Kids / male / female services',
    category: 'behavior',
    priority: 65,
    body: 'If the salon has gender or age service limits, ask politely which guest the appointment is for before recommending services.',
  },
  {
    title: 'Upsell gently',
    category: 'pricing',
    priority: 60,
    body: 'After answering the main question, you may suggest one relevant add-on or package if it fits — never pushy, never more than one suggestion.',
  },
];

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

function sanitizeRuleInput(body = {}) {
  const title = body.title != null ? String(body.title).trim().slice(0, 200) : undefined;
  const text = body.body != null ? String(body.body).trim().slice(0, 4000) : undefined;
  let category;
  if (body.category != null) {
    category = String(body.category).toLowerCase().trim();
    if (!CATEGORIES.includes(category)) {
      const err = new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
      err.status = 400;
      throw err;
    }
  }
  let priority;
  if (body.priority != null) {
    priority = Math.max(0, Math.min(999, Number(body.priority) || 0));
  }
  let is_active;
  if (body.is_active != null) is_active = body.is_active !== false && body.is_active !== 0 && body.is_active !== '0';
  return { title, body: text, category, priority, is_active };
}

async function loadTenantRules(tenantId, { category, active, q } = {}) {
  const where = { tenant_id: tenantId };
  if (category) where.category = String(category).toLowerCase();
  if (active === '1' || active === true) where.is_active = true;
  if (active === '0' || active === false) where.is_active = false;
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    where[Op.or] = [
      { title: { [Op.like]: term } },
      { body: { [Op.like]: term } },
    ];
  }
  return CrmAiRule.findAll({
    where,
    order: [['priority', 'DESC'], ['updatedAt', 'DESC'], ['id', 'DESC']],
  });
}

function summarize(rows) {
  const byCategory = {};
  for (const c of CATEGORIES) byCategory[c] = { total: 0, active: 0 };
  let active = 0;
  for (const r of rows) {
    const cat = CATEGORIES.includes(r.category) ? r.category : 'custom';
    byCategory[cat].total += 1;
    if (r.is_active) {
      byCategory[cat].active += 1;
      active += 1;
    }
  }
  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    byCategory,
  };
}

const list = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const rows = await loadTenantRules(tenantId, {
      category: req.query.category,
      active: req.query.active,
      q: req.query.q,
    });
    const activeRows = rows.filter((r) => r.is_active);
    return res.json({
      data: rows,
      categories: CATEGORIES,
      categoryMeta: CATEGORY_META,
      templates: RULE_TEMPLATES,
      summary: summarize(rows),
      previewBlock: formatRulesForPrompt(activeRows),
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
    const patch = sanitizeRuleInput(req.body || {});
    if (!patch.title || !patch.body) {
      return res.status(400).json({ message: 'title and body are required' });
    }
    const row = await CrmAiRule.create({
      tenant_id: tenantId,
      title: patch.title,
      body: patch.body,
      category: patch.category || 'custom',
      priority: patch.priority ?? 50,
      is_active: patch.is_active !== false,
      updated_by: req.user?.id || null,
    });
    return res.status(201).json(row);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
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
    const patch = sanitizeRuleInput(req.body || {});
    const data = { updated_by: req.user?.id || null };
    for (const k of ['title', 'body', 'category', 'priority', 'is_active']) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    await row.update(data);
    return res.json(row);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
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

const duplicate = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const row = await CrmAiRule.findOne({ where: { id: req.params.id, tenant_id: tenantId } });
    if (!row) return res.status(404).json({ message: 'Rule not found' });
    const copy = await CrmAiRule.create({
      tenant_id: tenantId,
      title: `${String(row.title).slice(0, 180)} (copy)`,
      body: row.body,
      category: row.category,
      priority: Math.max(0, (Number(row.priority) || 0) - 1),
      is_active: false,
      updated_by: req.user?.id || null,
    });
    return res.status(201).json(copy);
  } catch (err) {
    console.error('[crm-rules] duplicate', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/rules/reorder  body: { orderedIds: number[] } highest priority first */
const reorder = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const ids = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'orderedIds required' });
    const rows = await CrmAiRule.findAll({ where: { tenant_id: tenantId, id: { [Op.in]: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    let p = 1000;
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      await row.update({ priority: p, updated_by: req.user?.id || null });
      p -= 10;
    }
    const data = await loadTenantRules(tenantId);
    return res.json({ ok: true, data, summary: summarize(data) });
  } catch (err) {
    console.error('[crm-rules] reorder', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/rules/bulk  body: { ids, is_active } */
const bulk = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'ids required' });
    if (req.body.is_active == null) return res.status(400).json({ message: 'is_active required' });
    const is_active = req.body.is_active !== false && req.body.is_active !== 0 && req.body.is_active !== '0';
    await CrmAiRule.update(
      { is_active, updated_by: req.user?.id || null },
      { where: { tenant_id: tenantId, id: { [Op.in]: ids } } },
    );
    const data = await loadTenantRules(tenantId);
    return res.json({ ok: true, data, summary: summarize(data) });
  } catch (err) {
    console.error('[crm-rules] bulk', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const preview = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const rules = await listActiveRules(tenantId);
    return res.json({
      tenant_id: tenantId,
      count: rules.length,
      rulesBlock: formatRulesForPrompt(rules),
      rules: rules.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        priority: r.priority,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const templates = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    return res.json({
      categories: CATEGORIES,
      categoryMeta: CATEGORY_META,
      starters: DEFAULT_RULES,
      templates: RULE_TEMPLATES,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const seedDefaults = async (req, res) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    let created = 0;
    let updated = 0;
    const force = req.body?.force === true || req.query?.force === '1';
    for (const d of DEFAULT_RULES) {
      const exists = await CrmAiRule.findOne({
        where: { tenant_id: tenantId, title: d.title },
      });
      if (exists) {
        if (force) {
          await exists.update({
            body: d.body,
            category: d.category,
            priority: d.priority,
            is_active: true,
            updated_by: req.user?.id || null,
          });
          updated += 1;
        }
        continue;
      }
      await CrmAiRule.create({
        tenant_id: tenantId,
        ...d,
        is_active: true,
        updated_by: req.user?.id || null,
      });
      created += 1;
    }
    const rows = await loadTenantRules(tenantId);
    return res.json({
      created,
      updated,
      data: rows,
      summary: summarize(rows),
      categories: CATEGORIES,
      categoryMeta: CATEGORY_META,
      tenant_id: tenantId,
      previewBlock: formatRulesForPrompt(rows.filter((r) => r.is_active)),
    });
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
  duplicate,
  reorder,
  bulk,
  preview,
  templates,
  seedDefaults,
  listActiveRules,
  formatRulesForPrompt,
  CATEGORIES,
  CATEGORY_META,
  DEFAULT_RULES,
  RULE_TEMPLATES,
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
