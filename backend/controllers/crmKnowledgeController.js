'use strict';

const { CrmKnowledgeArticle } = require('../models');
const { resolveTenantId } = require('../utils/tenantScope');
const {
  searchKnowledge,
  invalidateKnowledgeCache,
  formatSnippetsForPrompt,
} = require('../services/knowledgeService');

const CATEGORIES = ['faq', 'policy', 'promo', 'service', 'script', 'other'];

function tid(req) {
  return resolveTenantId(req);
}

const list = async (req, res) => {
  try {
    const tenantId = tid(req);
    const where = { tenant_id: tenantId };
    if (req.query.category) where.category = req.query.category;
    if (req.query.active === '1') where.is_active = true;
    if (req.query.active === '0') where.is_active = false;
    const rows = await CrmKnowledgeArticle.findAll({
      where,
      order: [['priority', 'DESC'], ['updatedAt', 'DESC']],
    });
    return res.json({ data: rows, categories: CATEGORIES });
  } catch (err) {
    console.error('[kb] list', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getOne = async (req, res) => {
  try {
    const tenantId = tid(req);
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
    const tenantId = tid(req);
    const { title, body, category, tags, branch_id, locale, is_active, priority } = req.body || {};
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
    const cat = String(category || 'faq').toLowerCase();
    if (!CATEGORIES.includes(cat)) {
      return res.status(400).json({ message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    const row = await CrmKnowledgeArticle.create({
      tenant_id: tenantId,
      title: String(title).slice(0, 200),
      body: String(body),
      category: cat,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : []),
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
    const tenantId = tid(req);
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
          return res.status(400).json({ message: `Invalid category` });
        }
        patch.category = cat;
      } else if (k === 'tags') {
        const tags = req.body.tags;
        patch.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t) => t.trim()).filter(Boolean);
      } else if (k === 'title') {
        patch.title = String(req.body.title).slice(0, 200);
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
    const tenantId = tid(req);
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

/** Admin search preview */
const search = async (req, res) => {
  try {
    const tenantId = tid(req);
    const q = req.query.q || req.body?.q || '';
    const hits = await searchKnowledge(tenantId, q, {
      limit: Math.min(parseInt(req.query.limit, 10) || 5, 20),
      branchId: req.query.branchId || null,
      category: req.query.category || null,
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

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  search,
  CATEGORIES,
};
