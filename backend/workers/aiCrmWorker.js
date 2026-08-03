/**
 * BullMQ workers for AI CRM.
 * Start ONLY via: node workers/aiCrmWorker.js (separate from API — C15).
 */
'use strict';

require('dotenv').config();

const { Worker, UnrecoverableError } = require('bullmq');
const { getRedis } = require('../utils/redis');
const { QUEUE_NAMES, moveToDlq } = require('../services/queue');
const { AiUsage, AiModelRate, CrmMessage } = require('../models');
const { processInboundAiTurn } = require('../services/crmInboundTurnService');
const { sendCloudText, getWabaByTenant } = require('../services/whatsappCloudService');
const {
  runDayBeforeReminders,
  runAbandonedBookingNudges,
  scheduleReminderRepeatableJobs,
  withReminderLock,
} = require('../services/crmReminderService');

function connection() {
  return getRedis();
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

  // Fallback: Baileys QR session when Cloud API is not enabled
  const whatsappWeb = require('../services/whatsappWebService');
  if (!whatsappWeb.isConnected(tenantId)) {
    console.warn('[worker] wa-outbound skipped — Cloud off and QR not connected', { tenantId });
    return { skipped: true, reason: 'no_whatsapp_channel' };
  }
  const qrResult = await whatsappWeb.sendViaQr(tenantId, phone, message, {
    tenant_id: tenantId,
    event_type: 'crm_ai_reply',
  });
  if (!qrResult?.used) {
    return { skipped: true, reason: 'qr_send_failed' };
  }
  if (d.crm_message_id) {
    await CrmMessage.update(
      { delivery_status: 'sent' },
      { where: { id: d.crm_message_id, tenant_id: tenantId } }
    );
  }
  return { channel: 'qr', ...qrResult };
}

async function handleHandoff(job) {
  console.log('[worker] handoff', job.id, job.data);
  return { ok: true, queued: true };
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
  // Tenant-scoped manual enqueue
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
    new Worker(QUEUE_NAMES.BOOKING_RETRY, async (job) => {
      console.log('[worker] booking-retry', job.id, job.data);
      return { ok: true };
    }, { connection: conn, concurrency: 2 }),
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

module.exports = { startAiCrmWorkers };
