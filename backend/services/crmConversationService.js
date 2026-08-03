/**
 * Find-or-create CRM lead + conversation for an inbound WhatsApp phone.
 */
'use strict';

const { Op } = require('sequelize');
const {
  CrmLead,
  CrmConversation,
  CrmMessage,
  Customer,
} = require('../models');

function normalizePhoneDigits(phone = '') {
  return String(phone).replace(/\D/g, '');
}

function buildPhoneVariants(phone = '') {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith('0') && digits.length >= 9) set.add(`94${digits.slice(1)}`);
  if (digits.startsWith('94') && digits.length >= 11) {
    set.add(`0${digits.slice(2)}`);
    set.add(digits.slice(2));
  }
  return Array.from(set);
}

async function findCustomer(tenantId, phone) {
  const variants = buildPhoneVariants(phone);
  if (!variants.length) return null;
  return Customer.findOne({
    where: { tenant_id: tenantId, phone: { [Op.or]: variants } },
  });
}

/**
 * Ensure lead + open conversation for phone.
 * Returns { lead, conversation, customer, isNewLead }
 */
async function ensureConversation({
  tenantId,
  phone,
  name = null,
  campaignSource = null,
  branchId = null,
}) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) throw new Error('phone required');

  const customer = await findCustomer(tenantId, digits);
  const variants = buildPhoneVariants(digits);

  let lead = await CrmLead.findOne({
    where: {
      tenant_id: tenantId,
      phone: { [Op.or]: variants },
      stage: { [Op.notIn]: ['lost'] },
    },
    order: [['id', 'DESC']],
  });

  let isNewLead = false;
  if (!lead) {
    isNewLead = true;
    lead = await CrmLead.create({
      tenant_id: tenantId,
      phone: customer?.phone || digits,
      name: name || customer?.name || null,
      customer_id: customer?.id || null,
      stage: customer ? 'conversation' : 'new',
      campaign_source: campaignSource || null,
      branch_id: branchId || customer?.branch_id || null,
      last_message_at: new Date(),
    });
  } else {
    const patch = { last_message_at: new Date() };
    if (name && !lead.name) patch.name = name;
    if (customer?.id && !lead.customer_id) {
      patch.customer_id = customer.id;
      if (lead.stage === 'new') patch.stage = 'conversation';
    }
    if (campaignSource && !lead.campaign_source) patch.campaign_source = campaignSource;
    await lead.update(patch);
  }

  let conversation = await CrmConversation.findOne({
    where: {
      tenant_id: tenantId,
      phone: { [Op.or]: variants },
      status: { [Op.notIn]: ['closed'] },
    },
    order: [['id', 'DESC']],
  });

  if (!conversation) {
    conversation = await CrmConversation.create({
      tenant_id: tenantId,
      lead_id: lead.id,
      customer_id: customer?.id || lead.customer_id || null,
      phone: lead.phone,
      status: 'ai_active',
      channel: 'whatsapp',
      campaign_source: campaignSource || lead.campaign_source,
      branch_id: branchId || lead.branch_id,
      last_inbound_at: new Date(),
    });
  } else {
    await conversation.update({
      lead_id: lead.id,
      customer_id: customer?.id || conversation.customer_id,
      last_inbound_at: new Date(),
    });
  }

  return { lead, conversation, customer, isNewLead };
}

async function appendMessage({
  tenantId,
  conversationId,
  direction,
  senderType,
  body,
  waMessageId = null,
  deliveryStatus = 'pending',
  meta = null,
}) {
  const msg = await CrmMessage.create({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction,
    sender_type: senderType,
    body: String(body || ''),
    wa_message_id: waMessageId,
    delivery_status: deliveryStatus,
    meta,
  });

  const convPatch = {};
  if (direction === 'inbound') convPatch.last_inbound_at = new Date();
  if (direction === 'outbound') convPatch.last_outbound_at = new Date();
  if (Object.keys(convPatch).length) {
    await CrmConversation.update(convPatch, { where: { id: conversationId } });
  }
  await CrmLead.update(
    { last_message_at: new Date() },
    { where: { id: (await CrmConversation.findByPk(conversationId))?.lead_id || 0 } }
  ).catch(() => {});

  return msg;
}

module.exports = {
  normalizePhoneDigits,
  buildPhoneVariants,
  ensureConversation,
  appendMessage,
  findCustomer,
};
