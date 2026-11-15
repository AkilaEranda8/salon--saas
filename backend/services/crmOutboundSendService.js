/**
 * Unified CRM outbound sender — every WhatsApp automation/reminder/nudge send
 * logs a CrmMessage (Inbox + AI context) and goes through WA_OUTBOUND so the
 * worker's dedupe, 24h-window check and delivery tracking apply.
 */
'use strict';

const { CrmConversation, CrmMessage } = require('../models');
const {
  appendMessage,
  normalizePhoneDigits,
  ensureOutboundConversation,
} = require('./crmConversationService');
const { enqueue, QUEUE_NAMES } = require('./queue');
const {
  getWabaByTenant,
  chooseCloudSend,
  sendCloudChosen,
  isWithin24hWindow,
} = require('./whatsappCloudService');

const MS_24H = 24 * 60 * 60 * 1000;
const SENDER_TYPES = ['ai', 'bot', 'automation', 'agent', 'system'];

// Delegates to crmRealtime (relays via API when called from the worker process)
const { emitCrmEvent } = require('./crmRealtime');

const isInside24hWindow = isWithin24hWindow;

/** Rank for monotonic webhook status updates: sent < delivered < read; failed is terminal. */
const STATUS_RANK = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function canAdvanceDeliveryStatus(current, next) {
  const cur = String(current || 'pending');
  const nxt = String(next || '');
  if (cur === 'failed') return false; // terminal
  if (nxt === 'failed') return cur !== 'delivered' && cur !== 'read';
  const curRank = STATUS_RANK[cur];
  const nxtRank = STATUS_RANK[nxt];
  if (nxtRank == null) return false;
  return nxtRank > (curRank ?? 0);
}

async function markMessageSent(tenantId, crmMessageId, waMessageId = null) {
  if (!crmMessageId) return;
  const row = await CrmMessage.findOne({ where: { id: crmMessageId, tenant_id: tenantId } });
  if (!row) return;
  if (!canAdvanceDeliveryStatus(row.delivery_status === 'failed' ? 'pending' : row.delivery_status, 'sent')) {
    return;
  }
  const patch = { delivery_status: 'sent' };
  if (waMessageId) patch.wa_message_id = waMessageId;
  await row.update(patch);
  emitCrmEvent(tenantId, 'crm:message', {
    conversation_id: row.conversation_id,
    message_id: row.id,
    delivery_status: 'sent',
  });
}

/** Mark outbound failed and keep the reason in meta.error / meta.error_code. */
async function markMessageFailed(tenantId, crmMessageId, error) {
  if (!crmMessageId) return;
  const row = await CrmMessage.findOne({
    where: { id: crmMessageId, tenant_id: tenantId },
  });
  if (!row) return;
  const prev = String(row.delivery_status || '');
  if (['delivered', 'read'].includes(prev)) return;
  const meta = {
    ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
    error: String(error?.message || error || 'send_failed').slice(0, 500),
    error_code: error?.code || null,
    failed_at: new Date().toISOString(),
  };
  await row.update({ delivery_status: 'failed', meta });
  emitCrmEvent(tenantId, 'crm:message', {
    conversation_id: row.conversation_id,
    message_id: row.id,
    delivery_status: 'failed',
  });
}

/**
 * No Redis/queue available: deliver in-process (Cloud first, legacy QR/Twilio last)
 * so the CrmMessage never stays "pending" forever. Throws on failure.
 */
async function deliverDirect({ tenantId, phone, text, conversation, msg, templateName, templateParams }) {
  const waba = await getWabaByTenant(tenantId);
  try {
    if (waba && waba.enabled) {
      const choice = chooseCloudSend({ conversation, text, templateName, templateParams });
      const result = await sendCloudChosen({ tenantId, to: phone, choice, wabaRow: waba });
      await markMessageSent(tenantId, msg.id, result.waMessageId || null);
      return { waMessageId: result.waMessageId || null };
    }
    const { sendWhatsApp } = require('./notificationService');
    await sendWhatsApp({ to: phone, message: text, tenantId, meta: { tenant_id: tenantId } });
    await markMessageSent(tenantId, msg.id);
    return {};
  } catch (err) {
    await markMessageFailed(tenantId, msg.id, err);
    throw err;
  }
}

/**
 * Persist an outbound WhatsApp message on the CRM thread and queue delivery.
 *
 * @param {object} p
 * @param {number} p.tenantId
 * @param {string} p.phone
 * @param {string} p.text
 * @param {'bot'|'automation'|'agent'|'system'|'ai'} [p.senderType='automation']
 * @param {number} [p.conversationId]
 * @param {string} [p.channel='whatsapp'] only whatsapp is logged here
 * @param {string} [p.templateName] Cloud template used when outside the 24h window
 * @param {Array}  [p.templateParams] body parameter values (or Cloud components)
 * @param {object} [p.meta]
 * @returns {Promise<{conversationId:number, messageId:number, queued:boolean}|{skipped:true, reason:string}>}
 */
async function sendAndLog({
  tenantId,
  phone,
  text,
  senderType = 'automation',
  conversationId = null,
  channel = 'whatsapp',
  name = null,
  templateName = null,
  templateParams = null,
  languageCode = 'en',
  meta = null,
  buttons = null,
  footer = null,
  replyJid = null,
}) {
  if (String(channel || 'whatsapp').toLowerCase() !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp' };
  }
  const body = String(text || '').trim();
  if (!tenantId || !phone || !body) {
    return { skipped: true, reason: 'missing_fields' };
  }
  const sender = SENDER_TYPES.includes(senderType) ? senderType : 'system';
  const digits = normalizePhoneDigits(phone);
  if (!digits) return { skipped: true, reason: 'invalid_phone' };

  let conversation = null;
  if (conversationId) {
    conversation = await CrmConversation.findOne({
      where: { id: conversationId, tenant_id: tenantId },
    });
  }
  if (!conversation) {
    conversation = await ensureOutboundConversation({ tenantId, phone: digits, name });
  }

  const msg = await appendMessage({
    tenantId,
    conversationId: conversation.id,
    direction: 'outbound',
    senderType: sender,
    body,
    deliveryStatus: 'pending',
    meta: {
      ...(meta || {}),
      source: (meta && meta.source) || sender,
      template_name: templateName || null,
      outside_24h: !isWithin24hWindow(conversation),
    },
  });

  const toPhone = conversation.phone || digits;
  let queued = false;
  try {
    const jobId = await enqueue(QUEUE_NAMES.WA_OUTBOUND, {
      tenant_id: tenantId,
      conversation_id: conversation.id,
      phone: toPhone,
      message: body,
      crm_message_id: msg.id,
      sender_type: sender,
      template_name: templateName || null,
      template_params: templateParams || null,
      language_code: languageCode,
      event_type: (meta && meta.event_type) || `crm_${sender}`,
      buttons: Array.isArray(buttons) && buttons.length ? buttons.slice(0, 3) : undefined,
      footer: footer || undefined,
      replyJid: replyJid || (meta && meta.replyJid) || undefined,
    }, { name: `crm-out-${sender}`, jobId: `wa-out-${tenantId}-msg-${msg.id}` });
    queued = jobId != null;
  } catch (err) {
    console.warn('[crmOutbound] enqueue failed, delivering directly', err.message);
  }

  let direct = null;
  if (!queued) {
    direct = await deliverDirect({
      tenantId,
      phone: toPhone,
      text: body,
      conversation,
      msg,
      templateName,
      templateParams,
    });
  }

  emitCrmEvent(tenantId, 'crm:message', {
    conversation_id: conversation.id,
    message: msg,
  });
  emitCrmEvent(tenantId, 'crm:conversation', {
    conversation_id: conversation.id,
    phone: conversation.phone,
  });

  return {
    conversationId: conversation.id,
    messageId: msg.id,
    queued,
    ...(direct?.waMessageId ? { waMessageId: direct.waMessageId } : {}),
  };
}

module.exports = {
  sendAndLog,
  markMessageSent,
  markMessageFailed,
  isInside24hWindow,
  canAdvanceDeliveryStatus,
  emitCrmEvent,
  MS_24H,
};
