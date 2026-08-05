/**
 * BullMQ workers for AI CRM.
 * Start ONLY via: node workers/aiCrmWorker.js (separate from API — C15).
 */
'use strict';

require('dotenv').config();

const { Worker, UnrecoverableError } = require('bullmq');
const { getRedis } = require('../utils/redis');
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
const { sendCloudText, getWabaByTenant } = require('../services/whatsappCloudService');
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

async function handleInbound(job) {
  const result = await processInboundAiTurn(job.data || {});
  if (result?.unrecoverable) {
    throw new UnrecoverableError(result.error || 'inbound_unrecoverable');
  }
  return result;
}

async function handleOutbound(job) {
  const d = job.data || {};
  const tenantId = d.tenant_id || d.tenantId;
  const phone = d.phone;
  const message = d.message;
  if (!tenantId || !phone || !message) {
    throw new UnrecoverableError('tenant_id, phone, message required for wa-outbound');
  }

  const waba = await getWabaByTenant(tenantId);
  if (waba && waba.enabled) {
    const result = await sendCloudText({
      tenantId,
      to: phone,
      body: message,
      wabaRow: waba,
    });

    if (d.crm_message_id && result.waMessageId) {
      await CrmMessage.update(
        { wa_message_id: result.waMessageId, delivery_status: 'sent' },
        { where: { id: d.crm_message_id, tenant_id: tenantId } }
      );
    } else if (d.conversation_id && result.waMessageId) {
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
    }

    return { channel: 'cloud', ...result };
  }

  // Fallback: Baileys QR lives in the API process — call backend over HTTP
  const secret = serviceSecret();
  if (!secret) {
    console.warn('[worker] wa-outbound skipped — no service secret for QR send', { tenantId });
    return { skipped: true, reason: 'no_service_secret' };
  }
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
        event_type: 'crm_ai_reply',
        replyJid: d.replyJid || d.reply_jid || null,
        conversation_id: d.conversation_id || d.conversationId || null,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.ok) {
      console.warn('[worker] wa-outbound QR via API failed', { tenantId, status: r.status, body });
      return { skipped: true, reason: body.reason || 'qr_api_failed', status: r.status };
    }
    if (d.crm_message_id) {
      await CrmMessage.update(
        { delivery_status: 'sent' },
        { where: { id: d.crm_message_id, tenant_id: tenantId } }
      );
    }
    return { channel: 'qr', via: 'backend_api', ...body };
  } catch (err) {
    console.error('[worker] wa-outbound QR API error', err.message);
    return { skipped: true, reason: 'qr_api_error', error: err.message };
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

  if (conv.status === 'ai_active' || conv.status === 'ai_resume') {
    await conv.update({
      status: 'queued',
      handoff_reason: String(reason).slice(0, 255),
    });
  }

  const phone = conv.phone || conv.lead?.phone || '';
  const title = 'CRM handoff needed';
  const body = phone
    ? `Customer ${phone} needs a human — ${String(reason).slice(0, 80)}`
    : `Conversation #${conversationId} needs a human — ${String(reason).slice(0, 80)}`;

  await notifyTenantRoles(
    tenantId,
    title,
    body,
    {
      type: 'crm_handoff',
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
  return { skipped: true, reason: 'unknown_followup_job' };
}

function attachDlq(worker, queueName) {
  worker.on('failed', async (job, err) => {
    console.error(`[worker] ${queueName} job ${job?.id} failed:`, err.message);
    const maxAttempts = job?.opts?.attempts || 3;
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
