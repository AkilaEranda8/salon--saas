/**
 * Meta WhatsApp Cloud API webhooks.
 * Mounted BEFORE express.json so POST has raw body for signature verify.
 * Production: HMAC mandatory — never process unsigned payloads (C5).
 */
'use strict';

const express = require('express');
const router = express.Router();
const {
  getWabaByVerifyToken,
  getWabaByPhoneNumberId,
  verifyMetaSignature,
  parseInboundMessages,
  parseStatusUpdates,
} = require('../services/whatsappCloudService');
const { decryptSecret } = require('../utils/secretCrypto');
const { enqueue, QUEUE_NAMES } = require('../services/queue');
const { CrmMessage } = require('../models');
const { hasTenantFeature } = require('../utils/tenantFeatures');
const { Tenant } = require('../models');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/** GET — Meta subscription verification */
router.get('/', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token && challenge) {
      const waba = await getWabaByVerifyToken(token);
      if (waba) {
        return res.status(200).send(String(challenge));
      }
      const fallback = process.env.WHATSAPP_VERIFY_TOKEN;
      if (fallback && token === fallback) {
        return res.status(200).send(String(challenge));
      }
    }
    return res.sendStatus(403);
  } catch (err) {
    console.error('[wa-webhook] verify', err);
    return res.sendStatus(500);
  }
});

/** POST — inbound messages + delivery statuses */
router.post('/', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.sendStatus(400);
    }

    const signature = req.headers['x-hub-signature-256'];
    const inbound = parseInboundMessages(payload);
    const statuses = parseStatusUpdates(payload);

    let waba = null;
    const phoneNumberId = inbound[0]?.phoneNumberId
      || payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    if (phoneNumberId) {
      waba = await getWabaByPhoneNumberId(phoneNumberId);
    }

    // C5: resolve app secret and require valid HMAC before any processing
    let appSecret = null;
    if (waba) {
      appSecret = decryptSecret(waba.app_secret_enc);
    }
    if (!appSecret && process.env.WHATSAPP_APP_SECRET) {
      appSecret = process.env.WHATSAPP_APP_SECRET;
    }

    if (isProduction()) {
      if (!signature) {
        console.warn('[wa-webhook] missing signature');
        return res.sendStatus(401);
      }
      if (!appSecret) {
        console.warn('[wa-webhook] app secret missing for phone_number_id', phoneNumberId);
        return res.sendStatus(401);
      }
      if (!verifyMetaSignature(appSecret, rawBody, signature)) {
        console.warn('[wa-webhook] invalid signature');
        return res.sendStatus(401);
      }
      if (!waba && (inbound.length || statuses.length)) {
        console.warn('[wa-webhook] no WABA mapping for phone_number_id', phoneNumberId);
        return res.sendStatus(404);
      }
    } else {
      // Non-prod: still verify when secret is configured
      if (appSecret) {
        if (!signature || !verifyMetaSignature(appSecret, rawBody, signature)) {
          console.warn('[wa-webhook] invalid/missing signature (dev)');
          return res.sendStatus(401);
        }
      } else {
        console.warn('[wa-webhook] DEV only: processing without HMAC (no app secret)');
      }
    }

    res.sendStatus(200);

    // C10: delivery status scoped by tenant_id + wa_message_id
    for (const st of statuses) {
      if (!st.waMessageId) continue;
      try {
        const account = waba || (st.phoneNumberId
          ? await getWabaByPhoneNumberId(st.phoneNumberId)
          : null);
        if (!account) continue;
        await CrmMessage.update(
          { delivery_status: st.status },
          {
            where: {
              tenant_id: account.tenant_id,
              wa_message_id: st.waMessageId,
            },
          }
        );
      } catch (e) {
        console.warn('[wa-webhook] status update', e.message);
      }
    }

    for (const msg of inbound) {
      try {
        const account = waba || await getWabaByPhoneNumberId(msg.phoneNumberId);
        if (!account || !account.enabled) {
          console.warn('[wa-webhook] skip inbound — no enabled WABA', msg.phoneNumberId);
          continue;
        }
        const tenant = await Tenant.findByPk(account.tenant_id);
        if (!tenant || !hasTenantFeature(tenant, 'whatsapp_ai_crm')) {
          console.warn('[wa-webhook] feature gated tenant', account.tenant_id);
          continue;
        }

        const jobId = msg.waMessageId
          ? `wa-in-${account.tenant_id}-${msg.waMessageId}`
          : undefined;

        await enqueue(QUEUE_NAMES.WA_INBOUND_AI, {
          tenantId: account.tenant_id,
          phone: msg.from,
          message: msg.text || 'Hi',
          waMessageId: msg.waMessageId,
          name: msg.contactName || null,
          campaignSource: 'whatsapp_cloud',
        }, {
          name: 'cloud-inbound',
          jobId,
        });
      } catch (e) {
        // BullMQ duplicate jobId throws — treat as success (idempotent)
        if (String(e.message || '').includes('Job') && String(e.message || '').includes('exists')) {
          continue;
        }
        console.error('[wa-webhook] enqueue inbound', e.message);
      }
    }
  } catch (err) {
    console.error('[wa-webhook] post', err);
    if (!res.headersSent) return res.sendStatus(500);
  }
});

module.exports = router;
