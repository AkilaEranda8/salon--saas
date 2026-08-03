/**
 * Knowledge Base search — Phase 1 keyword / tag scoring (no vector DB yet).
 */
'use strict';

const { Op } = require('sequelize');
const { CrmKnowledgeArticle } = require('../models');
const { getRedis, cacheKey } = require('../utils/redis');

const CACHE_TTL = 60;

function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreArticle(article, tokens) {
  if (!tokens.length) return article.priority || 0;
  const title = String(article.title || '').toLowerCase();
  const body = String(article.body || '').toLowerCase();
  const tags = Array.isArray(article.tags)
    ? article.tags.map((t) => String(t).toLowerCase())
    : [];
  let score = (article.priority || 0) * 2;
  for (const t of tokens) {
    if (title.includes(t)) score += 8;
    if (tags.some((tag) => tag.includes(t))) score += 6;
    if (body.includes(t)) score += 2;
  }
  return score;
}

async function listArticles(tenantId, { category, activeOnly = true, branchId } = {}) {
  const where = { tenant_id: tenantId };
  if (activeOnly) where.is_active = true;
  if (category) where.category = category;
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
 * @returns {Promise<Array<{id,title,category,body,score}>>}
 */
async function searchKnowledge(tenantId, query, { limit = 5, branchId, category } = {}) {
  const tokens = tokenize(query);
  const redis = getRedis();
  const ck = cacheKey(tenantId, 'kb', 'all');
  let articles = null;
  if (redis && !category && !branchId) {
    try {
      const raw = await redis.get(ck);
      if (raw) articles = JSON.parse(raw);
    } catch { /* ignore */ }
  }
  if (!articles) {
    const rows = await listArticles(tenantId, { activeOnly: true, branchId, category });
    articles = rows.map((r) => r.toJSON());
    if (redis && !category && !branchId) {
      try {
        await redis.set(ck, JSON.stringify(articles), 'EX', CACHE_TTL);
      } catch { /* ignore */ }
    }
  } else if (branchId || category) {
    articles = articles.filter((a) => {
      if (category && a.category !== category) return false;
      if (branchId && a.branch_id && Number(a.branch_id) !== Number(branchId)) return false;
      return true;
    });
  }

  const ranked = articles
    .map((a) => ({ ...a, score: scoreArticle(a, tokens) }))
    .filter((a) => (tokens.length ? a.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, title, category: cat, body, score, tags }) => ({
      id,
      title,
      category: cat,
      body: String(body || '').slice(0, 1200),
      tags,
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
    .map((h, i) => `(${i + 1}) [${h.category}] ${h.title}\n${h.body}`)
    .join('\n\n');
}

module.exports = {
  listArticles,
  searchKnowledge,
  invalidateKnowledgeCache,
  formatSnippetsForPrompt,
  tokenize,
};
