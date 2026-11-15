'use strict';

/**
 * Auto-train WhatsApp Gemini context from live salon catalogue.
 * Upserts high-priority KB articles so AI Training + retrieval stay in sync
 * whenever services / staff / branches change.
 */
const { Service, Staff, Branch, CrmKnowledgeArticle, Tenant } = require('../models');
const { invalidateKnowledgeCache } = require('./knowledgeService');
const { getRedis, cacheKey } = require('../utils/redis');

const TITLE_SERVICES = 'Auto-train: Services & prices (live salon data)';
const TITLE_STAFF = 'Auto-train: Staff & hours (live salon data)';
const TITLE_BRANCHES = 'Auto-train: Branches (live salon data)';

function debounceKey(tenantId) {
  return cacheKey(tenantId, 'crm', 'auto_train_debounce');
}

async function buildServicesArticle(tenantId) {
  const rows = await Service.findAll({
    where: { tenant_id: tenantId, is_active: true },
    attributes: ['name', 'price', 'duration_minutes', 'category', 'description'],
    order: [['category', 'ASC'], ['name', 'ASC']],
  });
  if (!rows.length) return null;

  const byCat = new Map();
  for (const r of rows) {
    const cat = r.category || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    const desc = r.description ? ` — ${String(r.description).slice(0, 120)}` : '';
    byCat.get(cat).push(
      `- ${r.name}: Rs. ${r.price} / ${r.duration_minutes || 30} min${desc}`
    );
  }

  const parts = [
    'AUTO-TRAINED from salon Services table (source of truth for catalogue).',
    'Use these names and prices when answering. For length-based colour/treatment prices, prefer the dedicated length price-list articles and still ask/confirm hair length.',
    '',
  ];
  for (const [cat, lines] of byCat) {
    parts.push(`## ${cat}`);
    parts.push(...lines);
    parts.push('');
  }
  parts.push(`Total active services: ${rows.length}. Updated automatically when salon services change.`);

  return {
    title: TITLE_SERVICES,
    category: 'service',
    locale: 'en-si',
    priority: 95,
    tags: ['auto-train', 'services', 'prices', 'මිල', 'සේවා', 'price list', 'catalogue'],
    body: parts.join('\n').slice(0, 50000),
  };
}

async function buildStaffArticle(tenantId) {
  const rows = await Staff.findAll({
    where: { tenant_id: tenantId, is_active: true },
    attributes: ['name', 'working_hours', 'branch_id'],
    order: [['name', 'ASC']],
  });
  if (!rows.length) return null;

  const lines = rows.map((s) => {
    let hours = '';
    const wh = s.working_hours;
    if (wh && typeof wh === 'object') {
      hours = Object.entries(wh)
        .slice(0, 7)
        .map(([d, v]) => {
          if (!v || v.closed) return `${d}:closed`;
          if (typeof v === 'object') return `${d}:${v.open || v.start || ''}-${v.close || v.end || ''}`;
          return `${d}:${v}`;
        })
        .join(', ');
    } else if (typeof wh === 'string') {
      hours = wh.slice(0, 120);
    }
    return `- ${s.name}${hours ? ` | hours: ${hours}` : ''}`;
  });

  return {
    title: TITLE_STAFF,
    category: 'faq',
    locale: 'en-si',
    priority: 88,
    tags: ['auto-train', 'staff', 'hours', 'stylist', 'වේලා'],
    body: [
      'AUTO-TRAINED from salon Staff table.',
      'Staff roster (use names; confirm availability when booking):',
      ...lines,
    ].join('\n').slice(0, 20000),
  };
}

async function buildBranchesArticle(tenantId) {
  const rows = await Branch.findAll({
    where: { tenant_id: tenantId, status: 'active' },
    attributes: ['name', 'address', 'phone'],
    order: [['name', 'ASC']],
  });
  if (!rows.length) return null;

  const lines = rows.map((b) => {
    let line = `- ${b.name}`;
    if (b.address) line += ` | ${b.address}`;
    if (b.phone) line += ` | ${b.phone}`;
    return line;
  });

  return {
    title: TITLE_BRANCHES,
    category: 'faq',
    locale: 'en-si',
    priority: 90,
    tags: ['auto-train', 'branch', 'location', 'address', 'ලිපිනය', 'ශාඛා'],
    body: [
      'AUTO-TRAINED from salon Branches table.',
      ...lines,
    ].join('\n').slice(0, 10000),
  };
}

async function upsertArticle(tenantId, article, userId = null) {
  const existing = await CrmKnowledgeArticle.findOne({
    where: { tenant_id: tenantId, title: article.title },
  });
  if (existing) {
    await existing.update({
      body: article.body,
      category: article.category,
      locale: article.locale,
      priority: article.priority,
      tags: article.tags,
      is_active: true,
      version: (existing.version || 1) + 1,
      updated_by: userId,
    });
    return { action: 'updated', id: existing.id, title: article.title };
  }
  const row = await CrmKnowledgeArticle.create({
    tenant_id: tenantId,
    ...article,
    is_active: true,
    version: 1,
    updated_by: userId,
  });
  return { action: 'created', id: row.id, title: article.title };
}

/**
 * Rebuild auto-train KB articles for a tenant from live DB.
 * @returns {Promise<{ok:boolean, tenantId:number, results:array, skipped?:string}>}
 */
async function autoTrainFromSalon(tenantId, { userId = null } = {}) {
  const tid = Number(tenantId);
  if (!tid) throw new Error('tenantId required');

  const tenant = await Tenant.findByPk(tid);
  if (!tenant) throw new Error(`Tenant ${tid} not found`);

  const builders = [buildServicesArticle, buildStaffArticle, buildBranchesArticle];
  const results = [];
  for (const build of builders) {
    const article = await build(tid);
    if (!article) {
      results.push({ action: 'skipped', title: build.name, reason: 'no_rows' });
      continue;
    }
    results.push(await upsertArticle(tid, article, userId));
  }

  await invalidateKnowledgeCache(tid);
  try {
    const redis = getRedis();
    if (redis) {
      await redis.del(cacheKey(tid, 'crm', 'services', 'all'));
      await redis.del(cacheKey(tid, 'kb', 'all'));
    }
  } catch { /* ignore */ }

  return {
    ok: true,
    tenantId: tid,
    slug: tenant.slug,
    results,
    message: 'Gemini WhatsApp AI auto-trained from live salon data',
  };
}

/**
 * Debounced auto-train after catalogue edits (services/staff/branches).
 * Fire-and-forget safe.
 */
async function scheduleAutoTrain(tenantId) {
  const tid = Number(tenantId);
  if (!tid) return;
  try {
    const redis = getRedis();
    if (redis) {
      const key = debounceKey(tid);
      const got = await redis.set(key, '1', 'EX', 45, 'NX');
      if (!got) return; // another update already scheduled window
    }
    // slight delay so batched edits coalesce
    setTimeout(() => {
      autoTrainFromSalon(tid).catch((e) => {
        console.warn('[auto-train]', tid, e.message);
      });
    }, 2500);
  } catch (e) {
    console.warn('[auto-train] schedule', e.message);
  }
}

module.exports = {
  autoTrainFromSalon,
  scheduleAutoTrain,
  TITLE_SERVICES,
  TITLE_STAFF,
  TITLE_BRANCHES,
};
