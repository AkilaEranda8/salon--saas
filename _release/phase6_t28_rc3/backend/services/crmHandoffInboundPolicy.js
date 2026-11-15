/**
 * Policy for inbound WhatsApp messages while conversation is in handoff
 * (status: queued | human_active).
 *
 * Rules:
 * - Never silently leave the customer without a reply when possible.
 * - Do not spam the same generic teammate ack.
 * - While handoff is pending, AI may answer FAQ / check-ins / substantial asks
 *   without cancelling handoff.
 * - Soft system failures (provider_unavailable) should auto-resume AI.
 */
'use strict';

const HANDOFF_STATUSES = ['queued', 'human_active'];

/** Explicit ask for a human — do not AI-answer; staff path only. */
const HUMAN_ONLY_RE = /\b(?:staff|human|agent|manager|operator|talk\s+to\s+(?:a\s+)?(?:person|human|someone)|speak\s+to\s+(?:a\s+)?(?:person|human)|call\s+me|connect\s+(?:me\s+)?(?:to\s+)?(?:staff|team))\b|කාර්ය\s*මණ්ඩල|මනුස්සයෙක්|කෙනෙක්\s*connect/i;

/**
 * Safe FAQ / context asks AI may answer during handoff.
 */
const HANDOFF_FAQ_RE = /\b(?:location|address|directions?|parking|hours?|open|close|closing|opening|price|prices|mila|kiyada|gana|ganada|cost|how\s+much|duration|long|minutes?|wela|kochchara|koheda|kohada|where|located|salon\s+eka|kandy|branch)\b|කොහෙද|ලිපිනය|විවෘත|කීයද|ගාන|කොච්චර|වේලා|මිල/i;

/** Short check-ins that previously went silent while queued. */
const GREETING_CHECKIN_RE = /^(?:hi+|hii+|hello|hey+|hai|yo|ok+|okay|oka+|hari|hmm+|hm+|ayo+|ayubowan|na+|naha|yes+|yeah|yep|ආයුබෝවන්|හරි|ඔක්|නැහැ|නෑ)[\s!.]*$/i;

/** Short booking / service cues (1–2 words) that must not go silent while queued. */
const QUEUED_SHORT_ASK_RE = /^(?:gents|ladies|available(?:\s+time)?|time|times?|confirm(?:\s+karanna)?|booking|slot|haircut|color|colour|wax|facial|keratin|kauda|oya\s*kauda|kaud\s*oya|who\s+are\s+you)[\s!.?]*$/i;

/**
 * Handoff reasons that should NOT block AI on the next customer message.
 * (Credits exhausted stays queued until top-up.)
 */
const AUTO_RESUME_HANDOFF_RE = /provider_unavailable|price_output_blocked|ai_error:/i;

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

function isGreetingOrCheckin(message) {
  const t = String(message || '').trim();
  if (!t || t.length > 24) return false;
  return GREETING_CHECKIN_RE.test(t);
}

function isQueuedShortAsk(message) {
  const t = String(message || '').trim();
  if (!t || t.length > 40) return false;
  return QUEUED_SHORT_ASK_RE.test(t);
}

function wantsHumanOnly(message) {
  return HUMAN_ONLY_RE.test(String(message || ''));
}

function isHandoffFaqAsk(message) {
  return HANDOFF_FAQ_RE.test(String(message || ''));
}

function shouldAutoResumeHandoff(handoffReason) {
  return AUTO_RESUME_HANDOFF_RE.test(String(handoffReason || ''));
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
  // queued: substantial asks + check-ins + short service/booking cues (never silent)
  if (st === 'queued') {
    if (isSubstantialAsk(message)) return true;
    if (isGreetingOrCheckin(message)) return true;
    if (isQueuedShortAsk(message)) return true;
  }
  return false;
}

function handoffAckText(message) {
  // Sent only after conversation is already queued — safe to confirm staff queue.
  if (looksSinglishOrSi(message)) {
    return 'Hari, oyage message eka team queue ekata add wela thiyenawa. Podi welawak denna.';
  }
  return 'Thank you. Your message is queued for our team. Please give us a moment.';
}

/** Soft bump when episode ack already sent — never leave customer with zero reply. */
function handoffSoftBumpText(message) {
  if (looksSinglishOrSi(message)) {
    return (
      'Hari, oyage message eka team ekata gihilla thiyenawa. '
      + 'Location / hours / price ahanawanam mata kiyanna puluwan — nathnam team eka reply karai.'
    );
  }
  return (
    'Thanks — your message is still with our team. '
    + 'If you need location, hours, or prices I can help now; otherwise the team will reply.'
  );
}

/** Redis TTL for one-ack-per-handoff-episode (seconds). */
const HANDOFF_ACK_EPISODE_TTL_SEC = Number(process.env.CRM_HANDOFF_ACK_TTL_SEC) || 14400;
/** Soft bump cooldown — short so follow-ups never sit silent for minutes. */
const HANDOFF_SOFT_BUMP_TTL_SEC = Number(process.env.CRM_HANDOFF_SOFT_BUMP_TTL_SEC) || 45;

module.exports = {
  HANDOFF_STATUSES,
  HANDOFF_ACK_EPISODE_TTL_SEC,
  HANDOFF_SOFT_BUMP_TTL_SEC,
  looksSinglishOrSi,
  isSubstantialAsk,
  isGreetingOrCheckin,
  isQueuedShortAsk,
  wantsHumanOnly,
  isHandoffFaqAsk,
  shouldAutoResumeHandoff,
  shouldAssistDuringHandoff,
  handoffAckText,
  handoffSoftBumpText,
};
