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
const { ensureConversation, appendMessage } = require('./crmConversationService');
const { runTurn } = require('./aiEngineClient');
const { enqueue, QUEUE_NAMES } = require('./queue');
const { getRedis, cacheKey } = require('../utils/redis');

const TURN_PENDING = 'pending_ai';
const TURN_PROCESSING = 'processing';
const TURN_COMPLETED = 'completed';

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

  if (!tenantId || !phone || !message) {
    throw new Error('tenantId, phone, and message are required');
  }

  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

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

  if (['queued', 'human_active'].includes(conversation.status) && !resumeInbound) {
    try {
      await appendMessage({
        tenantId,
        conversationId: conversation.id,
        direction: 'inbound',
        senderType: 'customer',
        body: message,
        waMessageId,
        deliveryStatus: 'received',
        meta: { skipped_ai: true, reason: conversation.status, turn_state: TURN_COMPLETED },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return { skipped: true, reason: 'duplicate_wa_message' };
      }
      throw e;
    }
    return {
      skipped: true,
      reason: conversation.status,
      conversationId: conversation.id,
      leadId: lead.id,
    };
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

  const settings = await loadAiSettings(tenantId);
  const brand = tenant.brand_name || tenant.name || 'Salon';

  let kbHints = null;
  try {
    const { hasTenantFeature } = require('../utils/tenantFeatures');
    if (hasTenantFeature(tenant, 'ai_knowledge_base')) {
      const { searchKnowledge, formatSnippetsForPrompt } = require('./knowledgeService');
      const hits = await searchKnowledge(tenantId, message, { limit: 4 });
      if (hits.length) {
        kbHints = { hits, prompt_block: formatSnippetsForPrompt(hits) };
      }
    }
  } catch (e) {
    console.warn('[inbound] kb search', e.message);
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
      customerContext: {
        name: lead.name || jobData.name || null,
        leadId: lead.id,
        customerId: lead.customer_id || null,
      },
    });
  } catch (err) {
    const apology =
      'Sorry — our assistant is temporarily unavailable. A team member will help you shortly.';
    let apologyMsg = null;
    try {
      apologyMsg = await appendMessage({
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        senderType: 'system',
        body: apology,
        deliveryStatus: 'pending',
        meta: {
          error: err.message,
          inbound_message_id: inboundMsg?.id,
          inbound_wa_message_id: waMessageId,
        },
      });
    } catch (appendErr) {
      console.error('[inbound] apology append failed', appendErr.message);
    }

    // Keep AI channel open on provider/transient errors so the next customer
    // message retries after keys/quota are fixed (do not soft-lock as queued).
    const transient = /429|quota|rate|timeout|ECONN|fetch failed|503|502/i.test(String(err.message || ''));
    await conversation.update({
      status: transient ? 'ai_active' : 'queued',
      handoff_reason: transient ? null : `ai_error: ${err.message}`.slice(0, 255),
      ai_turn_state: TURN_COMPLETED,
    });

    if (apologyMsg) {
      const outJobId = waMessageId ? `wa-out-err-${tenantId}-${waMessageId}` : undefined;
      await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
        tenant_id: tenantId,
        conversation_id: conversation.id,
        phone: lead.phone || phone,
        message: apology,
        crm_message_id: apologyMsg.id,
        sender_type: 'system',
        replyJid: jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null,
      }, { name: 'ai-error-apology', jobId: outJobId }).catch((e) => {
        console.error('[inbound] apology enqueue failed', e.message);
      });
    }

    return {
      skipped: false,
      failed: true,
      unrecoverable: true,
      error: err.message,
      conversationId: conversation.id,
      leadId: lead.id,
      replyText: apology,
    };
  }

  const replyText = turn.replyText || turn.reply_text || '';
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

  if (replyText) {
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
        inbound_wa_message_id: waMessageId,
        turn_state: TURN_COMPLETED,
      },
    });
  }

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
          stage: 'converted',
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
  } else if (turn.actions?.some((a) => a.tool === 'list_services' || a.tool === 'book_appointment')) {
    if (['new', 'conversation', 'qualified'].includes(lead.stage)) {
      await lead.update({ stage: lead.stage === 'new' ? 'interested' : 'booking_requested' }).catch(() => {});
    }
  }

  if (turn.handoff) {
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
    const usageJobId = waMessageId ? `ai-usage-${tenantId}-${waMessageId}` : undefined;
    await enqueue(QUEUE_NAMES.AI_USAGE, {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      provider: turn.usage.provider,
      model: turn.usage.model,
      prompt_tokens: turn.usage.promptTokens || turn.usage.prompt_tokens || 0,
      completion_tokens: turn.usage.completionTokens || turn.usage.completion_tokens || 0,
      latency_ms: turn.usage.latencyMs || turn.usage.latency_ms || null,
      purpose: 'whatsapp_turn',
      wa_message_id: waMessageId,
    }, { name: 'usage', jobId: usageJobId });
  }

  if (replyText && !priorOut) {
    const outJobId = waMessageId ? `wa-out-${tenantId}-${waMessageId}` : undefined;
    await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      phone: lead.phone || phone,
      message: replyText,
      crm_message_id: outboundMsg?.id || null,
      sender_type: 'ai',
      replyJid: jobData.replyJid || jobData.reply_jid || inboundMsg?.meta?.reply_jid || null,
    }, { name: 'ai-reply', jobId: outJobId });
  }

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
  return enqueue(QUEUE_NAMES.WA_INBOUND_AI, data, {
    name: 'inbound-turn',
    jobId: waMessageId ? `wa-in-${tenantId}-${waMessageId}` : undefined,
  });
}

module.exports = {
  processInboundAiTurn,
  enqueueInboundTurn,
  loadAiSettings,
  TURN_PENDING,
  TURN_PROCESSING,
  TURN_COMPLETED,
};
