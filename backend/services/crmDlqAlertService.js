/**
 * DLQ / queue depth alerting (C14).
 * Channels: Slack webhook, email, generic webhook. Env-gated.
 */
'use strict';

const { getQueue, QUEUE_NAMES, getQueueStats } = require('./queue');

let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = Number(process.env.CRM_DLQ_ALERT_COOLDOWN_MS || 5 * 60 * 1000);

function alertConfig() {
  return {
    slackWebhook: (process.env.CRM_DLQ_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '').trim(),
    emailTo: (process.env.CRM_DLQ_ALERT_EMAIL || '').trim(),
    webhookUrl: (process.env.CRM_DLQ_ALERT_WEBHOOK_URL || '').trim(),
    depthThreshold: Number(process.env.CRM_DLQ_ALERT_THRESHOLD || 1),
  };
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`alert webhook ${r.status}`);
  }
}

async function sendDlqAlerts(payload) {
  const cfg = alertConfig();
  const tasks = [];

  if (cfg.slackWebhook) {
    tasks.push(postJson(cfg.slackWebhook, {
      text: `[CRM DLQ] depth=${payload.dlq_depth} source=${payload.source_queue || 'n/a'} — ${payload.message}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*CRM Dead Letter Queue*\n• Depth: *${payload.dlq_depth}*\n• Source: \`${payload.source_queue || 'n/a'}\`\n• ${payload.message}`,
          },
        },
      ],
    }).catch((e) => console.warn('[dlq-alert] slack', e.message)));
  }

  if (cfg.webhookUrl) {
    tasks.push(postJson(cfg.webhookUrl, {
      type: 'crm_dlq_alert',
      ...payload,
      at: new Date().toISOString(),
    }).catch((e) => console.warn('[dlq-alert] webhook', e.message)));
  }

  if (cfg.emailTo) {
    tasks.push((async () => {
      try {
        const { sendEmail } = require('./notificationService');
        await sendEmail({
          to: cfg.emailTo,
          subject: `[CRM] DLQ alert depth=${payload.dlq_depth}`,
          html: `<p>CRM dead-letter queue depth is <b>${payload.dlq_depth}</b>.</p>
                 <p>Source queue: ${payload.source_queue || 'n/a'}</p>
                 <p>${payload.message}</p>
                 <pre>${JSON.stringify(payload, null, 2)}</pre>`,
          meta: { purpose: 'crm_dlq_alert' },
        });
      } catch (e) {
        console.warn('[dlq-alert] email', e.message);
      }
    })());
  }

  await Promise.all(tasks);
  return { sent: tasks.length };
}

async function getDlqDepth() {
  const q = getQueue(QUEUE_NAMES.DLQ);
  if (!q) return { available: false, depth: 0 };
  const [waiting, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);
  return { available: true, depth: waiting + failed + delayed, waiting, failed, delayed };
}

/**
 * Fire alerts if DLQ depth exceeds threshold (cooldown applied).
 */
async function maybeAlertDlq(extra = {}) {
  const cfg = alertConfig();
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) {
    return { skipped: true, reason: 'cooldown' };
  }
  const info = await getDlqDepth();
  if (!info.available) return { skipped: true, reason: 'dlq_unavailable' };
  if (info.depth < cfg.depthThreshold) return { skipped: true, reason: 'below_threshold', depth: info.depth };

  lastAlertAt = now;
  const payload = {
    dlq_depth: info.depth,
    waiting: info.waiting,
    failed: info.failed,
    delayed: info.delayed,
    message: extra.message || 'Dead-letter jobs require operator attention.',
    source_queue: extra.source_queue || null,
    original_job_id: extra.original_job_id || null,
    badge: true,
  };
  const result = await sendDlqAlerts(payload);
  return { alerted: true, ...result, depth: info.depth };
}

async function getQueueDashboard() {
  const stats = await getQueueStats();
  const dlq = await getDlqDepth();
  const cfg = alertConfig();
  return {
    queues: stats,
    dlq: {
      ...dlq,
      threshold: cfg.depthThreshold,
      alert: dlq.available && dlq.depth >= cfg.depthThreshold,
      channels: {
        slack: !!cfg.slackWebhook,
        email: !!cfg.emailTo,
        webhook: !!cfg.webhookUrl,
      },
    },
  };
}

module.exports = {
  maybeAlertDlq,
  getDlqDepth,
  getQueueDashboard,
  sendDlqAlerts,
  alertConfig,
};
