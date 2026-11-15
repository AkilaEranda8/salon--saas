'use strict';

const { Op } = require('sequelize');
const { CrmKnowledgeArticle } = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const {
  searchKnowledge,
  invalidateKnowledgeCache,
  formatSnippetsForPrompt,
  knowledgeStats,
} = require('../services/knowledgeService');

const CATEGORIES = ['faq', 'policy', 'promo', 'service', 'script', 'hours', 'payment', 'other'];

const STARTER_ARTICLES = [
  {
    title: 'Opening hours',
    category: 'hours',
    locale: 'en',
    priority: 100,
    tags: ['hours', 'open', 'time', 'විවෘත'],
    body: 'We are typically open Mon–Sat. Exact opening hours may vary by branch — ask which branch you prefer and we will confirm today’s hours. Walk-ins are welcome when slots are free; booking is recommended for weekends.',
  },
  {
    title: 'Cancellation & reschedule policy',
    category: 'policy',
    locale: 'en',
    priority: 95,
    tags: ['cancel', 'reschedule', 'policy'],
    body: 'Please cancel or reschedule at least 2 hours before your appointment so we can offer the slot to someone else. Same-day late cancellations may limit rebooking options. Reply with your booking details and preferred new time to reschedule.',
  },
  {
    title: 'How to book an appointment',
    category: 'faq',
    locale: 'en',
    priority: 90,
    tags: ['book', 'appointment', 'booking'],
    body: 'To book via WhatsApp, say “book” or “book appointment”. We will ask for service, stylist, date, and time, then confirm. You can also book from the salon website or call the branch.',
  },
  {
    title: 'Prices & payments',
    category: 'payment',
    locale: 'en',
    priority: 88,
    tags: ['price', 'payment', 'cash', 'card'],
    body: 'Service prices are listed in our catalogue. We accept cash and card at the salon. Do not invent prices — if a price is unclear, tell the customer a staff member will confirm. Promotions apply only when listed as active.',
  },
  {
    title: 'Parking & location',
    category: 'faq',
    locale: 'en',
    priority: 70,
    tags: ['parking', 'location', 'address', 'branch'],
    body: 'Share the branch address from our branches list. Parking availability depends on the branch — if unsure, ask the customer which branch and offer to confirm parking options with staff.',
  },
  {
    title: 'Bridal & special packages',
    category: 'promo',
    locale: 'en',
    priority: 75,
    tags: ['bridal', 'wedding', 'package', 'promo'],
    body: 'Bridal and special packages may include trial sessions. Ask the customer for the event date and preferred services, then offer to connect them with a stylist or book a consultation. Exact package prices must come from our service list or staff.',
  },
  {
    title: 'Sinhala — වෙන්කිරීම',
    category: 'faq',
    locale: 'si',
    priority: 85,
    tags: ['book', 'වෙන්කිරීම', 'ඇපොයින්ට්මන්ට්'],
    body: 'වෙන්කිරීමක් සඳහා “book” හෝ “වෙන්කරන්න” කියන්න. සේවාව, ස්ටයිලිස්ට්, දිනය සහ වේලාව අසා තහවුරු කරමු. මිල ගණන් සේවා ලැයිස්තුවෙන් පමණක් කියන්න — නොදන්නේ නම් staff එකෙන් තහවුරු කරන බව කියන්න.',
  },
  {
    title: 'Sinhala — අවලංගු කිරීම',
    category: 'policy',
    locale: 'si',
    priority: 84,
    tags: ['cancel', 'අවලංගු', 'වෙනස්'],
    body: 'කරුණාකර appointment එකට අඩුම වශයෙන් පැය 2කට පෙර අවලංගු කරන්න හෝ වෙනස් කරන්න. නව වේලාවක් ඕන නම් දිනය/වේලාව කියන්න — අපි help කරමු.',
  },
  {
    title: 'Kids / family services',
    category: 'service',
    locale: 'en',
    priority: 68,
    tags: ['kids', 'children', 'family'],
    body: 'Ask the guest age and which service they need (haircut, colour, facial, etc.). Recommend only matching services from our catalogue. If age or gender limits apply at this salon, confirm politely before booking.',
  },
  {
    title: 'Wait time & walk-ins',
    category: 'hours',
    locale: 'en',
    priority: 72,
    tags: ['wait', 'walk-in', 'queue', 'today'],
    body: 'Do not invent current wait times. Offer to check the next available booking slot. Walk-ins are welcome when capacity allows — booking is safer for weekends and evenings.',
  },
  {
    title: 'Home service / mobile',
    category: 'faq',
    locale: 'en',
    priority: 55,
    tags: ['home', 'mobile', 'visit', 'doorstep'],
    body: 'Only offer home or mobile service if this salon publishes that option. If unsure, say staff will confirm availability and travel charges.',
  },
];

function tid(req) {
  return resolveTenantId(req);
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (!tags) return [];
  return String(tags).split(',').map((t) => t.trim()).filter(Boolean);
}

function requireTenant(req, res) {
  const tenantId = tid(req);
  if (!tenantId) {
    res.status(400).json({ message: 'Tenant required' });
    return null;
  }
  return tenantId;
}

const list = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const where = { tenant_id: tenantId };
    if (req.query.category) where.category = req.query.category;
    if (req.query.locale) where.locale = req.query.locale;
    if (req.query.active === '1') where.is_active = true;
    if (req.query.active === '0') where.is_active = false;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { body: { [Op.like]: `%${q}%` } },
      ];
    }
    const rows = await CrmKnowledgeArticle.findAll({
      where,
      order: [['priority', 'DESC'], ['updatedAt', 'DESC']],
    });
    const stats = await knowledgeStats(tenantId);
    return res.json({ data: rows, categories: CATEGORIES, stats });
  } catch (err) {
    console.error('[kb] list', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const row = await CrmKnowledgeArticle.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) return res.status(404).json({ message: 'Article not found' });
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const { title, body, category, tags, branch_id, locale, is_active, priority } = req.body || {};
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
    const cat = String(category || 'faq').toLowerCase();
    if (!CATEGORIES.includes(cat)) {
      return res.status(400).json({ message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    const row = await CrmKnowledgeArticle.create({
      tenant_id: tenantId,
      title: String(title).slice(0, 200),
      body: String(body).slice(0, 20000),
      category: cat,
      tags: parseTags(tags),
      branch_id: branch_id || null,
      locale: locale || 'en',
      is_active: is_active !== false,
      priority: Number(priority) || 0,
      updated_by: req.user?.id || null,
    });
    await invalidateKnowledgeCache(tenantId);
    return res.status(201).json(row);
  } catch (err) {
    console.error('[kb] create', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const row = await CrmKnowledgeArticle.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) return res.status(404).json({ message: 'Article not found' });
    const allowed = ['title', 'body', 'category', 'tags', 'branch_id', 'locale', 'is_active', 'priority'];
    const patch = { updated_by: req.user?.id || null };
    for (const k of allowed) {
      if (req.body[k] === undefined) continue;
      if (k === 'category') {
        const cat = String(req.body.category).toLowerCase();
        if (!CATEGORIES.includes(cat)) {
          return res.status(400).json({ message: 'Invalid category' });
        }
        patch.category = cat;
      } else if (k === 'tags') {
        patch.tags = parseTags(req.body.tags);
      } else if (k === 'title') {
        patch.title = String(req.body.title).slice(0, 200);
      } else if (k === 'body') {
        patch.body = String(req.body.body).slice(0, 20000);
      } else if (k === 'priority') {
        patch.priority = Number(req.body.priority) || 0;
      } else {
        patch[k] = req.body[k];
      }
    }
    patch.version = (row.version || 1) + 1;
    await row.update(patch);
    await invalidateKnowledgeCache(tenantId);
    return res.json(row);
  } catch (err) {
    console.error('[kb] update', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const row = await CrmKnowledgeArticle.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) return res.status(404).json({ message: 'Article not found' });
    await row.destroy();
    await invalidateKnowledgeCache(tenantId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const search = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const q = req.query.q || req.body?.q || '';
    const hits = await searchKnowledge(tenantId, q, {
      limit: Math.min(parseInt(req.query.limit, 10) || 5, 20),
      branchId: req.query.branchId || null,
      category: req.query.category || null,
      locale: req.query.locale || null,
    });
    return res.json({
      query: q,
      hits,
      prompt_block: formatSnippetsForPrompt(hits),
    });
  } catch (err) {
    console.error('[kb] search', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/knowledge/seed-defaults  body/query: { force?: true } */
const seedDefaults = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const force = req.body?.force === true || req.query?.force === '1';
    let created = 0;
    let updated = 0;
    for (const a of STARTER_ARTICLES) {
      const exists = await CrmKnowledgeArticle.findOne({
        where: { tenant_id: tenantId, title: a.title },
      });
      if (exists) {
        if (force) {
          await exists.update({
            body: a.body,
            category: a.category,
            locale: a.locale,
            priority: a.priority,
            tags: a.tags,
            is_active: true,
            updated_by: req.user?.id || null,
            version: (exists.version || 1) + 1,
          });
          updated += 1;
        }
        continue;
      }
      await CrmKnowledgeArticle.create({
        tenant_id: tenantId,
        ...a,
        is_active: true,
        updated_by: req.user?.id || null,
      });
      created += 1;
    }
    await invalidateKnowledgeCache(tenantId);
    const rows = await CrmKnowledgeArticle.findAll({
      where: { tenant_id: tenantId },
      order: [['priority', 'DESC'], ['id', 'ASC']],
    });
    return res.json({
      created,
      updated,
      data: rows,
      categories: CATEGORIES,
      stats: await knowledgeStats(tenantId),
    });
  } catch (err) {
    console.error('[kb] seed', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/knowledge/bulk  { ids, is_active } */
const bulkUpdate = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ message: 'ids required' });
    if (req.body.is_active == null) return res.status(400).json({ message: 'is_active required' });
    const is_active = req.body.is_active !== false && req.body.is_active !== 0 && req.body.is_active !== '0';
    const [n] = await CrmKnowledgeArticle.update(
      { is_active, updated_by: req.user?.id || null },
      { where: { tenant_id: tenantId, id: { [Op.in]: ids } } },
    );
    await invalidateKnowledgeCache(tenantId);
    return res.json({ ok: true, updated: n, stats: await knowledgeStats(tenantId) });
  } catch (err) {
    console.error('[kb] bulk', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/knowledge/:id/duplicate */
const duplicate = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const row = await CrmKnowledgeArticle.findOne({
      where: { id: req.params.id, tenant_id: tenantId },
    });
    if (!row) return res.status(404).json({ message: 'Article not found' });
    const copy = await CrmKnowledgeArticle.create({
      tenant_id: tenantId,
      title: `${String(row.title).slice(0, 180)} (copy)`,
      body: row.body,
      category: row.category,
      tags: row.tags,
      branch_id: row.branch_id,
      locale: row.locale,
      is_active: false,
      priority: row.priority,
      updated_by: req.user?.id || null,
    });
    await invalidateKnowledgeCache(tenantId);
    return res.status(201).json(copy);
  } catch (err) {
    console.error('[kb] duplicate', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /crm/knowledge/bulk-import
 * Body: { text } with blocks separated by --- or Q:/A: pairs
 */
const bulkImport = async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ message: 'text is required' });

    const articles = [];
    // Format A: blocks separated by ---
    const blocks = text.split(/\n---+\n/).map((b) => b.trim()).filter(Boolean);
    for (const block of blocks) {
      const titleMatch = block.match(/^(?:title|q|question)\s*[:：]\s*(.+)$/im);
      const bodyMatch = block.match(/^(?:body|a|answer)\s*[:：]\s*([\s\S]+)$/im);
      if (titleMatch && bodyMatch) {
        articles.push({
          title: titleMatch[1].trim().slice(0, 200),
          body: bodyMatch[1].trim().slice(0, 20000),
          category: 'faq',
          locale: /[\u0D80-\u0DFF]/.test(bodyMatch[1]) ? 'si' : 'en',
          tags: [],
          priority: 50,
        });
        continue;
      }
      // Format B: first line title, rest body
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        articles.push({
          title: lines[0].slice(0, 200),
          body: lines.slice(1).join('\n').slice(0, 20000),
          category: 'faq',
          locale: /[\u0D80-\u0DFF]/.test(block) ? 'si' : 'en',
          tags: [],
          priority: 50,
        });
      }
    }

    if (!articles.length) {
      return res.status(400).json({
        message: 'No articles parsed. Use blocks separated by --- with Title: / Body: lines.',
      });
    }

    let created = 0;
    const createdRows = [];
    for (const a of articles.slice(0, 50)) {
      const row = await CrmKnowledgeArticle.create({
        tenant_id: tenantId,
        ...a,
        is_active: true,
        updated_by: req.user?.id || null,
      });
      createdRows.push(row);
      created += 1;
    }
    await invalidateKnowledgeCache(tenantId);
    return res.status(201).json({
      created,
      data: createdRows,
      stats: await knowledgeStats(tenantId),
    });
  } catch (err) {
    console.error('[kb] bulk-import', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** POST /crm/knowledge/auto-train — sync live services/staff/branches → Gemini training KB */
const autoTrain = async (req, res) => {
  try {
    const tenantId = req.userTenantId ?? req.tenant?.id;
    if (!tenantId) return res.status(400).json({ message: 'Tenant required' });
    const { autoTrainFromSalon } = require('../services/autoTrainFromSalon');
    const { knowledgeStats } = require('../services/knowledgeService');
    const result = await autoTrainFromSalon(tenantId, { userId: req.user?.id || null });
    return res.json({
      ...result,
      stats: await knowledgeStats(tenantId),
    });
  } catch (err) {
    console.error('[kb] auto-train', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
};

/**
 * POST /crm/knowledge/train-from-google
 * body: { query, title?, save?=true, locale? }
 * Gemini searches Google and saves a training article (general tips — not salon prices).
 */
const trainFromGoogle = async (req, res) => {
  try {
    const tenantId = req.userTenantId ?? req.tenant?.id;
    if (!tenantId) return res.status(400).json({ message: 'Tenant required' });
    const query = String(req.body?.query || '').trim();
    if (query.length < 3) return res.status(400).json({ message: 'query required (min 3 chars)' });
    const save = req.body?.save !== false;
    const { googleTrain } = require('../services/aiEngineClient');
    const { invalidateKnowledgeCache, knowledgeStats } = require('../services/knowledgeService');
    const brand = req.tenant?.brand_name || req.tenant?.name || 'the salon';
    const draft = await googleTrain({
      tenantId,
      query,
      brand,
      locale: req.body?.locale || 'en-si',
    });

    let article = null;
    if (save && draft?.body) {
      const title = String(req.body?.title || draft.title || query).slice(0, 200);
      const existing = await CrmKnowledgeArticle.findOne({
        where: { tenant_id: tenantId, title },
      });
      const payload = {
        category: 'faq',
        body: String(draft.body).slice(0, 20000),
        tags: ['google-train', 'google-search', ...String(query).toLowerCase().split(/\s+/).slice(0, 8)],
        locale: req.body?.locale || 'en-si',
        priority: 70,
        is_active: true,
        updated_by: req.user?.id || null,
      };
      if (existing) {
        await existing.update({
          ...payload,
          version: (existing.version || 1) + 1,
        });
        article = existing;
      } else {
        article = await CrmKnowledgeArticle.create({
          tenant_id: tenantId,
          title,
          ...payload,
          version: 1,
        });
      }
      await invalidateKnowledgeCache(tenantId);
    }

    return res.json({
      ok: true,
      saved: !!article,
      article: article ? article.toJSON() : null,
      draft: {
        title: draft.title,
        body: draft.body,
        query: draft.query,
        grounding: draft.grounding,
        model: draft.model,
      },
      stats: await knowledgeStats(tenantId),
      message: article
        ? 'Trained from Google Search and saved'
        : 'Google Search draft ready (not saved)',
    });
  } catch (err) {
    console.error('[kb] train-from-google', err);
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
};

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  search,
  seedDefaults,
  duplicate,
  bulkImport,
  bulkUpdate,
  autoTrain,
  trainFromGoogle,
  CATEGORIES,
  STARTER_ARTICLES,
};
