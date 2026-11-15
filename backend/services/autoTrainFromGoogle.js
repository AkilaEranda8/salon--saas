'use strict';

/**
 * Auto-train WhatsApp AI from Google / grounded replies.
 * When a customer asks something local KB can't cover, we:
 *  1) (often) already answered via Gemini + Google Search
 *  2) save that Q→A into the tenant KB so the next similar ask is local + faster
 * Also stores light "how we talk to this customer" style notes.
 */
const crypto = require('crypto');
const { CrmKnowledgeArticle } = require('../models');
const { invalidateKnowledgeCache } = require('./knowledgeService');
const { getRedis, cacheKey } = require('../utils/redis');

const TITLE_PREFIX = 'Auto-train (Google):';
const STYLE_TITLE = 'Auto-train: How we talk to customers (WhatsApp style)';

function normQuery(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function hashQuery(tenantId, q) {
  return crypto.createHash('sha1').update(`${tenantId}:${normQuery(q)}`).digest('hex').slice(0, 16);
}

function isTrainableQuestion(message) {
  const m = String(message || '').trim();
  if (m.length < 10 || m.length > 400) return false;
  // Skip pure greetings / booking slot answers
  if (/^(hi|hello|hey|hii|hai|ayubowan|hari|ok|okay|yes|no|ඔව්|නෑ|හරි)[\s!.]*$/i.test(m)) {
    return false;
  }
  if (/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(m)) return false;
  if (/\b(?:book|booking|appointment|today|tomorrow|අද|හෙට|වෙන්)\b/i.test(m)
    && !/\b(?:what|how|aftercare|care|side|benefit|kohomada|kiyanna|therenne)\b/i.test(m)) {
    return false;
  }
  return (
    /\?/.test(m)
    || /\b(?:what|how|why|when|where|aftercare|care|benefit|side\s*effect|trend|difference|vs|kohomada|kiyanna|therenne|monawada|mokakda|kiewe|කොහොමද|කියන්න|තේරෙන්නේ)\b/i.test(m)
  );
}

function usedGoogleGrounding(turn) {
  return (turn?.actions || []).some(
    (a) => a && a.tool === 'google_search_grounding' && a.ok !== false,
  );
}

function localKbThin(turn) {
  const kb = (turn?.actions || []).find((a) => a?.tool === 'knowledge_hints' || a?.tool === 'search_knowledge');
  if (!kb) return true;
  return !kb.count || Number(kb.count) < 1;
}

/**
 * Save a Google-grounded (or researched) answer into KB.
 */
async function saveGoogleArticle({
  tenantId,
  query,
  title,
  body,
  userId = null,
  tags = [],
  grounding = null,
} = {}) {
  if (!tenantId || !body) return null;
  const q = normQuery(query);
  if (q.length < 5) return null;

  const finalTitle = String(title || `${TITLE_PREFIX} ${q}`).slice(0, 200);
  const existing = await CrmKnowledgeArticle.findOne({
    where: { tenant_id: tenantId, title: finalTitle },
  });

  const groundingNote = grounding
    ? `\n\n(Source: Google Search grounding @ ${new Date().toISOString()})`
    : `\n\n(Source: Google auto-train @ ${new Date().toISOString()})`;
  const payload = {
    category: 'faq',
    body: `${String(body).slice(0, 11500)}${groundingNote}`,
    tags: [
      'google-auto-train',
      'google-search',
      'auto-train',
      ...tags,
      ...q.split(' ').slice(0, 8),
    ].filter(Boolean).slice(0, 24),
    locale: 'en-si',
    priority: 72,
    is_active: true,
    updated_by: userId,
  };

  let article;
  if (existing) {
    await existing.update({
      ...payload,
      version: (existing.version || 1) + 1,
    });
    article = existing;
  } else {
    article = await CrmKnowledgeArticle.create({
      tenant_id: tenantId,
      title: finalTitle,
      ...payload,
      version: 1,
    });
  }
  await invalidateKnowledgeCache(tenantId);
  return article;
}

/**
 * Append a short style note so Gemini learns how THIS salon talks on WhatsApp.
 */
async function upsertTalkStyle({ tenantId, message, replyText } = {}) {
  if (!tenantId || !replyText) return null;
  const snippet = [
    `Customer: ${String(message || '').slice(0, 140)}`,
    `Good reply style: ${String(replyText).slice(0, 280)}`,
    '',
  ].join('\n');

  let row = await CrmKnowledgeArticle.findOne({
    where: { tenant_id: tenantId, title: STYLE_TITLE },
  });

  const header = [
    'AUTO-TRAINED conversation style for WhatsApp AI.',
    'Mirror this tone: warm, Singlish/Sinhala-friendly, short bubbles, answer THEIR ask first.',
    'Never invent salon prices from these examples.',
    '',
  ].join('\n');

  if (!row) {
    row = await CrmKnowledgeArticle.create({
      tenant_id: tenantId,
      title: STYLE_TITLE,
      category: 'policy',
      body: (header + snippet).slice(0, 15000),
      tags: ['auto-train', 'talk-style', 'whatsapp', 'singlish'],
      locale: 'en-si',
      priority: 88,
      is_active: true,
      version: 1,
    });
  } else {
    const prev = String(row.body || '');
    // Keep newest examples at the top, cap size
    const next = (header + snippet + prev.replace(header, '')).slice(0, 15000);
    await row.update({
      body: next,
      version: (row.version || 1) + 1,
      is_active: true,
      priority: 88,
      tags: ['auto-train', 'talk-style', 'whatsapp', 'singlish'],
    });
  }
  await invalidateKnowledgeCache(tenantId);
  return row;
}

/**
 * After a WhatsApp turn: maybe train from Google grounding + talk style.
 * Fire-and-forget safe; Redis debounce avoids quota spam.
 */
async function maybeAutoTrainFromTurn({
  tenantId,
  message,
  replyText,
  turn,
  brand,
} = {}) {
  if (!tenantId || !message || !replyText) return { skipped: true, reason: 'missing' };
  if (String(replyText).length < 25) return { skipped: true, reason: 'short_reply' };
  if (!isTrainableQuestion(message) && !usedGoogleGrounding(turn)) {
    return { skipped: true, reason: 'not_trainable' };
  }

  const redis = getRedis();
  const qHash = hashQuery(tenantId, message);
  const dedupeKey = cacheKey(tenantId, 'crm', 'gtrain', qHash);
  if (redis) {
    const claimed = await redis.set(dedupeKey, '1', 'EX', 60 * 60 * 24 * 5, 'NX'); // 5 days
    if (!claimed) return { skipped: true, reason: 'deduped' };
  }

  const results = { savedArticle: false, style: false, researched: false };

  // 1) If this turn already used Google grounding — save the answer as KB
  if (usedGoogleGrounding(turn) || (localKbThin(turn) && isTrainableQuestion(message))) {
    const title = `${TITLE_PREFIX} ${normQuery(message)}`.slice(0, 200);
    const body = [
      `Customer asked: ${String(message).slice(0, 300)}`,
      '',
      'Trained answer (from Gemini' + (usedGoogleGrounding(turn) ? ' + Google Search' : '') + '):',
      String(replyText).slice(0, 4000),
      '',
      'NOTE: This is general guidance / salon reply style. Do NOT invent THIS salon\'s prices or hours from Google — use live salon data for those.',
    ].join('\n');

    const art = await saveGoogleArticle({
      tenantId,
      query: message,
      title,
      body,
      grounding: (turn?.actions || []).find((a) => a?.tool === 'google_search_grounding') || null,
    });
    results.savedArticle = !!art;
  }

  // 2) If local was thin and we did NOT ground this turn — research via Google for NEXT time
  if (!usedGoogleGrounding(turn) && localKbThin(turn) && isTrainableQuestion(message)) {
    try {
      const aiClient = require('./aiEngineClient');
      const trainFn = typeof aiClient.googleTrain === 'function'
        ? aiClient.googleTrain
        : null;
      if (!trainFn) {
        console.warn('[gtrain] googleTrain missing on aiEngineClient — skip research');
      } else {
        const draft = await trainFn({
          tenantId,
          query: String(message).slice(0, 240),
          brand: brand || 'the salon',
          locale: 'en-si',
        });
        if (draft?.body) {
          await saveGoogleArticle({
            tenantId,
            query: message,
            title: `${TITLE_PREFIX} ${String(draft.title || normQuery(message)).slice(0, 160)}`,
            body: String(draft.body),
            grounding: draft.grounding || null,
          });
          results.researched = true;
          results.savedArticle = true;
        }
      }
    } catch (err) {
      console.warn('[gtrain] googleTrain', err.message || err);
    }
  }

  // 3) Always learn talk style from solid replies (light)
  try {
    const styleKey = cacheKey(tenantId, 'crm', 'talk_style_pulse');
    let allowStyle = true;
    if (redis) {
      allowStyle = !!(await redis.set(styleKey, '1', 'EX', 60 * 30, 'NX')); // every 30 min max
    }
    if (allowStyle && String(replyText).length >= 40) {
      await upsertTalkStyle({ tenantId, message, replyText });
      results.style = true;
    }
  } catch (err) {
    console.warn('[gtrain] talk style', err.message);
  }

  return { ok: true, ...results };
}

module.exports = {
  maybeAutoTrainFromTurn,
  saveGoogleArticle,
  upsertTalkStyle,
  isTrainableQuestion,
  usedGoogleGrounding,
};
