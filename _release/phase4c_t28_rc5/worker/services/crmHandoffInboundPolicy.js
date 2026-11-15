/**
 * Policy for inbound WhatsApp messages while conversation is in handoff
 * (status: queued | human_active).
 *
 * Rules:
 * - Never silently discard inbound messages (caller persists).
 * - Do not spam the same generic "teammate will reply" ack.
 * - While handoff is pending, AI may answer verified FAQ / clear asks
 *   without cancelling handoff.
 * - When a human owns the chat (human_active), only safe FAQs may be AI-answered.
 */
'use strict';

const HANDOFF_STATUSES = ['queued', 'human_active'];

/** Explicit ask for a human — do not AI-answer; staff path only. */
const HUMAN_ONLY_RE = /\b(?:staff|human|agent|manager|operator|talk\s+to\s+(?:a\s+)?(?:person|human|someone)|speak\s+to\s+(?:a\s+)?(?:person|human)|call\s+me|connect\s+(?:me\s+)?(?:to\s+)?(?:staff|team))\b|කාර්ය\s*මණ්ඩල|මනුස්සයෙක්|කෙනෙක්\s*connect/i;

/**
 * Safe FAQ / context asks AI may answer during handoff (location, hours, duration, price).
 * Includes Singlish: koheda, kochchara wela, salon eka, kandy (location clarify).
 */
const HANDOFF_FAQ_RE = /\b(?:location|address|directions?|parking|hours?|open|close|closing|opening|price|prices|mila|kiyada|gana|ganada|cost|how\s+much|duration|long|minutes?|wela|kochchara|koheda|kohada|where|located|salon\s+eka|kandy|branch)\b|කොහෙද|ලිපිනය|විවෘත|කීයද|ගාන|කොච්චර|වේලා|මිල/i;

function looksSinglishOrSi(text) {
  const t = String(text || '');
  return /[\u0D80-\u0DFF]/.test(t) || /\b(?:oni|ona|hari|kohomada|mila|mata|ehenam|kiyanna|puluwan|koheda|kochchara)\b/i.test(t);
}

function isSubstantialAsk(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (/\?/.test(t)) return true;
  const words = t.trim().split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

function wantsHumanOnly(message) {
  return HUMAN_ONLY_RE.test(String(message || ''));
}

function isHandoffFaqAsk(message) {
  return HANDOFF_FAQ_RE.test(String(message || ''));
}

/**
 * @param {string} message
 * @param {'queued'|'human_active'|string} status
 * @returns {boolean}
 */
function shouldAssistDuringHandoff(message, status) {
  const st = String(status || '');
  if (!HANDOFF_STATUSES.includes(st)) return false;
  if (wantsHumanOnly(message)) return false;
  if (isHandoffFaqAsk(message)) return true;
  // queued (waiting for staff): also allow other substantial asks; keep handoff active
  if (st === 'queued' && isSubstantialAsk(message)) return true;
  return false;
}

/**
 * Customer-facing ack — only for the first message of a handoff episode when AI will not answer.
 * Prefer respectful Singlish/Sinhala/English; no false callback detail beyond "team will reply".
 */
function handoffAckText(message) {
  if (looksSinglishOrSi(message)) {
    return 'Hari Sir/Madam, oyage message eka team ekata gihin thiyenawa. Podi welaawak denna.';
  }
  return 'Thank you, Sir/Madam. Your message is with our team. Please give us a moment.';
}

/** Redis TTL for one-ack-per-handoff-episode (seconds). Matches typical auto-release window. */
const HANDOFF_ACK_EPISODE_TTL_SEC = Number(process.env.CRM_HANDOFF_ACK_TTL_SEC) || 14400;

module.exports = {
  HANDOFF_STATUSES,
  HANDOFF_ACK_EPISODE_TTL_SEC,
  looksSinglishOrSi,
  isSubstantialAsk,
  wantsHumanOnly,
  isHandoffFaqAsk,
  shouldAssistDuringHandoff,
  handoffAckText,
};
