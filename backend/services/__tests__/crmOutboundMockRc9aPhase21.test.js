/**
 * RC9a Phase 2.1 — mocked sendAndLog / FollowUpJob harness.
 * No live WhatsApp. No Gemini. No production.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * In-memory outbound transport + follow-up job store.
 * Mirrors sendAndLog / CrmFollowUpJob behaviour for confirmation paths.
 */
function createMockOutboundHarness() {
  const messages = [];
  const jobs = [];
  let nextMsgId = 1;
  let nextJobId = 1;
  let failNextSend = false;
  let deliveries = 0;

  async function sendAndLog({
    tenantId,
    phone,
    text,
    senderType = 'ai',
    meta = null,
    suppressCustomerConfirm = false,
  }) {
    if (suppressCustomerConfirm) {
      return { skipped: true, reason: 'crm_notification_suppressed' };
    }
    const body = String(text || '').trim();
    if (!tenantId || !phone || !body) {
      return { skipped: true, reason: 'missing_fields' };
    }
    const msg = {
      id: nextMsgId++,
      tenant_id: tenantId,
      phone: String(phone),
      body,
      sender_type: senderType,
      delivery_status: 'pending',
      meta: meta || {},
      booking_ref: meta?.booking_ref || meta?.appointment_id || null,
    };
    messages.push(msg);

    if (failNextSend) {
      failNextSend = false;
      msg.delivery_status = 'failed';
      msg.meta = { ...msg.meta, error: 'mock_outbound_failure' };
      const err = new Error('mock_outbound_failure');
      err.code = 'MOCK_SEND_FAIL';
      throw err;
    }

    msg.delivery_status = 'sent';
    deliveries += 1;
    return { conversationId: 1, messageId: msg.id, queued: false, mock: true };
  }

  async function enqueueFollowUp({
    tenantId,
    jobType,
    appointmentId,
    phone,
    meta = null,
  }) {
    const dedupeKey = `${tenantId}:${jobType}:${appointmentId || 0}:${phone || ''}`;
    const existing = jobs.find(
      (j) => j.dedupe_key === dedupeKey && j.status !== 'failed',
    );
    if (existing) {
      return { job: existing, duplicate: true };
    }
    const job = {
      id: nextJobId++,
      tenant_id: tenantId,
      job_type: jobType,
      appointment_id: appointmentId || null,
      phone: phone || null,
      status: 'pending',
      dedupe_key: dedupeKey,
      meta: meta || {},
      attempts: 0,
    };
    jobs.push(job);
    return { job, duplicate: false };
  }

  async function deliverFollowUp(jobId) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) throw new Error('job_not_found');
    job.attempts += 1;
    try {
      await sendAndLog({
        tenantId: job.tenant_id,
        phone: job.phone,
        text: `Follow-up ${job.job_type} for booking #${job.appointment_id}`,
        senderType: 'automation',
        meta: {
          booking_ref: job.appointment_id,
          job_type: job.job_type,
          ...(job.meta || {}),
        },
      });
      job.status = 'sent';
      return job;
    } catch (err) {
      job.status = 'failed';
      job.error_message = err.message;
      throw err;
    }
  }

  return {
    messages,
    jobs,
    get deliveries() { return deliveries; },
    sendAndLog,
    enqueueFollowUp,
    deliverFollowUp,
    failNextOutbound() { failNextSend = true; },
    /** CRM create path: AI owns customer confirm — suppress second template */
    async aiConfirmThenCrmSuppress({ tenantId, phone, appointmentId, aiText }) {
      const ai = await sendAndLog({
        tenantId,
        phone,
        text: aiText,
        senderType: 'ai',
        meta: { booking_ref: appointmentId, event_type: 'ai_booking_confirm' },
      });
      const crm = await sendAndLog({
        tenantId,
        phone,
        text: `Template confirm for #${appointmentId}`,
        senderType: 'automation',
        meta: { booking_ref: appointmentId, event_type: 'crm_template_confirm' },
        suppressCustomerConfirm: true,
      });
      return { ai, crm };
    },
  };
}

test('mock outbound: AI confirmation logs booking reference', async () => {
  const h = createMockOutboundHarness();
  const r = await h.sendAndLog({
    tenantId: 921,
    phone: '94770001122',
    text: 'Confirmed! Haircut on 2027-06-14 at 09:00. Ref #42',
    senderType: 'ai',
    meta: { booking_ref: 42, appointment_id: 42 },
  });
  assert.equal(r.messageId, 1);
  assert.equal(h.messages[0].booking_ref, 42);
  assert.equal(h.messages[0].delivery_status, 'sent');
  assert.match(h.messages[0].body, /Ref #42/);
});

test('mock outbound: CRM notification suppressed after AI confirm', async () => {
  const h = createMockOutboundHarness();
  const { ai, crm } = await h.aiConfirmThenCrmSuppress({
    tenantId: 921,
    phone: '94770001122',
    appointmentId: 55,
    aiText: 'Booked. Ref #55',
  });
  assert.ok(ai.messageId);
  assert.equal(crm.skipped, true);
  assert.equal(crm.reason, 'crm_notification_suppressed');
  assert.equal(h.messages.length, 1);
  assert.equal(h.deliveries, 1);
});

test('mock outbound: retry after failed attempt', async () => {
  const h = createMockOutboundHarness();
  h.failNextOutbound();
  let failed = false;
  try {
    await h.sendAndLog({
      tenantId: 921,
      phone: '94770001122',
      text: 'Retry me Ref #70',
      meta: { booking_ref: 70 },
    });
  } catch (err) {
    failed = true;
    assert.equal(err.code, 'MOCK_SEND_FAIL');
  }
  assert.equal(failed, true);
  assert.equal(h.messages[0].delivery_status, 'failed');

  const retry = await h.sendAndLog({
    tenantId: 921,
    phone: '94770001122',
    text: 'Retry me Ref #70',
    meta: { booking_ref: 70 },
  });
  assert.equal(retry.messageId, 2);
  assert.equal(h.messages[1].delivery_status, 'sent');
  assert.equal(h.messages[1].booking_ref, 70);
});

test('mock outbound: duplicate FollowUpJob delivery is deduped', async () => {
  const h = createMockOutboundHarness();
  const a = await h.enqueueFollowUp({
    tenantId: 921,
    jobType: 'booking_confirm',
    appointmentId: 88,
    phone: '94770001122',
    meta: { booking_ref: 88 },
  });
  const b = await h.enqueueFollowUp({
    tenantId: 921,
    jobType: 'booking_confirm',
    appointmentId: 88,
    phone: '94770001122',
    meta: { booking_ref: 88 },
  });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.job.id, a.job.id);
  assert.equal(h.jobs.length, 1);

  await h.deliverFollowUp(a.job.id);
  assert.equal(h.jobs[0].status, 'sent');
  assert.equal(h.messages[0].booking_ref, 88);
});

test('mock outbound: failed follow-up marks job failed — no live WA', async () => {
  const h = createMockOutboundHarness();
  const { job } = await h.enqueueFollowUp({
    tenantId: 921,
    jobType: 'appointment_reminder',
    appointmentId: 99,
    phone: '94770001122',
  });
  h.failNextOutbound();
  let failed = false;
  try {
    await h.deliverFollowUp(job.id);
  } catch {
    failed = true;
  }
  assert.equal(failed, true);
  assert.equal(job.status, 'failed');
  assert.equal(h.messages.some((m) => m.delivery_status === 'failed'), true);
});

module.exports = { createMockOutboundHarness };
