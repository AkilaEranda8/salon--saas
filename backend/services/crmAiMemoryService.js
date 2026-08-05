'use strict';

/**
 * Persist / load short-term CRM AI memory per phone (preferences + summary).
 */
async function loadMemory(tenantId, { phone, conversationId, leadId } = {}) {
  const { CrmAiMemory } = require('../models');
  const { Op } = require('sequelize');
  if (!tenantId) return null;

  if (conversationId) {
    const byConv = await CrmAiMemory.findOne({
      where: { tenant_id: tenantId, conversation_id: conversationId },
      order: [['id', 'DESC']],
    });
    if (byConv) return byConv;
  }
  if (phone) {
    const byPhone = await CrmAiMemory.findOne({
      where: { tenant_id: tenantId, phone: String(phone).replace(/\D/g, '').slice(-12) },
      order: [['updatedAt', 'DESC']],
    });
    if (byPhone) return byPhone;
  }
  if (leadId) {
    return CrmAiMemory.findOne({
      where: { tenant_id: tenantId, lead_id: leadId },
      order: [['id', 'DESC']],
    });
  }
  return null;
}

function memoryToContext(row) {
  if (!row) return null;
  return {
    summary: row.summary || null,
    preferred_services: row.preferred_services || null,
    preferred_branch_id: row.preferred_branch_id || null,
    objections: row.objections || null,
  };
}

/**
 * Upsert memory after a turn — merges preferred services / summary snippets.
 */
async function upsertMemoryFromTurn({
  tenantId,
  conversationId,
  leadId,
  phone,
  message,
  replyText,
  turn,
} = {}) {
  const { CrmAiMemory } = require('../models');
  if (!tenantId || !phone) return null;

  const digits = String(phone).replace(/\D/g, '').slice(-12);
  let row = await CrmAiMemory.findOne({
    where: { tenant_id: tenantId, phone: digits },
    order: [['id', 'DESC']],
  });

  const preferred = Array.isArray(row?.preferred_services) ? [...row.preferred_services] : [];
  const actions = Array.isArray(turn?.actions) ? turn.actions : [];
  for (const a of actions) {
    if (a?.tool === 'list_services' && a.matched) {
      // no service names here
    }
  }
  // Extract simple service interest tokens from customer message
  const msg = String(message || '').toLowerCase();
  const interestHints = ['hair', 'facial', 'bridal', 'nail', 'massage', 'color', 'cut', 'keratina', 'rebonding'];
  for (const h of interestHints) {
    if (msg.includes(h) && !preferred.includes(h)) preferred.push(h);
  }

  const booking = turn?.booking;
  const summaryBits = [];
  if (row?.summary) summaryBits.push(String(row.summary).slice(0, 400));
  if (booking?.status === 'confirmed') {
    summaryBits.push(`Booked appointment ${booking.salon_appointment_id || ''}`.trim());
  }
  if (turn?.handoff?.reason) {
    summaryBits.push(`Handoff: ${turn.handoff.reason}`);
  }
  const lastExchange = `Customer: ${String(message || '').slice(0, 120)} | AI: ${String(replyText || '').slice(0, 120)}`;
  summaryBits.push(lastExchange);

  const payload = {
    tenant_id: tenantId,
    conversation_id: conversationId || row?.conversation_id || null,
    lead_id: leadId || row?.lead_id || null,
    phone: digits,
    preferred_services: preferred.slice(0, 20),
    preferred_branch_id: booking?.payload?.branch_id || row?.preferred_branch_id || null,
    objections: row?.objections || null,
    summary: summaryBits.filter(Boolean).join(' · ').slice(0, 2000),
    meta: {
      last_turn_at: new Date().toISOString(),
      last_actions: actions.slice(0, 8),
    },
  };

  if (row) {
    await row.update(payload);
    return row;
  }
  return CrmAiMemory.create(payload);
}

module.exports = {
  loadMemory,
  memoryToContext,
  upsertMemoryFromTurn,
};
