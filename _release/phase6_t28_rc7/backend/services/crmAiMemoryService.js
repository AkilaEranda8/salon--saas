'use strict';

/**
 * Persist / load short-term CRM AI memory per phone (preferences + summary).
 * Powers advanced WhatsApp customer chat continuity.
 */

const INTEREST_HINTS = [
  'hair', 'facial', 'bridal', 'nail', 'massage', 'color', 'cut', 'keratin', 'keratina',
  'rebonding', 'manicure', 'pedicure', 'wax', 'makeup', 'beard', 'trim', 'highlight',
  'හෙයාර්', 'කට්', 'ෆේෂල්', 'බ්‍රයිඩල්', 'නේල්', 'මසාජ්', 'කලර්',
];

const OBJECTION_RE = /\b(expensive|too\s*much|later|passe|not\s*now|no\s*budget|ගණන්|මිල\s*වැඩි|පස්සේ|දැන්\s*නෑ|ඕනේ\s*නැ)\b/i;
const LENGTH_RE = /\b(short|medium|long|shoulder|waist|කෙටි|මධ්‍යම|දිගු|ලොං)\b/i;
const DATE_HINT_RE = /\b(today|tomorrow|අද|හෙට|mon|tue|wed|thu|fri|sat|sun|සඳුදා|අඟහරුවාදා|බදාදා|බ්‍රහස්පතින්දා|සිකුරාදා|සෙනසුරාදා|ඉරිදා)\b/i;

async function loadMemory(tenantId, { phone, conversationId, leadId } = {}) {
  const { CrmAiMemory } = require('../models');
  if (!tenantId) return null;

  if (conversationId) {
    const byConv = await CrmAiMemory.findOne({
      where: { tenant_id: tenantId, conversation_id: conversationId },
      order: [['id', 'DESC']],
    });
    if (byConv) return byConv;
  }
  if (phone) {
    const byPhone = await CrmAiMemory.findOne({
      where: { tenant_id: tenantId, phone: String(phone).replace(/\D/g, '').slice(-12) },
      order: [['updatedAt', 'DESC']],
    });
    if (byPhone) return byPhone;
  }
  if (leadId) {
    return CrmAiMemory.findOne({
      where: { tenant_id: tenantId, lead_id: leadId },
      order: [['id', 'DESC']],
    });
  }
  return null;
}

function detectLangHint(text) {
  const t = String(text || '');
  if (/[\u0D80-\u0DFF]/.test(t)) return 'si';
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  if (/\b(kohomada|monawada|eka|hari|ehenam|oyage|karanna|penna)\b/i.test(t)) return 'si';
  return 'en';
}

function memoryToContext(row) {
  if (!row) return null;
  const meta = (row.meta && typeof row.meta === 'object') ? row.meta : {};
  return {
    summary: row.summary || null,
    preferred_services: row.preferred_services || null,
    preferred_branch_id: row.preferred_branch_id || null,
    objections: row.objections || null,
    language: meta.language || null,
    script_mode: meta.script_mode || null,
    hair_length: meta.hair_length || null,
    last_date_interest: meta.last_date_interest || null,
    booking_state: meta.booking_state || null,
    booking_paused: !!meta.booking_paused,
    last_service: meta.last_service || null,
    current_topic: meta.current_topic || null,
    last_intent: meta.last_intent || null,
    unresolved_question: meta.unresolved_question || null,
    last_quoted_price: meta.last_quoted_price || null,
    address_preference: meta.address_preference || meta.honorific || null,
    honorific: meta.honorific || meta.address_preference || null,
    address_form: meta.address_form || null,
    address_preference_asked: !!meta.address_preference_asked,
  };
}

/**
 * Upsert memory after a turn — richer extraction for advanced customer chat.
 */
async function upsertMemoryFromTurn({
  tenantId,
  conversationId,
  leadId,
  phone,
  message,
  replyText,
  turn,
} = {}) {
  const { CrmAiMemory } = require('../models');
  if (!tenantId || !phone) return null;

  const digits = String(phone).replace(/\D/g, '').slice(-12);
  let row = await CrmAiMemory.findOne({
    where: { tenant_id: tenantId, phone: digits },
    order: [['id', 'DESC']],
  });

  const preferred = Array.isArray(row?.preferred_services) ? [...row.preferred_services] : [];
  const actions = Array.isArray(turn?.actions) ? turn.actions : [];
  const prevMeta = (row?.meta && typeof row.meta === 'object') ? { ...row.meta } : {};

  const msg = String(message || '');
  const msgL = msg.toLowerCase();
  for (const h of INTEREST_HINTS) {
    if (msgL.includes(h.toLowerCase()) && !preferred.includes(h)) preferred.push(h);
  }

  // Capture service name from booking flow state action
  const flowAct = [...actions].reverse().find((a) => a?.tool === 'booking_flow_state' && a.ok);
  if (flowAct?.service && !preferred.includes(String(flowAct.service))) {
    preferred.unshift(String(flowAct.service));
  }

  let objections = row?.objections || null;
  if (OBJECTION_RE.test(msg)) {
    const bit = msg.slice(0, 160);
    objections = objections ? `${String(objections).slice(0, 400)} · ${bit}` : bit;
  }

  const lengthHit = msg.match(LENGTH_RE);
  const dateHit = msg.match(DATE_HINT_RE);
  const language = detectLangHint(msg);

  const booking = turn?.booking;
  const summaryBits = [];
  if (row?.summary) summaryBits.push(String(row.summary).slice(0, 350));
  if (booking?.status === 'confirmed') {
    summaryBits.push(`Booked appointment ${booking.salon_appointment_id || ''}`.trim());
  }
  if (booking?.status === 'cancelled') {
    summaryBits.push('Cancelled an appointment via WhatsApp');
  }
  if (turn?.handoff?.reason) {
    summaryBits.push(`Handoff: ${turn.handoff.reason}`);
  }
  if (flowAct?.state && flowAct.state !== 'idle') {
    summaryBits.push(`Booking step: ${flowAct.state}${flowAct.service ? ` (${flowAct.service})` : ''}`);
  }
  const lastExchange = `Customer: ${msg.slice(0, 100)} | AI: ${String(replyText || '').slice(0, 100)}`;
  summaryBits.push(lastExchange);

  // Phase 2+/RC7: merge CI + pricing + respect + memory_correction patches
  const ciAct = [...actions].reverse().find((a) => a?.tool === 'conversation_intelligence' && a.ok);
  const priceMemAct = [...actions].reverse().find((a) => a?.tool === 'pricing_memory_patch' && a.ok);
  const respectAct = [...actions].reverse().find((a) => a?.tool === 'customer_respect_memory' && a.ok);
  const correctionAct = [...actions].reverse().find((a) => a?.tool === 'memory_correction' && a.ok);
  const pauseAct = [...actions].reverse().find((a) => a?.tool === 'booking_pause_for_understanding' && a.ok);
  const patch = {
    ...((ciAct && typeof ciAct.memory_patch === 'object') ? ciAct.memory_patch : {}),
    ...((priceMemAct && typeof priceMemAct.memory_patch === 'object') ? priceMemAct.memory_patch : {}),
    ...((respectAct && typeof respectAct.memory_patch === 'object') ? respectAct.memory_patch : {}),
    // Corrections win over stale CI topic
    ...((correctionAct && typeof correctionAct.memory_patch === 'object') ? correctionAct.memory_patch : {}),
  };
  // Privacy: never persist secret-looking keys from patches
  for (const k of Object.keys(patch)) {
    const lk = String(k).toLowerCase();
    if (/(api_key|password|secret|token|card|nic|otp|cvv|bank_account)/.test(lk)) {
      delete patch[k];
    }
  }
  const styleAct = [...actions].reverse().find((a) => a?.tool === 'comm_style' && a.ok);
  const scriptMode = styleAct?.script_mode || patch.script_mode || prevMeta.script_mode || null;

  const meta = {
    ...prevMeta,
    last_turn_at: new Date().toISOString(),
    last_actions: actions.slice(0, 8),
    language: patch.language || language,
    script_mode: scriptMode,
    hair_length: patch.hair_length || (lengthHit ? lengthHit[0] : (prevMeta.hair_length || null)),
    last_date_interest: dateHit ? dateHit[0] : (prevMeta.last_date_interest || null),
    booking_state: flowAct?.state || pauseAct?.state || patch.booking_state || prevMeta.booking_state || null,
    booking_paused: typeof flowAct?.paused === 'boolean'
      ? flowAct.paused
      : (typeof pauseAct?.paused === 'boolean'
        ? pauseAct.paused
        : (typeof patch.booking_paused === 'boolean' ? patch.booking_paused : (prevMeta.booking_paused || false))),
    last_service: flowAct?.service || pauseAct?.service || patch.last_service || prevMeta.last_service || null,
    current_topic: patch.current_topic || prevMeta.current_topic || null,
    last_intent: patch.last_intent || prevMeta.last_intent || null,
    unresolved_question: patch.unresolved_question || null,
    last_quoted_price: patch.last_quoted_price || prevMeta.last_quoted_price || null,
    pricing_service_key: patch.pricing_service_key || prevMeta.pricing_service_key || null,
    // Sir/Madam preference — only from explicit customer statement / correction (never name inference)
    address_preference: (patch.address_preference === 'sir' || patch.address_preference === 'madam')
      ? patch.address_preference
      : (prevMeta.address_preference || null),
    honorific: (patch.honorific === 'sir' || patch.honorific === 'madam')
      ? patch.honorific
      : ((patch.address_preference === 'sir' || patch.address_preference === 'madam')
        ? patch.address_preference
        : (prevMeta.honorific || prevMeta.address_preference || null)),
    address_form: patch.address_form || prevMeta.address_form || null,
    address_preference_asked: !!(patch.address_preference_asked || prevMeta.address_preference_asked),
    // RC7 advanced memory
    conversation_summary: patch.conversation_summary
      ? String(patch.conversation_summary).slice(0, 480)
      : (prevMeta.conversation_summary || null),
    pending_questions: Array.isArray(patch.pending_questions)
      ? patch.pending_questions.slice(0, 8)
      : (Array.isArray(prevMeta.pending_questions) ? prevMeta.pending_questions.slice(0, 8) : []),
    commitments: Array.isArray(patch.commitments)
      ? patch.commitments.slice(0, 8)
      : (Array.isArray(prevMeta.commitments) ? prevMeta.commitments.slice(0, 8) : []),
    correction_log: Array.isArray(patch.correction_log)
      ? patch.correction_log.slice(-12)
      : (Array.isArray(prevMeta.correction_log) ? prevMeta.correction_log.slice(-12) : []),
    emotion: patch.emotion || prevMeta.emotion || null,
    last_trace_id: (() => {
      const tr = [...actions].reverse().find((a) => a?.tool === 'turn_trace' && a.trace_id);
      return tr?.trace_id || prevMeta.last_trace_id || null;
    })(),
  };

  if (Array.isArray(patch.preferred_services)) {
    for (const s of patch.preferred_services) {
      const name = String(s || '').trim();
      if (name && !preferred.includes(name)) preferred.unshift(name);
    }
  }

  const payload = {
    tenant_id: tenantId,
    conversation_id: conversationId || row?.conversation_id || null,
    lead_id: leadId || row?.lead_id || null,
    phone: digits,
    preferred_services: preferred.slice(0, 20),
    preferred_branch_id: booking?.payload?.branch_id || row?.preferred_branch_id || null,
    objections: objections ? String(objections).slice(0, 800) : null,
    summary: summaryBits.filter(Boolean).join(' · ').slice(0, 2000),
    meta,
  };

  if (row) {
    await row.update(payload);
    return row;
  }
  return CrmAiMemory.create(payload);
}

/**
 * Map booking flow state → CRM lead stage.
 */
function stageFromFlowState(state, bookingStatus) {
  if (bookingStatus === 'confirmed') return 'booking_confirmed';
  if (bookingStatus === 'cancelled') return null;
  const s = String(state || '');
  if (['await_confirm', 'await_name', 'await_time', 'await_date'].includes(s)) return 'booking_requested';
  if (['await_service', 'await_staff'].includes(s)) return 'qualified';
  if (s && s !== 'idle') return 'interested';
  return null;
}

module.exports = {
  loadMemory,
  memoryToContext,
  upsertMemoryFromTurn,
  stageFromFlowState,
  detectLangHint,
};
