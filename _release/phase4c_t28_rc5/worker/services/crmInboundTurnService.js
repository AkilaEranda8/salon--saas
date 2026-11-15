/**
 * Process one inbound WhatsApp AI turn.
 * C4: resume PENDING_AI / PROCESSING turns after crash — never drop replies.
 */
'use strict';

const {
  Tenant,
  TenantAiSettings,
  CrmMessage,
  CrmConversation,
} = require('../models');
const { ensureConversation, appendMessage, setMarketingOptOut } = require('./crmConversationService');
const { sendAndLog } = require('./crmOutboundSendService');
const { runTurn } = require('./aiEngineClient');
const { enqueue, QUEUE_NAMES } = require('./queue');
const { getRedis, cacheKey } = require('../utils/redis');
const { emitConversationChanged } = require('./crmRealtime');

const TURN_PENDING = 'pending_ai';
const TURN_PROCESSING = 'processing';
const TURN_COMPLETED = 'completed';

/** Never leave the customer without a WhatsApp reply. */
function looksSinglishOrSi(text) {
  const t = String(text || '');
  return /[\u0D80-\u0DFF]/.test(t) || /\b(?:oni|ona|hari|kohomada|mila|mata|ehenam|kiyanna|puluwan)\b/i.test(t);
}

/** Customer is correcting / asking something specific — never replace with generic welcome. */
function isSubstantialCustomerAsk(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (/\[Customer sent a (?:photo|voice note)\]/i.test(t)) return true;
  if (/\bahana\s+deta\b|\bnemei\b|\breply\s+denn|\bmama\s+ahuwe|\beka\s+nemei|\boya\s+therum|\bquestion\s+ekata|\bwrong\s+answer|\bnot\s+what\s+i\s+asked/i.test(t)) {
    return true;
  }
  if (/\?|kiyada|mila|gana|price|cost|how\s+much|කීයද|ගාන|details?|keratin|facial|waxing|booking|appointment/i.test(t)) {
    return true;
  }
  // Longer than a greeting / yes-no
  const words = t.trim().split(/\s+/).filter(Boolean);
  return words.length >= 4;
}

function correctionFallbackText(message) {
  if (looksSinglishOrSi(message)) {
    return 'Sorry — oyage question eka miss una. Mokakda ahuwe? Mata eka hariyata answer karannam.';
  }
  return 'Sorry I missed that — what were you asking? I’ll answer that directly.';
}

function alwaysReplyText({ message, brand }) {
  const b = brand || 'the salon';
  // Corrections / substantial asks: never the generic "say book" bubble
  if (/\bahana\s+deta\b|\bnemei\b|\breply\s+denn|\bmama\s+ahuwe|\beka\s+nemei/i.test(String(message || ''))) {
    return correctionFallbackText(message);
  }
  if (looksSinglishOrSi(message)) {
    return `හරි! ${b} එකෙන් උදව් කරන්නම් — *book*, මිල, හෝ hours ගැන කියන්න.`;
  }
  return `Got it! How can I help at ${b} — say *book*, ask prices, or hours.`;
}

const {
  HANDOFF_STATUSES,
  HANDOFF_ACK_EPISODE_TTL_SEC,
  shouldAssistDuringHandoff,
  handoffAckText,
} = require('./crmHandoffInboundPolicy');

// \b doesn't work after Sinhala letters, so use a letter lookahead instead.
const OPT_OUT_RE = /^(stop|unsubscribe|එපා|නවත්වන්න)(?![\p{L}\p{M}])/iu;

/** Short "STOP"-style message (guard length so "stop by at 5" style chat isn't an opt-out). */
function isOptOutMessage(text) {
  const t = String(text || '').trim();
  return t.length > 0 && t.length <= 40 && OPT_OUT_RE.test(t);
}

async function loadAiSettings(tenantId) {
  const row = await TenantAiSettings.findOne({ where: { tenant_id: tenantId } });
  if (!row) {
    return { provider: 'openai', model: 'gpt-4o-mini' };
  }
  return {
    provider: row.provider || 'openai',
    model: row.model || 'gpt-4o-mini',
  };
}

async function findCompletedOutbound(tenantId, conversationId, waMessageId) {
  if (!waMessageId) return null;
  const rows = await CrmMessage.findAll({
    where: {
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'ai',
    },
    order: [['id', 'DESC']],
    limit: 20,
  });
  return rows.find((m) => m.meta && m.meta.inbound_wa_message_id === waMessageId) || null;
}

async function markTurnState(conversation, state, waMessageId) {
  await conversation.update({
    ai_turn_state: state,
    ai_turn_wa_message_id: waMessageId || conversation.ai_turn_wa_message_id || null,
  });
}

/**
 * @param {object} jobData
 */
async function processInboundAiTurn(jobData) {
  const tenantId = Number(jobData.tenantId || jobData.tenant_id);
  const phone = String(jobData.phone || '');
  let message = String(jobData.message || '').trim();
  const waMessageId = jobData.waMessageId || jobData.wa_message_id || null;
  const images = Array.isArray(jobData.images)
    ? jobData.images
      .filter((img) => img && typeof img === 'object' && String(img.dataBase64 || '').length > 32)
      .slice(0, 3)
      .map((img) => ({
        mimeType: String(img.mimeType || 'image/jpeg').split(';')[0] || 'image/jpeg',
        dataBase64: String(img.dataBase64),
      }))
    : [];
  const audioIn = jobData.audio && typeof jobData.audio === 'object'
    ? jobData.audio
    : null;
  const hasAudio = !!(audioIn && String(audioIn.dataBase64 || '').length > 64);

  if (!message && images.length) {
    message = '[Customer sent a photo]';
  }
  if ((!message || message === '[Customer sent a voice note]') && hasAudio) {
    message = '[Customer sent a voice note]';
  }

  if (!tenantId || !phone || (!message && !images.length && !hasAudio)) {
    throw new Error('tenantId, phone, and message (or images/audio) are required');
  }

  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  // Owner must tick required AI access grants before automated replies run.
  try {
    const { TenantAiSettings } = require('../models');
    const { requiredGranted, missingRequired } = require('./crmAiAccessGrants');
    const aiRow = await TenantAiSettings.findOne({ where: { tenant_id: tenantId } });
    if (!requiredGranted(aiRow?.access_grants)) {
      const missing = missingRequired(aiRow?.access_grants);
      return {
        skipped: true,
        reason: 'ai_access_not_granted',
        missing,
      };
    }
  } catch (grantErr) {
    console.warn('[inbound] access grant check failed:', grantErr.message);
  }

  let resumeInbound = null;
  let skipInsert = false;

  if (waMessageId) {
    const existing = await CrmMessage.findOne({
      where: { tenant_id: tenantId, wa_message_id: waMessageId },
    });

    if (existing) {
      const done = await findCompletedOutbound(
        tenantId,
        existing.conversation_id,
        waMessageId
      );
      if (done) {
        return {
          skipped: true,
          reason: 'duplicate_wa_message_completed',
          conversationId: existing.conversation_id,
          messageId: existing.id,
        };
      }

      // Incomplete turn — resume (C4)
      const conv = await CrmConversation.findByPk(existing.conversation_id);
      const state = conv?.ai_turn_state;
      if (
        existing.direction === 'inbound'
        && (!state || state === TURN_PENDING || state === TURN_PROCESSING)
      ) {
        resumeInbound = existing;
        skipInsert = true;
        message = existing.body || message;
        if (conv) await markTurnState(conv, TURN_PENDING, waMessageId);
      } else if (existing.direction === 'inbound' && state === TURN_COMPLETED) {
        return {
          skipped: true,
          reason: 'duplicate_wa_message_completed',
          conversationId: existing.conversation_id,
          messageId: existing.id,
        };
      } else {
        return {
          skipped: true,
          reason: 'duplicate_wa_message',
          conversationId: existing.conversation_id,
          messageId: existing.id,
        };
      }
    } else {
      const redis = getRedis();
      if (redis) {
        const lockKey = cacheKey(tenantId, 'crm', 'inbound_lock', waMessageId);
        const got = await redis.set(lockKey, '1', 'EX', 180, 'NX');
        if (!got) {
          return { skipped: true, reason: 'inbound_in_progress', waMessageId };
        }
      }
    }
  }

  const { lead, conversation } = await ensureConversation({
    tenantId,
    phone,
    name: jobData.name || null,
    campaignSource: jobData.campaignSource || jobData.campaign_source || null,
    branchId: jobData.branchId || null,
  });

  // Marketing opt-out (STOP) — flag the lead so promo/birthday/rebooking skip them
  const optOutRequested = isOptOutMessage(message);
  if (optOutRequested && !lead.marketing_opt_out) {
    try {
      await setMarketingOptOut(tenantId, lead.phone || phone, true);
      lead.marketing_opt_out = true;
    } catch (e) {
      console.warn('[inbound] opt-out save failed', e.message);
    }
  }

  // Handoff pending (queued) or human takeover (human_active):
  // - Always persist + notify staff (never silently drop).
  // - AI may answer safe FAQ / substantial asks while KEEPING handoff status.
  // - Do NOT spam the same generic teammate ack on every message.
  let preserveHandoffStatus = null;
  if (HANDOFF_STATUSES.includes(conversation.status) && !resumeInbound) {
    const handoffStatus = conversation.status;
    const assist = shouldAssistDuringHandoff(message, handoffStatus);

    // Staff must always see new customer messages
    try {
      const { notifyStaffInboundWhileHandoff } = require('./crmHandoffService');
      await notifyStaffInboundWhileHandoff({
        tenantId,
        conversationId: conversation.id,
        status: handoffStatus,
      });
    } catch (e) {
      console.warn('[inbound] handoff re-notify', e.message);
    }

    if (!assist) {
      try {
        await appendMessage({
          tenantId,
          conversationId: conversation.id,
          direction: 'inbound',
          senderType: 'customer',
          body: message,
          waMessageId,
          deliveryStatus: 'received',
          meta: {
            skipped_ai: true,
            reason: handoffStatus,
            turn_state: TURN_COMPLETED,
            handoff_assist: false,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          return { skipped: true, reason: 'duplicate_wa_message' };
        }
        throw e;
      }
      // One acknowledgement per handoff episode only (not every 120s)
      try {
        const redis = getRedis();
        const ackKey = cacheKey(tenantId, 'crm', 'handoff_ack_episode', String(conversation.id));
        const allowAck = !redis || !!(await redis.set(ackKey, '1', 'EX', HANDOFF_ACK_EPISODE_TTL_SEC, 'NX'));
        if (allowAck) {
          await sendAndLog({
            tenantId,
            phone: lead.phone || phone,
            text: handoffAckText(message),
            senderType: 'bot',
            conversationId: conversation.id,
            replyJid: jobData.replyJid || jobData.reply_jid || null,
            meta: {
              source: 'handoff_ack',
              event_type: 'handoff_ack',
              episode: true,
              replyJid: jobData.replyJid || jobData.reply_jid || null,
            },
          });
        }
      } catch (e) {
        console.warn('[inbound] handoff ack', e.message);
      }
      return {
        skipped: true,
        reason: handoffStatus,
        conversationId: conversation.id,
        leadId: lead.id,
        replyText: 'handoff_staff_only',
        handoff_assist: false,
      };
    }

    // AI assist while handoff stays active — fall through to normal turn path
    preserveHandoffStatus = handoffStatus;
    jobData._preserveHandoffStatus = handoffStatus;
    jobData._handoffAssist = true;
  } else if (HANDOFF_STATUSES.includes(conversation.status) && resumeInbound) {
    // Crash-resume mid-turn must not flip queued/human_active back to ai_active
    preserveHandoffStatus = conversation.status;
    jobData._preserveHandoffStatus = conversation.status;
    jobData._handoffAssist = true;
  }

  let inboundMsg = resumeInbound;
  if (!skipInsert) {
    try {
      inboundMsg = await appendMessage({
        tenantId,
        conversationId: conversation.id,
        direction: 'inbound',
        senderType: 'customer',
        body: message,
        waMessageId,
        deliveryStatus: 'received',
        meta: {
          turn_state: TURN_PENDING,
          reply_jid: jobData.replyJid || jobData.reply_jid || null,
          channel: jobData.channel || null,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Race: another worker inserted — re-enter resume path
        return processInboundAiTurn(jobData);
      }
      throw e;
    }
  }

  await markTurnState(conversation, TURN_PENDING, waMessageId);
  await markTurnState(conversation, TURN_PROCESSING, waMessageId);
  if (inboundMsg && !resumeInbound) {
    await inboundMsg.update({
      meta: { ...(inboundMsg.meta || {}), turn_state: TURN_PROCESSING },
    }).catch(() => {});
  }

  if (lead.stage === 'new') {
    await lead.update({ stage: 'conversation' });
  }

  if (optOutRequested) {
    // Acknowledge and stop — don't let the AI reply with sales text to a STOP
    try {
      await sendAndLog({
        tenantId,
        phone: lead.phone || phone,
        text: 'You’re unsubscribed from promotional messages. Reply *book* any time if you need us.',
        senderType: 'bot',
        conversationId: conversation.id,
        meta: { source: 'marketing_opt_out', inbound_wa_message_id: waMessageId },
      });
    } catch (e) {
      console.warn('[inbound] opt-out confirm', e.message);
    }
    await markTurnState(conversation, TURN_COMPLETED, waMessageId);
    if (inboundMsg) {
      await inboundMsg.update({
        meta: { ...(inboundMsg.meta || {}), turn_state: TURN_COMPLETED, opt_out: true },
      }).catch(() => {});
    }
    return {
      skipped: true,
      reason: 'marketing_opt_out',
      conversationId: conversation.id,
      leadId: lead.id,
    };
  }

  // Prepaid credit wallet — block AI when top-ups exist and balance is exhausted
  try {
    const { getAiCreditGate } = require('./crmCreditGate');
    const gate = await getAiCreditGate(tenantId);
    if (gate.blocked) {
      const pauseText = gate.message;
      let pauseMsg = null;
      try {
        pauseMsg = await appendMessage({
          tenantId,
          conversationId: conversation.id,
          direction: 'outbound',
          senderType: 'system',
          body: pauseText,
          deliveryStatus: 'pending',
          meta: { credit_blocked: true, remaining: gate.remaining },
        });
      } catch (e) {
        console.warn('[inbound] credit pause append', e.message);
      }
      await conversation.update({
        status: 'queued',
        handoff_reason: 'ai_credits_exhausted',
        ai_turn_state: TURN_COMPLETED,
      });
      await enqueue(QUEUE_NAMES.HANDOFF, {
        tenant_id: tenantId,
        conversation_id: conversation.id,
        reason: 'ai_credits_exhausted',
      }).catch(() => {});
      if (pauseMsg) {
        await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
          tenant_id: tenantId,
          conversation_id: conversation.id,
          phone: lead.phone || phone,
          message: pauseText,
          crm_message_id: pauseMsg.id,
          sender_type: 'system',
          replyJid: jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null,
        }, { name: 'credit-pause' }).catch(() => {});
      }
      emitConversationChanged(tenantId, conversation.id, { reason: 'ai_credits_exhausted' });
      return {
        skipped: false,
        credit_blocked: true,
        conversationId: conversation.id,
        leadId: lead.id,
        replyText: pauseText,
      };
    }
  } catch (e) {
    console.warn('[inbound] credit gate', e.message);
  }

  const settings = await loadAiSettings(tenantId);
  const brand = tenant.brand_name || tenant.name || 'Salon';

  // Voice note → text (Gemini) so booking flow + LLM both understand the customer
  let voiceTranscript = null;
  if (hasAudio) {
    try {
      const { transcribeAudio } = require('./aiEngineClient');
      const tr = await transcribeAudio({
        tenantId,
        mimeType: String(audioIn.mimeType || 'audio/ogg').split(';')[0] || 'audio/ogg',
        dataBase64: String(audioIn.dataBase64),
        hint: 'WhatsApp voice note from a salon customer (Sinhala / Singlish / English / Tamil possible)',
      });
      voiceTranscript = String(tr?.text || tr?.transcript || '').trim();
      if (voiceTranscript) {
        message = voiceTranscript;
        console.log('[inbound] voice transcribed', {
          tenantId,
          chars: voiceTranscript.length,
          preview: voiceTranscript.slice(0, 80),
        });
        if (inboundMsg) {
          await inboundMsg.update({
            body: `🎤 ${voiceTranscript.slice(0, 1900)}`,
            meta: {
              ...(inboundMsg.meta || {}),
              voice_transcript: voiceTranscript.slice(0, 2000),
              voice_mime: audioIn.mimeType || null,
            },
          }).catch(() => {});
        }
      } else {
        message = message || 'I sent a voice note but it could not be understood — please reply in text.';
      }
    } catch (ve) {
      console.warn('[inbound] voice transcribe', ve.message);
      message = message && message !== '[Customer sent a voice note]'
        ? message
        : (
          'Customer sent a WhatsApp voice note but transcription failed. '
          + 'Reply briefly asking them to type the same request in text (Sinhala/Singlish/English OK).'
        );
    }
  } else if (jobData.audioDownloadFailed || /voice note but it could not be downloaded/i.test(message)) {
    // Download failed upstream — still run a turn so the customer is not left on read.
    message = (
      'Customer tried to send a voice note but the audio could not be downloaded. '
      + 'Apologize briefly and ask them to type their question.'
    );
  }

  let memoryCtx = null;
  try {
    const { loadMemory, memoryToContext } = require('./crmAiMemoryService');
    const mem = await loadMemory(tenantId, {
      phone: lead.phone || phone,
      conversationId: conversation.id,
      leadId: lead.id,
    });
    memoryCtx = memoryToContext(mem);
  } catch (e) {
    console.warn('[inbound] memory load', e.message);
  }

  // Recent thread for multi-turn context (exclude the inbound we just inserted)
  let recentMessages = [];
  try {
    const hist = await CrmMessage.findAll({
      where: { tenant_id: tenantId, conversation_id: conversation.id },
      order: [['id', 'DESC']],
      limit: 8,
      attributes: ['id', 'direction', 'sender_type', 'body'],
    });
    recentMessages = hist
      .filter((m) => !inboundMsg || m.id !== inboundMsg.id)
      .reverse()
      .map((m) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: String(m.body || '').slice(0, 280),
      }))
      .filter((m) => m.content);
  } catch (e) {
    console.warn('[inbound] history load', e.message);
  }

  let kbHints = null;
  try {
    const { hasTenantFeature } = require('../utils/tenantFeatures');
    if (hasTenantFeature(tenant, 'ai_knowledge_base')) {
      const {
        searchKnowledge,
        formatSnippetsForPrompt,
        listArticles,
      } = require('./knowledgeService');
      // Keep KB compact — large prompts slow Gemini WhatsApp replies
      const hits = await searchKnowledge(tenantId, message, { limit: 5 });
      const seen = new Set(hits.map((h) => Number(h.id)));
      let priorityRows = [];
      try {
        const all = await listArticles(tenantId, { activeOnly: true });
        priorityRows = all
          .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
          .slice(0, 4)
          .map((r) => {
            const j = typeof r.toJSON === 'function' ? r.toJSON() : r;
            return {
              id: j.id,
              title: j.title,
              category: j.category,
              body: String(j.body || '').slice(0, 700),
              tags: j.tags,
              locale: j.locale,
              priority: j.priority,
              score: (Number(j.priority) || 0) * 3,
            };
          })
          .filter((h) => !seen.has(Number(h.id)));
      } catch (pe) {
        console.warn('[inbound] kb priority pad', pe.message);
      }
      const merged = [...hits, ...priorityRows]
        .map((h) => ({ ...h, body: String(h.body || '').slice(0, 700) }))
        .slice(0, 6);
      if (merged.length) {
        kbHints = { hits: merged, prompt_block: formatSnippetsForPrompt(merged) };
      }
    }
  } catch (e) {
    console.warn('[inbound] kb search', e.message);
  }

  let rulesBlock = '';
  try {
    const { listActiveRules, formatRulesForPrompt } = require('./crmRulesService');
    const rules = await listActiveRules(tenantId);
    rulesBlock = formatRulesForPrompt(rules);
  } catch (e) {
    console.warn('[inbound] rules load', e.message);
  }

  // Show WhatsApp "typing…" via API process (Baileys socket lives there, not in worker)
  try {
    const secret = process.env.AI_ENGINE_SERVICE_SECRET || process.env.CRM_SERVICE_SECRET || '';
    const base = (process.env.BACKEND_INTERNAL_URL || 'http://backend:5000').replace(/\/$/, '');
    const rj = jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null;
    if (secret) {
      fetch(`${base}/api/crm/internal/whatsapp-composing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': secret,
          'X-Tenant-Id': String(tenantId),
        },
        body: JSON.stringify({
          tenantId,
          phone: lead.phone || phone,
          replyJid: rj,
          conversation_id: conversation.id,
        }),
      }).catch(() => {});
    }
  } catch (te) {
    console.warn('[inbound] composing', te.message);
  }

  let turn;
  try {
    turn = await runTurn({
      tenantId,
      conversationId: conversation.id,
      phone: lead.phone || phone,
      message,
      brand,
      provider: settings.provider,
      model: settings.model,
      kbHints,
      rulesBlock: rulesBlock || undefined,
      recentMessages,
      images: images.length ? images : undefined,
      customerContext: {
        name: lead.name || jobData.name || null,
        leadId: lead.id,
        customerId: lead.customer_id || null,
        memory: memoryCtx || undefined,
        handoffPending: !!(preserveHandoffStatus || jobData._preserveHandoffStatus),
        handoffStatus: preserveHandoffStatus || jobData._preserveHandoffStatus || null,
      },
    });
  } catch (err) {
    const softReply = alwaysReplyText({ message, brand });
    let apologyMsg = null;
    try {
      apologyMsg = await appendMessage({
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'ai',
        body: softReply,
        deliveryStatus: 'pending',
        meta: {
          error: err.message,
          soft_fallback: true,
          always_reply: true,
          inbound_message_id: inboundMsg?.id,
          inbound_wa_message_id: waMessageId,
        },
      });
    } catch (appendErr) {
      console.error('[inbound] soft fallback append failed', appendErr.message);
    }

    // Keep AI channel open on provider/transient errors so the next customer
    // message retries after keys/quota are fixed (do not soft-lock as queued).
    // Exception: handoff-assist turns must remain queued/human_active.
    const transient = /429|quota|rate|timeout|ECONN|fetch failed|503|502|unavailable|high demand/i.test(String(err.message || ''));
    const keepHandoff = preserveHandoffStatus || jobData._preserveHandoffStatus || null;
    await conversation.update({
      status: keepHandoff || 'ai_active',
      handoff_reason: keepHandoff
        ? (conversation.handoff_reason || null)
        : (transient ? null : `ai_error: ${err.message}`.slice(0, 255)),
      ai_turn_state: TURN_COMPLETED,
    });
    if (inboundMsg) {
      await inboundMsg.update({
        meta: { ...(inboundMsg.meta || {}), turn_state: TURN_COMPLETED, error: err.message },
      }).catch(() => {});
    }

    const rj = jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null;
    if (apologyMsg) {
      const outJobId = waMessageId ? `wa-out-err-${tenantId}-${waMessageId}` : undefined;
      const jobOk = await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
        tenant_id: tenantId,
        conversation_id: conversation.id,
        phone: lead.phone || phone,
        message: softReply,
        crm_message_id: apologyMsg.id,
        sender_type: 'ai',
        replyJid: rj,
      }, { name: 'ai-error-soft', jobId: outJobId }).catch((e) => {
        console.error('[inbound] soft fallback enqueue failed', e.message);
        return null;
      });
      if (!jobOk) {
        await sendAndLog({
          tenantId,
          phone: lead.phone || phone,
          text: softReply,
          senderType: 'ai',
          conversationId: conversation.id,
          replyJid: rj,
          meta: { source: 'always_reply_direct', event_type: 'always_reply' },
        }).catch((e) => console.error('[inbound] always reply direct', e.message));
      }
    }

    emitConversationChanged(tenantId, conversation.id, { reason: 'ai_soft_fallback' });
    return {
      skipped: false,
      failed: false,
      unrecoverable: false,
      soft_fallback: true,
      error: err.message,
      conversationId: conversation.id,
      leadId: lead.id,
      replyText: softReply,
    };
  }

  let replyText = String(turn.replyText || turn.reply_text || '').trim();
  // CRITICAL: customer must always get a reply — never silence on empty model/booking text
  if (!replyText) {
    replyText = isSubstantialCustomerAsk(message)
      ? correctionFallbackText(message)
      : alwaysReplyText({ message, brand });
    turn.actions = [
      ...(turn.actions || []),
      {
        tool: isSubstantialCustomerAsk(message) ? 'always_reply_substantial_fill' : 'always_reply_fill',
        ok: true,
      },
    ];
  }
  const quickReplies = Array.isArray(turn.quickReplies)
    ? turn.quickReplies.filter((b) => b && (b.text || b.id)).slice(0, 3)
    : [];
  let outboundMsg = null;

  // Avoid duplicate AI outbound on resume
  const priorOut = waMessageId
    ? await findCompletedOutbound(tenantId, conversation.id, waMessageId)
    : null;
  if (priorOut) {
    await markTurnState(conversation, TURN_COMPLETED, waMessageId);
    return {
      skipped: true,
      reason: 'outbound_already_sent',
      conversationId: conversation.id,
      replyText: priorOut.body,
    };
  }

  outboundMsg = await appendMessage({
    tenantId,
    conversationId: conversation.id,
    direction: 'outbound',
    senderType: 'ai',
    body: replyText,
    deliveryStatus: 'pending',
    meta: {
      actions: turn.actions || [],
      usage: turn.usage || null,
      booking: turn.booking || null,
      quick_replies: quickReplies.length ? quickReplies : undefined,
      inbound_wa_message_id: waMessageId,
      turn_state: TURN_COMPLETED,
    },
  });

  await markTurnState(conversation, TURN_COMPLETED, waMessageId);
  if (inboundMsg) {
    await inboundMsg.update({
      meta: { ...(inboundMsg.meta || {}), turn_state: TURN_COMPLETED },
    }).catch(() => {});
  }

  if (turn.booking) {
    try {
      const { CrmBookingRequest, Appointment } = require('../models');
      const b = turn.booking;
      if (b.status === 'confirmed' && b.salon_appointment_id) {
        await CrmBookingRequest.create({
          tenant_id: tenantId,
          conversation_id: conversation.id,
          lead_id: lead.id,
          status: 'confirmed',
          salon_appointment_id: b.salon_appointment_id,
          payload: b.payload || null,
          idempotency_key: b.idempotency_key || null,
        });
        await lead.update({
          stage: 'booking_confirmed',
          name: lead.name || b.payload?.customer_name || null,
        });
        try {
          const { sendBookingConfirmation } = require('./crmReminderService');
          const appt = await Appointment.findByPk(b.salon_appointment_id);
          if (appt) {
            await sendBookingConfirmation({
              tenantId,
              appointment: appt,
              phone: lead.phone || phone,
              conversationId: conversation.id,
              leadId: lead.id,
            });
          }
        } catch (confirmErr) {
          console.warn('[inbound] booking confirm WA', confirmErr.message);
        }
      } else if (b.status === 'failed' && b.retryable && b.payload) {
        await CrmBookingRequest.create({
          tenant_id: tenantId,
          conversation_id: conversation.id,
          lead_id: lead.id,
          status: 'requested',
          payload: b.payload,
          idempotency_key: b.idempotency_key || null,
          error_message: String(b.error || 'book_failed').slice(0, 255),
        }).catch(() => {});
        await enqueue(QUEUE_NAMES.BOOKING_RETRY, {
          tenant_id: tenantId,
          conversation_id: conversation.id,
          lead_id: lead.id,
          phone: lead.phone || phone,
          payload: b.payload,
          error: b.error || null,
        }, {
          name: 'booking-retry',
          jobId: b.idempotency_key ? `book-retry-${tenantId}-${b.idempotency_key}` : undefined,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }).catch((e) => console.warn('[inbound] booking-retry enqueue', e.message));
      } else if (b.status === 'cancelled') {
        await CrmBookingRequest.create({
          tenant_id: tenantId,
          conversation_id: conversation.id,
          lead_id: lead.id,
          status: 'failed',
          salon_appointment_id: b.salon_appointment_id || null,
          payload: b,
          error_message: 'cancelled_via_whatsapp_ai',
        });
      }
    } catch (e) {
      console.warn('[inbound] booking persist', e.message);
    }
  } else {
    // Advanced chat: sync CRM lead stage from booking state machine
    try {
      const { stageFromFlowState } = require('./crmAiMemoryService');
      const flowAct = [...(turn.actions || [])].reverse().find((a) => a?.tool === 'booking_flow_state' && a.ok);
      const nextStage = stageFromFlowState(
        flowAct?.state || turn.flowState,
        turn.booking?.status,
      );
      const rank = {
        new: 0,
        conversation: 1,
        interested: 2,
        qualified: 3,
        booking_requested: 4,
        booking_confirmed: 5,
      };
      if (nextStage && (rank[nextStage] || 0) > (rank[lead.stage] || 0)) {
        await lead.update({ stage: nextStage }).catch(() => {});
      } else if (
        turn.actions?.some((a) => a.tool === 'list_services' || a.tool === 'book_appointment' || a.tool === 'list_staff')
        && ['new', 'conversation', 'qualified'].includes(lead.stage)
      ) {
        await lead.update({ stage: lead.stage === 'new' ? 'interested' : 'booking_requested' }).catch(() => {});
      }
    } catch (stageErr) {
      console.warn('[inbound] stage sync', stageErr.message);
    }
  }

  try {
    const { upsertMemoryFromTurn } = require('./crmAiMemoryService');
    await upsertMemoryFromTurn({
      tenantId,
      conversationId: conversation.id,
      leadId: lead.id,
      phone: lead.phone || phone,
      message,
      replyText,
      turn,
    });
  } catch (e) {
    console.warn('[inbound] memory upsert', e.message);
  }

  // Google → auto-train KB + learn how we talk (async, never block the customer reply)
  try {
    const { maybeAutoTrainFromTurn } = require('./autoTrainFromGoogle');
    setImmediate(() => {
      maybeAutoTrainFromTurn({
        tenantId,
        message,
        replyText,
        turn,
        brand,
      }).catch((e) => console.warn('[inbound] google auto-train', e.message));
    });
  } catch (e) {
    console.warn('[inbound] google auto-train schedule', e.message);
  }

  const keepHandoff = preserveHandoffStatus || jobData._preserveHandoffStatus || null;
  if (keepHandoff) {
    // AI answered during handoff — never clear queued/human_active
    await conversation.update({
      status: keepHandoff,
      handoff_reason: conversation.handoff_reason
        || (turn.handoff ? String(turn.handoff.reason || 'ai_handoff').slice(0, 255) : null),
    });
    if (turn.handoff) {
      await enqueue(QUEUE_NAMES.HANDOFF, {
        tenant_id: tenantId,
        conversation_id: conversation.id,
        reason: turn.handoff.reason || 'ai_handoff',
        kind: 'handoff_assist_still_needed',
      }).catch(() => {});
    }
  } else if (turn.handoff) {
    await conversation.update({
      status: 'queued',
      handoff_reason: String(turn.handoff.reason || 'ai_handoff').slice(0, 255),
    });
    await enqueue(QUEUE_NAMES.HANDOFF, {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      reason: turn.handoff.reason || 'ai_handoff',
    });
  } else if (conversation.status === 'ai_resume') {
    await conversation.update({ status: 'ai_active', handoff_reason: null });
  }

  if (turn.usage) {
    const usagePayload = {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      provider: turn.usage.provider,
      model: turn.usage.model,
      prompt_tokens: turn.usage.promptTokens || turn.usage.prompt_tokens || 0,
      completion_tokens: turn.usage.completionTokens || turn.usage.completion_tokens || 0,
      latency_ms: turn.usage.latencyMs || turn.usage.latency_ms || null,
      purpose: 'whatsapp_turn',
    };
    // Record inline so cost KPIs stay correct even if the usage worker lags
    try {
      const { recordAiUsage } = require('./aiUsageCost');
      await recordAiUsage(usagePayload);
    } catch (e) {
      console.warn('[inbound] inline ai usage', e.message);
      const usageJobId = waMessageId ? `ai-usage-${tenantId}-${waMessageId}` : undefined;
      await enqueue(QUEUE_NAMES.AI_USAGE, {
        ...usagePayload,
        wa_message_id: waMessageId,
      }, { name: 'usage', jobId: usageJobId }).catch(() => {});
    }
  }

  if (replyText && !priorOut) {
    // Skip enqueue if we already sent the exact same AI text moments ago (retry/dup path)
    let tooSoon = false;
    if (outboundMsg?.id) {
      try {
        const { Op } = require('sequelize');
        const recentSame = await CrmMessage.findOne({
          where: {
            tenant_id: tenantId,
            conversation_id: conversation.id,
            direction: 'outbound',
            sender_type: 'ai',
            body: replyText,
            id: { [Op.ne]: outboundMsg.id },
            delivery_status: { [Op.in]: ['pending', 'sent', 'delivered'] },
            createdAt: { [Op.gte]: new Date(Date.now() - 45000) },
          },
          order: [['id', 'DESC']],
        });
        tooSoon = !!recentSame;
      } catch (e) {
        console.warn('[inbound] dup outbound check', e.message);
      }
    }

    const rj = jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null;
    // If AI repeated the same bubble for a NEW customer message, still reply —
    // never leave them silent (skipped_dup was causing empty WhatsApp threads).
    let sendText = replyText;
    let sendButtons = quickReplies;
    if (tooSoon) {
      // Never replace a real answer to a substantial/correction ask with generic welcome
      if (isSubstantialCustomerAsk(message)) {
        console.warn('[inbound] dup body — keeping original reply for substantial ask', {
          conversationId: conversation.id,
        });
        sendText = replyText;
      } else {
        console.warn('[inbound] dup body — sending short ack instead', { conversationId: conversation.id });
        sendText = alwaysReplyText({ message, brand });
        sendButtons = [];
        if (outboundMsg) {
          await outboundMsg.update({
            body: sendText,
            delivery_status: 'pending',
            meta: { ...(outboundMsg.meta || {}), deduped_ack: true, always_reply: true },
          }).catch(() => {});
        }
      }
    }
    const outJobId = waMessageId ? `wa-out-${tenantId}-${waMessageId}` : undefined;
    const jobOk = await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      phone: lead.phone || phone,
      message: sendText,
      crm_message_id: outboundMsg?.id || null,
      sender_type: 'ai',
      replyJid: rj,
      buttons: sendButtons.length ? sendButtons : undefined,
      footer: sendButtons.length ? 'Tap a choice' : undefined,
    }, { name: 'ai-reply', jobId: outJobId }).catch((e) => {
      console.error('[inbound] outbound enqueue failed', e.message);
      return null;
    });
    if (!jobOk) {
      await sendAndLog({
        tenantId,
        phone: lead.phone || phone,
        text: sendText,
        senderType: 'ai',
        conversationId: conversation.id,
        replyJid: rj,
        meta: {
          source: 'always_reply_direct',
          event_type: 'always_reply',
          inbound_wa_message_id: waMessageId,
          buttons: sendButtons.length ? sendButtons : undefined,
        },
      }).catch((e) => console.error('[inbound] always reply direct', e.message));
    }
  }

  // Abandoned chat nudge — if mid-booking / interested and customer goes quiet, ping after 2h
  try {
    const flowAct = [...(turn.actions || [])].reverse().find((a) => a?.tool === 'booking_flow_state' && a.ok);
    const midFlow = ['await_service', 'await_date', 'await_time', 'await_name', 'await_confirm', 'await_staff']
      .includes(String(flowAct?.state || turn.flowState || ''));
    const bookingDone = turn.booking?.status === 'confirmed';
    if (!turn.handoff && !bookingDone && (midFlow || ['interested', 'qualified', 'booking_requested', 'conversation'].includes(lead.stage))) {
      const { scheduleChatAbandonedNudge } = require('./crmReminderService');
      await scheduleChatAbandonedNudge({
        tenantId,
        conversationId: conversation.id,
        leadId: lead.id,
        phone: lead.phone || phone,
        replyJid: jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null,
        lang: lead.locale || null,
      });
    }
  } catch (abErr) {
    console.warn('[inbound] abandon schedule', abErr.message);
  }

  // Status may have changed (handoff / ai_resume) after the last appendMessage emit
  emitConversationChanged(tenantId, conversation.id, { reason: turn.handoff ? 'handoff' : 'ai_turn_done' });

  return {
    skipped: false,
    resumed: !!resumeInbound,
    conversationId: conversation.id,
    leadId: lead.id,
    replyText,
    handoff: turn.handoff || null,
  };
}

function isUniqueViolation(err) {
  const msg = String(err?.message || err?.original?.message || '');
  return err?.name === 'SequelizeUniqueConstraintError'
    || msg.includes('Duplicate')
    || msg.includes('UNIQUE')
    || msg.includes('crm_messages_tenant_wa_id');
}

async function enqueueInboundTurn(data) {
  const tenantId = data.tenantId || data.tenant_id;
  const waMessageId = data.waMessageId || data.wa_message_id;
  const phone = String(data.phone || '').replace(/\D/g, '').slice(-12);
  const bodyNorm = String(data.message || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
  const hasImages = Array.isArray(data.images) && data.images.length > 0;
  const hasAudio = !!(data.audio && data.audio.dataBase64);

  // Baileys can emit the same customer text twice with different message ids —
  // debounce identical content per phone for a few seconds (skip for image/voice turns).
  if (tenantId && phone && bodyNorm && !hasImages && !hasAudio) {
    const redis = getRedis();
    if (redis) {
      const { createHash } = require('crypto');
      const h = createHash('sha1').update(bodyNorm).digest('hex').slice(0, 16);
      const key = cacheKey(tenantId, 'crm', 'inbound_debounce', `${phone}:${h}`);
      const got = await redis.set(key, waMessageId || '1', 'EX', 12, 'NX');
      if (!got) {
        console.log('[inbound] debounce skip duplicate body', { tenantId, phone, waMessageId });
        return null;
      }
    }
  }

  return enqueue(QUEUE_NAMES.WA_INBOUND_AI, data, {
    name: 'inbound-turn',
    jobId: waMessageId ? `wa-in-${tenantId}-${waMessageId}` : undefined,
  });
}

module.exports = {
  processInboundAiTurn,
  isOptOutMessage,
  enqueueInboundTurn,
  loadAiSettings,
  TURN_PENDING,
  TURN_PROCESSING,
  TURN_COMPLETED,
};
