/**
 * BullMQ queue registry for WhatsApp AI CRM.
 * Includes DLQ + retry metrics (C14).
 */
'use strict';

const { Queue } = require('bullmq');
const { getRedis } = require('../utils/redis');

const QUEUE_NAMES = {
  WA_INBOUND_AI: 'wa-inbound-ai',
  WA_OUTBOUND: 'wa-outbound',
  NOTIF_SMS: 'notif-sms',
  NOTIF_EMAIL: 'notif-email',
  NOTIF_PUSH: 'notif-push',
  BOOKING_RETRY: 'booking-retry',
  FOLLOWUP: 'followup',
  HANDOFF: 'handoff',
  AI_USAGE: 'ai-usage',
  DLQ: 'crm-dlq',
};

const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const queues = new Map();

function connectionOpts() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const redis = getRedis();
  if (!redis) return null;
  return redis;
}

function getQueue(name) {
  if (queues.has(name)) return queues.get(name);
  const connection = connectionOpts();
  if (!connection) return null;
  const q = new Queue(name, { connection });
  queues.set(name, q);
  return q;
}

/**
 * Enqueue a job. Returns job id or null if Redis/queue unavailable.
 */
async function enqueue(queueName, payload, opts = {}) {
  const q = getQueue(queueName);
  if (!q) {
    console.warn(`[queue] skip enqueue ${queueName} — Redis unavailable`);
    return null;
  }
  const { name, attempts, backoff, removeOnComplete, removeOnFail, jobId, ...rest } = opts;
  const job = await q.add(name || 'default', payload, {
    ...DEFAULT_JOB_OPTS,
    attempts: attempts ?? DEFAULT_JOB_OPTS.attempts,
    backoff: backoff ?? DEFAULT_JOB_OPTS.backoff,
    removeOnComplete: removeOnComplete ?? DEFAULT_JOB_OPTS.removeOnComplete,
    removeOnFail: removeOnFail ?? DEFAULT_JOB_OPTS.removeOnFail,
    jobId,
    ...rest,
  });
  return job.id;
}

/**
 * Move a permanently failed job into the dead-letter queue.
 */
async function moveToDlq({ sourceQueue, job, err }) {
  try {
    await enqueue(QUEUE_NAMES.DLQ, {
      source_queue: sourceQueue,
      original_job_id: job?.id || null,
      original_name: job?.name || null,
      payload: job?.data || null,
      failed_reason: err?.message || String(err),
      attempts_made: job?.attemptsMade || null,
      failed_at: new Date().toISOString(),
    }, {
      name: `dlq:${sourceQueue}`,
      attempts: 1,
      removeOnFail: 20000,
      removeOnComplete: 20000,
    });
    const { maybeAlertDlq } = require('./crmDlqAlertService');
    await maybeAlertDlq({
      source_queue: sourceQueue,
      original_job_id: job?.id || null,
      message: err?.message || 'Job moved to DLQ after max retries',
    }).catch(() => {});
  } catch (e) {
    console.error('[queue] DLQ enqueue failed', e.message);
  }
}

async function getQueueStats() {
  const out = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    const q = getQueue(name);
    if (!q) {
      out[name] = { available: false };
      continue;
    }
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getCompletedCount(),
      q.getFailedCount(),
      q.getDelayedCount(),
      q.isPaused().then((p) => (p ? 1 : 0)).catch(() => 0),
    ]);
    out[name] = {
      available: true,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: !!paused,
      retry_pressure: waiting + delayed + failed,
    };
  }
  return out;
}

module.exports = {
  QUEUE_NAMES,
  getQueue,
  enqueue,
  moveToDlq,
  getQueueStats,
  DEFAULT_JOB_OPTS,
};
