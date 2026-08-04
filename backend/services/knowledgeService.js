/**
 * Knowledge Base search — advanced keyword / phrase / synonym scoring.
 * Tenant-scoped. No vector DB required.
 */
'use strict';

const { Op } = require('sequelize');
const { CrmKnowledgeArticle } = require('../models');
const { getRedis, cacheKey } = require('../utils/redis');

const CACHE_TTL = 90;

/** Salon domain synonyms (EN + common SI transliterations) */
const SYNONYMS = {
  cancel: ['cancellation', 'reschedule', 'postpone', 'cancel', 'අවලංගු', 'වෙනස්'],
  price: ['prices', 'cost', 'charge', 'fee', 'ගාන', 'මිල', 'price list', 'rates'],
  book: ['booking', 'appointment', 'reserve', 'slot', 'වෙන්කිරීම', 'ඇපොයින්ට්මන්ට්'],
  open: ['hours', 'opening', 'time', 'විවෘත', 'වේලාව', 'closing'],
  location: ['branch', 'address', 'where', 'directions', 'ශාඛා', 'ලිපිනය'],
  parking: ['park', 'car park', 'vehicle'],
  payment: ['pay', 'card', 'cash', 'transfer', 'ගෙවීම'],
  promo: ['offer', 'discount', 'deal', 'promotion', 'වට්ටම'],
  bridal: ['wedding', 'bride', 'මංගල'],
  haircut: ['cut', 'trim', 'හෙයාර් කට්'],
  color: ['colour', 'dye', 'highlights', 'වර්ණ'],
};

function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function expandTokens(tokens) {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const [canon, alts] of Object.entries(SYNONYMS)) {
      if (t === canon || alts.some((a) => a.includes(t) || t.includes(a))) {
        out.add(canon);
        alts.forEach((a) => tokenize(a).forEach((x) => out.add(x)));
      }
    }
  }
  return Array.from(out);
}

function scoreArticle(article, tokens, rawQuery) {
  const q = String(rawQuery || '').toLowerCase().trim();
  const title = String(article.title || '').toLowerCase();
  const body = String(article.body || '').toLowerCase();
  const tags = Array.isArray(article.tags)
    ? article.tags.map((t) => String(t).toLowerCase())
    : [];
  const locale = String(article.locale || 'en').toLowerCase();

  let score = (Number(article.priority) || 0) * 3;

  if (!tokens.length && !q) return score;

  // Exact / phrase boosts
  if (q && title === q) score += 40;
  if (q && title.includes(q)) score += 18;
  if (q && body.includes(q)) score += 10;
  if (q && tags.some((tag) => tag === q || tag.includes(q))) score += 14;

  const expanded = expandTokens(tokens);
  for (const t of expanded) {
    if (title.includes(t)) score += 10;
    if (tags.some((tag) => tag.includes(t))) score += 8;
    // body hits — weight early paragraphs higher
    const idx = body.indexOf(t);
    if (idx >= 0) score += idx < 200 ? 4 : 2;
  }

  // Prefer articles that match most query tokens
  if (tokens.length) {
    const covered = tokens.filter(
      (t) => title.includes(t) || body.includes(t) || tags.some((tag) => tag.includes(t))
    ).length;
    score += (covered / tokens.length) * 12;
  }

  // Slight boost for bilingual content markers
  if (/[\u0D80-\u0DFF]/.test(body) && /[a-z]/i.test(body)) score += 2;
  if (locale === 'si' || locale === 'en-si' || locale === 'si-en') score += 1;

  return Math.round(score * 10) / 10;
}

async function listArticles(tenantId, { category, activeOnly = true, branchId, locale } = {}) {
  const where = { tenant_id: tenantId };
  if (activeOnly) where.is_active = true;
  if (category) where.category = category;
  if (locale) where.locale = locale;
  if (branchId) {
    where[Op.or] = [{ branch_id: null }, { branch_id: Number(branchId) }];
  }
  return CrmKnowledgeArticle.findAll({
    where,
    order: [['priority', 'DESC'], ['updatedAt', 'DESC']],
  });
}

/**
 * Search knowledge for AI context.
 * @returns {Promise<Array<{id,title,category,body,score,tags,locale}>>}
 */
async function searchKnowledge(tenantId, query, { limit = 5, branchId, category, locale } = {}) {
  const tokens = tokenize(query);
  const redis = getRedis();
  const ck = cacheKey(tenantId, 'kb', 'all');
  let articles = null;
  if (redis && !category && !branchId && !locale) {
    try {
      const raw = await redis.get(ck);
      if (raw) articles = JSON.parse(raw);
    } catch { /* ignore */ }
  }
  if (!articles) {
    const rows = await listArticles(tenantId, { activeOnly: true, branchId, category, locale });
    articles = rows.map((r) => r.toJSON());
    if (redis && !category && !branchId && !locale) {
      try {
        await redis.set(ck, JSON.stringify(articles), 'EX', CACHE_TTL);
      } catch { /* ignore */ }
    }
  } else if (branchId || category || locale) {
    articles = articles.filter((a) => {
      if (category && a.category !== category) return false;
      if (locale && a.locale !== locale) return false;
      if (branchId && a.branch_id && Number(a.branch_id) !== Number(branchId)) return false;
      return true;
    });
  }

  const ranked = articles
    .map((a) => ({ ...a, score: scoreArticle(a, tokens, query) }))
    .filter((a) => (tokens.length || query ? a.score > 0 : true))
    .sort((a, b) => b.score - a.score || (b.priority || 0) - (a.priority || 0))
    .slice(0, limit)
    .map(({ id, title, category: cat, body, score, tags, locale: loc, priority }) => ({
      id,
      title,
      category: cat,
      body: String(body || '').slice(0, 1600),
      tags,
      locale: loc,
      priority,
      score,
    }));

  return ranked;
}

async function invalidateKnowledgeCache(tenantId) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(cacheKey(tenantId, 'kb', 'all'));
  } catch { /* ignore */ }
}

function formatSnippetsForPrompt(hits) {
  if (!hits?.length) return '';
  return hits
    .map((h, i) => `(${i + 1}) [${h.category}|${h.locale || 'en'}] ${h.title}\n${h.body}`)
    .join('\n\n');
}

/** Stats for admin UI */
async function knowledgeStats(tenantId) {
  const rows = await CrmKnowledgeArticle.findAll({
    where: { tenant_id: tenantId },
    attributes: ['id', 'category', 'is_active', 'locale'],
    raw: true,
  });
  const byCategory = {};
  let active = 0;
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (r.is_active) active += 1;
  }
  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    by_category: byCategory,
  };
}

module.exports = {
  listArticles,
  searchKnowledge,
  invalidateKnowledgeCache,
  formatSnippetsForPrompt,
  tokenize,
  knowledgeStats,
  SYNONYMS,
};
