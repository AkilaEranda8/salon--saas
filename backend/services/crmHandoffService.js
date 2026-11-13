/**
 * CRM handoff lifecycle helpers: booking-session reset, staff re-notify,
 * auto-release of stale queued/human_active chats, credit top-up release.
 */
'use strict';

const { Op } = require('sequelize');
const { CrmConversation, CrmMessage, CrmAuditLog, Tenant } = require('../models');
const { getRedis, cacheKey } = require('../utils/redis');
const { isTenantCrmEligible } = require('../utils/tenantFeatures');

/** Hours of no agent activity before queued/human_active returns to AI. */
const HANDOFF_AUTO_RELEASE_HOURS = Number(process.env.CRM_HANDOFF_AUTO_RELEASE_HOURS) || 4;
/** Minimum seconds between repeat staff notifications per conversation. */
const HANDOFF_RENOTIFY_THROTTLE_SEC = Number(process.env.CRM_HANDOFF_RENOTIFY_SEC) || 60;

const HANDOFF_STATUSES = ['queued', 'human_active'];
/** Same status manual release uses; inbound turn flips it to ai_active. */
const RELEASED_STATUS = 'ai_resume';

/**
 * Booking dialogue state lives in Redis (ai_engine/app/session_store.py):
 *   ai:booking:session:{tenant_id}:{conversation_id}:{phone}
 * Phone may differ (lead vs conversation), so scan the conversation prefix.
 */
async function clearBookingSession({ tenantId, conversationId, phone = null }) {
  const redis = getRedis();
  if (!redis || !tenantId || !conversationId) return 0;
  const prefix = `ai:booking:session:${tenantId}:${conversationId}:`;
  const keys = new Set();
  if (phone) keys.add(`${prefix}${phone}`);
  try {
    let cursor = '0';
    do {
      // eslint-disable-next-line no-await-in-loop
      const [next, found] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      found.forEach((k) => keys.add(k));
    } while (cursor !== '0');
  } catch (err) {
    console.warn('[handoff] session scan failed', err.message);
  }
  if (!keys.size) return 0;
  try {
    return await redis.del(...keys);
  } catch (err) {
    console.warn('[handoff] session clear failed', err.message);
    return 0;
  }
}

/**
 * Re-notify staff when a customer writes while chat is queued/human_active.
 * Throttled per conversation so rapid messages don't spam FCM.
 */
async function notifyStaffInboundWhileHandoff({ tenantId, conversationId, status }) {
  const redis = getRedis();
  if (redis) {
    const key = cacheKey(tenantId, 'crm', 'handoff_renotify', conversationId);
    const got = await redis.set(key, '1', 'EX', HANDOFF_RENOTIFY_THROTTLE_SEC, 'NX');
    if (!got) return { throttled: true };
  }
  const { enqueue, QUEUE_NAMES } = require('./queue');
  const id = await enqueue(QUEUE_NAMES.HANDOFF, {
    tenant_id: tenantId,
    conversation_id: conversationId,
    reason: `customer_message_while_${status}`,
    kind: 'customer_message',
  }, { name: 'handoff-renotify' });
  return { enqueued: !!id };
}

async function latestAgentActivityAt(conv) {
  const candidates = [conv.staff_last_read_at, conv.last_outbound_at];
  const lastAgentMsg = await CrmMessage.findOne({
    where: { tenant_id: conv.tenant_id, conversation_id: conv.id, sender_type: 'agent' },
    order: [['id', 'DESC']],
    attributes: ['createdAt'],
  });
  if (lastAgentMsg?.createdAt) candidates.push(lastAgentMsg.createdAt);
  const times = candidates.filter(Boolean).map((d) => new Date(d).getTime());
  if (!times.length) return new Date(conv.createdAt).getTime();
  return Math.max(...times);
}

async function releaseConversationToAi(conv, { reason, actorType = 'system' }) {
  await conv.update({
    status: RELEASED_STATUS,
    assigned_user_id: null,
    handoff_reason: null,
  });
  await clearBookingSession({
    tenantId: conv.tenant_id,
    conversationId: conv.id,
    phone: conv.phone,
  });
  await CrmAuditLog.create({
    tenant_id: conv.tenant_id,
    actor_type: actorType,
    actor_id: null,
    action: 'conversation_auto_released',
    entity_type: 'conversation',
    entity_id: conv.id,
    meta: { reason },
  }).catch(() => {});
}

/**
 * Release queued/human_active conversations with no agent activity for N hours.
 * Credit-exhausted chats stay queued while the credit gate is still blocking.
 */
async function releaseStaleHandoffs({ hours = HANDOFF_AUTO_RELEASE_HOURS, limit = 200 } = {}) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const candidates = await CrmConversation.findAll({
    where: {
      status: { [Op.in]: HANDOFF_STATUSES },
      [Op.and]: [
        { [Op.or]: [{ staff_last_read_at: null }, { staff_last_read_at: { [Op.lt]: cutoff } }] },
        { [Op.or]: [{ last_outbound_at: null }, { last_outbound_at: { [Op.lt]: cutoff } }] },
      ],
    },
    order: [['id', 'ASC']],
    limit,
  });

  const tenantOk = new Map();
  const creditBlocked = new Map();
  let released = 0;
  let skipped = 0;

  for (const conv of candidates) {
    try {
      if (!tenantOk.has(conv.tenant_id)) {
        const tenant = await Tenant.findByPk(conv.tenant_id);
        tenantOk.set(conv.tenant_id, isTenantCrmEligible(tenant));
      }
      if (!tenantOk.get(conv.tenant_id)) {
        skipped += 1;
        continue;
      }
      if ((await latestAgentActivityAt(conv)) >= cutoff.getTime()) {
        skipped += 1;
        continue;
      }
      if (conv.handoff_reason === 'ai_credits_exhausted') {
        if (!creditBlocked.has(conv.tenant_id)) {
          const { getAiCreditGate } = require('./crmCreditGate');
          creditBlocked.set(conv.tenant_id, (await getAiCreditGate(conv.tenant_id)).blocked);
        }
        if (creditBlocked.get(conv.tenant_id)) {
          skipped += 1;
          continue;
        }
      }
      await releaseConversationToAi(conv, { reason: `no_agent_activity_${hours}h` });
      released += 1;
    } catch (err) {
      console.warn('[handoff] auto-release failed', conv.id, err.message);
    }
  }

  if (released) console.log(`[handoff] auto-released ${released} conversation(s) after ${hours}h`);
  return { released, skipped, scanned: candidates.length, hours };
}

/**
 * After a credit top-up / balance sync: return credit-exhausted queued chats to AI.
 */
async function releaseCreditBlockedConversations(tenantId) {
  if (!tenantId) return { released: 0 };
  const { getAiCreditGate } = require('./crmCreditGate');
  const gate = await getAiCreditGate(tenantId);
  if (gate.blocked) return { released: 0, still_blocked: true };

  const convs = await CrmConversation.findAll({
    where: {
      tenant_id: tenantId,
      status: 'queued',
      handoff_reason: 'ai_credits_exhausted',
    },
    limit: 500,
  });
  for (const conv of convs) {
    await releaseConversationToAi(conv, { reason: 'ai_credits_restored' });
  }
  return { released: convs.length };
}

module.exports = {
  HANDOFF_AUTO_RELEASE_HOURS,
  clearBookingSession,
  notifyStaffInboundWhileHandoff,
  releaseConversationToAi,
  releaseStaleHandoffs,
  releaseCreditBlockedConversations,
};
