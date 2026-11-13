/**
 * BullMQ workers for AI CRM.
 * Start ONLY via: node workers/aiCrmWorker.js (separate from API — C15).
 */
'use strict';

require('dotenv').config();

const { Worker, UnrecoverableError } = require('bullmq');
const { getRedis, cacheKey } = require('../utils/redis');
const { QUEUE_NAMES, moveToDlq, enqueue } = require('../services/queue');
const {
  AiUsage,
  AiModelRate,
  CrmMessage,
  CrmConversation,
  CrmLead,
  CrmAuditLog,
  CrmBookingRequest,
  Appointment,
} = require('../models');
const { processInboundAiTurn } = require('../services/crmInboundTurnService');
const {
  getWabaByTenant,
  chooseCloudSend,
  sendCloudChosen,
} = require('../services/whatsappCloudService');
const { markMessageSent, markMessageFailed } = require('../services/crmOutboundSendService');
const { notifyTenantRoles } = require('../services/fcmService');
const {
  runDayBeforeReminders,
  runAbandonedBookingNudges,
  scheduleReminderRepeatableJobs,
  withReminderLock,
} = require('../services/crmReminderService');

function connection() {
  return getRedis();
}

function backendBase() {
  return (process.env.BACKEND_INTERNAL_URL || 'http://backend:5000').replace(/\/$/, '');
}

function serviceSecret() {
  return process.env.AI_ENGINE_SERVICE_SECRET || process.env.CRM_SERVICE_SECRET || '';
}

async function computeCost(provider, model, promptTokens, completionTokens) {
  const rate = await AiModelRate.findOne({
    where: { provider, model, active: true },
  });
  if (!rate) return { cost: 0, currency: 'USD' };
  const input = Number(rate.input_per_1k) * (promptTokens / 1000);
  const output = Number(rate.output_per_1k) * (completionTokens / 1000);
  return { cost: input + output, currency: rate.currency || 'USD' };
}

async function handleAiUsage(job) {
  const d = job.data || {};
  const prompt = Number(d.prompt_tokens) || 0;
  const completion = Number(d.completion_tokens) || 0;
  const { cost, currency } = await computeCost(
    d.provider || 'unknown',
    d.model || 'unknown',
    prompt,
    completion
  );
  await AiUsage.create({
    tenant_id: d.tenant_id,
    conversation_id: d.conversation_id || null,
    provider: d.provider || 'unknown',
    model: d.model || null,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    cost,
    currency,
    latency_ms: d.latency_ms || null,
    purpose: d.purpose || 'whatsapp_turn',
  });
}

const TURN_LOCK_TTL_SEC = 120;
const TURN_LOCK_REQUEUE_DELAY_MS = 2000;
const TURN_LOCK_MAX_REQUEUES = 40; // ~80s of waiting before falling back to BullMQ retry

const RELEASE_LOCK_LUA = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/**
 * Serialize AI turns per tenant+phone so concurrent customer messages don't race
 * (session state, conversation status, duplicate replies).
 */
async function handleInbound(job) {
  const data = job.data || {};
  const tenantId = data.tenantId || data.tenant_id;
  const phoneDigits = String(data.phone || '').replace(/\D/g, '').slice(-12);
  const redis = getRedis();

  let lockKey = null;
  let lockToken = null;
  if (redis && tenantId && phoneDigits) {
    lockKey = cacheKey(tenantId, 'crm', 'turn_lock', phoneDigits);
    lockToken = `${process.pid}:${job.id}:${Date.now()}`;
    const got = await redis.set(lockKey, lockToken, 'EX', TURN_LOCK_TTL_SEC, 'NX');
    if (!got) {
      const attempt = Number(data._lockRequeues || 0);
      if (attempt >= TURN_LOCK_MAX_REQUEUES) {
        throw new Error('inbound_turn_lock_timeout'); // BullMQ retry/backoff
      }
      await enqueue(QUEUE_NAMES.WA_INBOUND_AI, { ...data, _lockRequeues: attempt + 1 }, {
        name: 'inbound-turn',
        delay: TURN_LOCK_REQUEUE_DELAY_MS,
        // New jobId — the original wa-in id is retained after completion and would dedupe
        jobId: `${job.id}-lock${attempt + 1}`,
      });
      return { skipped: true, requeued: true, reason: 'turn_lock_held', attempt: attempt + 1 };
    }
  }

  try {
    const result = await processInboundAiTurn(data);
    if (result?.unrecoverable) {
      throw new UnrecoverableError(result.error || 'inbound_unrecoverable');
    }
    return result;
  } finally {
    if (lockKey) {
      try {
        await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockToken);
      } catch { /* lock expires via TTL */ }
    }
  }
}

async function handleOutbound(job) {
  const d = job.data || {};
  const tenantId = d.tenant_id || d.tenantId;
  const phone = d.phone;
  const message = d.message;
  if (!tenantId || !phone || !message) {
    throw new UnrecoverableError('tenant_id, phone, message required for wa-outbound');
  }

  // Prevent BullMQ retries from double-sending the same outbound
  const redis = getRedis();
  const dedupeKey = d.crm_message_id
    ? `crm:wa-out:sent:${tenantId}:${d.crm_message_id}`
    : `crm:wa-out:sent:${tenantId}:${d.conversation_id || 'x'}:${Buffer.from(String(message)).toString('base64').slice(0, 48)}`;
  if (redis) {
    const claimed = await redis.set(dedupeKey, '1', 'EX', 120, 'NX');
    if (!claimed) {
      return { skipped: true, reason: 'already_sent_dedupe', dedupeKey };
    }
  }

  // If CRM row already marked sent, do not send again on retry
  if (d.crm_message_id) {
    const existing = await CrmMessage.findByPk(d.crm_message_id);
    if (existing && ['sent', 'delivered', 'read'].includes(String(existing.delivery_status || ''))) {
      return { skipped: true, reason: 'already_marked_sent', crm_message_id: d.crm_message_id };
    }
  }

  const markSent = async (waMessageId = null) => {
    if (!d.crm_message_id) return;
    try {
      await markMessageSent(tenantId, d.crm_message_id, waMessageId);
    } catch (err) {
      console.warn('[worker] mark sent failed (WA already delivered)', err.message);
    }
  };

  const markFailedSafe = async (err) => {
    try {
      await markMessageFailed(tenantId, d.crm_message_id, err);
    } catch (e) {
      console.warn('[worker] mark failed error', e.message);
    }
  };

  const waba = await getWabaByTenant(tenantId);
  if (waba && waba.enabled) {
    try {
      let conversation = null;
      if (d.conversation_id) {
        conversation = await CrmConversation.findOne({
          where: { id: d.conversation_id, tenant_id: tenantId },
        }).catch(() => null);
      }
      const choice = chooseCloudSend({
        conversation,
        text: message,
        templateName: d.template_name || null,
        templateParams: d.template_params || null,
        languageCode: d.language_code || 'en',
      });
      if (choice.mode === 'blocked') {
        // Not retryable — fail loudly instead of letting Meta silently reject
        if (redis) await redis.del(dedupeKey).catch(() => {});
        const err = new Error(choice.message);
        err.code = choice.code;
        await markFailedSafe(err);
        return { skipped: true, failed: true, reason: choice.code };
      }
      const result = await sendCloudChosen({ tenantId, to: phone, choice, wabaRow: waba });
      await markSent(result.waMessageId || null);
      if (!d.crm_message_id && d.conversation_id && result.waMessageId) {
        try {
          const latest = await CrmMessage.findOne({
            where: {
              tenant_id: tenantId,
              conversation_id: d.conversation_id,
              direction: 'outbound',
              sender_type: d.sender_type || 'ai',
            },
            order: [['id', 'DESC']],
          });
          if (latest && !latest.wa_message_id) {
            await latest.update({
              wa_message_id: result.waMessageId,
              delivery_status: 'sent',
            });
          }
        } catch (e) {
          console.warn('[worker] late outbound meta', e.message);
        }
      }
      return { channel: 'cloud', ...result };
    } catch (err) {
      if (redis) await redis.del(dedupeKey).catch(() => {});
      // Final-attempt failures are marked in attachDlq (markFailed after retries exhausted)
      throw err;
    }
  }

  // Fallback 1: Baileys QR (API process) over HTTP
  const secret = serviceSecret();
  if (secret) {
    try {
      const r = await fetch(`${backendBase()}/api/crm/internal/whatsapp-qr-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': secret,
          'X-Tenant-Id': String(tenantId),
        },
        body: JSON.stringify({
          tenantId,
          phone,
          message,
          event_type: d.event_type || 'crm_ai_reply',
          replyJid: d.replyJid || d.reply_jid || null,
          conversation_id: d.conversation_id || d.conversationId || null,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.ok) {
        await markSent(body.waMessageId || body.id || null);
        return { channel: 'qr', via: 'backend_api', ...body };
      }
      console.warn('[worker] wa-outbound QR via API failed — trying Twilio WA', { tenantId, status: r.status, body });
    } catch (err) {
      console.warn('[worker] wa-outbound QR API error — trying Twilio WA', err.message);
    }
  }

  // Fallback 2: legacy Twilio-style WhatsApp (Twilio-only tenants)
  try {
    const { sendWhatsApp } = require('../services/notificationService');
    const tw = await sendWhatsApp({
      to: phone,
      message,
      tenantId,
      meta: {
        event_type: d.event_type || 'crm_ai_reply',
        conversation_id: d.conversation_id || null,
        crm_message_id: d.crm_message_id || null,
      },
    });
    if (tw?.skipped) {
      if (redis) await redis.del(dedupeKey).catch(() => {});
      await markFailedSafe(Object.assign(
        new Error(tw.reason || 'No WhatsApp channel available'),
        { code: tw.reason || 'NO_CHANNEL' }
      ));
      return { skipped: true, reason: tw.reason || 'twilio_skipped' };
    }
    await markSent(tw?.sid || tw?.waMessageId || null);
    return { channel: 'twilio_wa', ...tw };
  } catch (err) {
    if (redis) await redis.del(dedupeKey).catch(() => {});
    await markFailedSafe(Object.assign(err, { code: err.code || 'TWILIO_WA_FAILED' }));
    return { skipped: true, reason: 'twilio_wa_error', error: err.message };
  }
}

async function handleHandoff(job) {
  const d = job.data || {};
  const tenantId = d.tenant_id || d.tenantId;
  const conversationId = d.conversation_id || d.conversationId;
  const reason = d.reason || 'ai_handoff';

  if (!tenantId || !conversationId) {
    throw new UnrecoverableError('tenant_id and conversation_id required for handoff');
  }

  const conv = await CrmConversation.findOne({
    where: { id: conversationId, tenant_id: tenantId },
    include: [{ model: CrmLead, as: 'lead', required: false }],
  });
  if (!conv) {
    return { skipped: true, reason: 'conversation_not_found' };
  }

  const isCustomerMessage = d.kind === 'customer_message';

  if (isCustomerMessage) {
    // Re-notify only while a human still owns the thread (may have been released since)
    if (!['queued', 'human_active'].includes(conv.status)) {
      return { skipped: true, reason: 'not_in_handoff', status: conv.status };
    }
  } else if (conv.status === 'ai_active' || conv.status === 'ai_resume') {
    await conv.update({
      status: 'queued',
      handoff_reason: String(reason).slice(0, 255),
    });
  }

  const phone = conv.phone || conv.lead?.phone || '';
  const title = isCustomerMessage ? 'New customer message' : 'CRM handoff needed';
  const body = isCustomerMessage
    ? (phone
      ? `Customer ${phone} sent a new message (${conv.status === 'human_active' ? 'chat in progress' : 'waiting for staff'})`
      : `New message in conversation #${conversationId} (${conv.status})`)
    : (phone
      ? `Customer ${phone} needs a human — ${String(reason).slice(0, 80)}`
      : `Conversation #${conversationId} needs a human — ${String(reason).slice(0, 80)}`);

  await notifyTenantRoles(
    tenantId,
    title,
    body,
    {
      type: 'crm_handoff',
      kind: isCustomerMessage ? 'customer_message' : 'handoff',
      conversation_id: String(conversationId),
      phone: String(phone || ''),
      reason: String(reason).slice(0, 120),
    },
    ['superadmin', 'admin', 'manager']
  );

  await CrmAuditLog.create({
    tenant_id: tenantId,
    actor_type: 'system',
    actor_id: null,
    action: 'handoff_notified',
    entity_type: 'conversation',
    entity_id: conversationId,
    meta: { reason, phone },
  }).catch(() => {});

  try {
    require('../services/crmRealtime').emitConversationChanged(tenantId, conversationId, { reason: 'handoff' });
  } catch (_) { /* realtime optional */ }

  return { ok: true, conversationId, notified: true };
}

async function handleBookingRetry(job) {
  const d = job.data || {};
  const tenantId = d.tenant_id || d.tenantId;
  const payload = d.payload || {};
  const conversationId = d.conversation_id || d.conversationId || null;
  const leadId = d.lead_id || d.leadId || null;
  const phone = d.phone || payload.phone;

  if (!tenantId || !payload.service_id || !payload.date || !payload.time) {
    throw new UnrecoverableError('tenant_id and booking payload required');
  }

  const secret = serviceSecret();
  if (!secret) {
    throw new UnrecoverableError('service secret required for booking retry');
  }

  const r = await fetch(`${backendBase()}/api/crm-integration/appointments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': secret,
      'X-Tenant-Id': String(tenantId),
    },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.warn('[worker] booking-retry failed', { tenantId, status: r.status, body });
    throw new Error(body.message || body.error || `booking_retry_http_${r.status}`);
  }

  const appt = body.appointment || body;
  const apptId = appt?.id || null;

  if (conversationId && apptId) {
    await CrmBookingRequest.create({
      tenant_id: tenantId,
      conversation_id: conversationId,
      lead_id: leadId || null,
      status: 'confirmed',
      salon_appointment_id: apptId,
      payload,
      idempotency_key: payload.idempotency_key || null,
    }).catch(() => {});
  }

  if (leadId) {
    await CrmLead.update(
      { stage: 'booking_confirmed' },
      { where: { id: leadId, tenant_id: tenantId } }
    ).catch(() => {});
  }

  if (phone && apptId) {
    const confirmMsg =
      `You’re booked! ✅\n`
      + `${payload.date} at ${String(payload.time).slice(0, 5)}\n`
      + `See you soon!`;
    await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
      tenant_id: tenantId,
      conversation_id: conversationId,
      phone,
      message: confirmMsg,
      sender_type: 'ai',
    }, { name: 'booking-retry-confirm' }).catch(() => {});

    try {
      const { sendBookingConfirmation } = require('../services/crmReminderService');
      const appointment = await Appointment.findByPk(apptId);
      if (appointment) {
        await sendBookingConfirmation({
          tenantId,
          appointment,
          phone,
          conversationId,
          leadId,
        });
      }
    } catch (e) {
      console.warn('[worker] booking-retry confirm WA', e.message);
    }
  }

  return { ok: true, appointment_id: apptId, idempotent: !!body.idempotent };
}

async function handleFollowup(job) {
  const d = job.data || {};
  const name = job.name || d.job;
  if (name === 'day-before-reminders' || d.job === 'day_before_reminders') {
    return withReminderLock('day_before_reminders', 3600, () =>
      runDayBeforeReminders({ tenantId: d.tenantId || d.tenant_id || null })
    );
  }
  if (name === 'abandoned-nudges' || d.job === 'abandoned_nudges') {
    return withReminderLock('abandoned_nudges', 500, () =>
      runAbandonedBookingNudges({ tenantId: d.tenantId || d.tenant_id || null })
    );
  }
  if (d.job === 'tenant_day_before' && d.tenantId) {
    return runDayBeforeReminders({ tenantId: d.tenantId });
  }
  if (d.job === 'tenant_abandoned' && d.tenantId) {
    return runAbandonedBookingNudges({ tenantId: d.tenantId });
  }
  if (d.job === 'automation_run' && d.tenantId && d.automationId) {
    const { executeAutomation } = require('../services/crmAutomationRunner');
    return executeAutomation({
      tenantId: d.tenantId,
      automationId: d.automationId,
      executionId: d.executionId || null,
      customerId: d.customerId || null,
    });
  }
  if (name === 'handoff-auto-release' || d.job === 'handoff_auto_release') {
    const { releaseStaleHandoffs } = require('../services/crmHandoffService');
    return withReminderLock('handoff_auto_release', 300, () => releaseStaleHandoffs());
  }
  if (name === 'automation-tick' || d.job === 'automation_tick') {
    const { tickScheduledAutomations } = require('../services/crmAutomationRunner');
    return withReminderLock('automation_tick', 500, () => tickScheduledAutomations());
  }
  return { skipped: true, reason: 'unknown_followup_job' };
}

function attachDlq(worker, queueName) {
  worker.on('failed', async (job, err) => {
    console.error(`[worker] ${queueName} job ${job?.id} failed:`, err.message);
    const maxAttempts = job?.opts?.attempts || 3;
    const finalFailure = job && (
      (job.attemptsMade || 0) >= maxAttempts || err?.name === 'UnrecoverableError'
    );
    if (finalFailure && queueName === QUEUE_NAMES.WA_OUTBOUND) {
      const d = job.data || {};
      const tenantId = d.tenant_id || d.tenantId;
      await markMessageFailed(tenantId, d.crm_message_id, err).catch((e) =>
        console.warn('[worker] markFailed after final failure', e.message)
      );
    }
    if (job && (job.attemptsMade || 0) >= maxAttempts) {
      await moveToDlq({ sourceQueue: queueName, job, err });
    }
  });
}

function startAiCrmWorkers() {
  if (process.env.AI_CRM_WORKERS === 'false') {
    console.warn('[worker] AI_CRM_WORKERS=false — not starting');
    return [];
  }

  const conn = connection();
  if (!conn) {
    console.warn('[worker] Redis unavailable — AI CRM workers not started');
    return [];
  }

  const workers = [
    new Worker(QUEUE_NAMES.AI_USAGE, handleAiUsage, { connection: conn, concurrency: 5 }),
    new Worker(QUEUE_NAMES.WA_INBOUND_AI, handleInbound, { connection: conn, concurrency: 3 }),
    new Worker(QUEUE_NAMES.WA_OUTBOUND, handleOutbound, { connection: conn, concurrency: 5 }),
    new Worker(QUEUE_NAMES.HANDOFF, handleHandoff, { connection: conn, concurrency: 2 }),
    new Worker(QUEUE_NAMES.FOLLOWUP, handleFollowup, { connection: conn, concurrency: 1 }),
    new Worker(QUEUE_NAMES.BOOKING_RETRY, handleBookingRetry, { connection: conn, concurrency: 2 }),
  ];

  for (const w of workers) {
    attachDlq(w, w.name);
  }

  scheduleReminderRepeatableJobs().catch((e) =>
    console.warn('[worker] schedule reminders', e.message)
  );

  console.log('[worker] AI CRM workers started:', workers.map((w) => w.name).join(', '));
  return workers;
}

if (require.main === module) {
  startAiCrmWorkers();
}

module.exports = { startAiCrmWorkers, handleHandoff, handleBookingRetry };
