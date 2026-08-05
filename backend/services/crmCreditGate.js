'use strict';

/**
 * Soft gate for AI turns when the salon tracks prepaid AI credits.
 * If they never recorded top-ups, do not block (OpenAI / pay-as-you-go keys).
 * If they have top-ups and remaining <= 0, block AI.
 */
async function getAiCreditGate(tenantId) {
  const { fn, col } = require('sequelize');
  const { AiCreditEntry, AiUsage } = require('../models');
  if (!tenantId) return { blocked: false, remaining: null, topups_count: 0 };

  const [ledgerRow, topupRow, spendRow] = await Promise.all([
    AiCreditEntry.findOne({
      where: { tenant_id: tenantId },
      attributes: [[fn('COALESCE', fn('SUM', col('amount_usd')), 0), 'total']],
      raw: true,
    }),
    AiCreditEntry.findOne({
      where: { tenant_id: tenantId, entry_type: 'topup' },
      attributes: [[fn('COUNT', col('id')), 'count']],
      raw: true,
    }),
    AiUsage.findOne({
      where: { tenant_id: tenantId },
      attributes: [[fn('COALESCE', fn('SUM', col('cost')), 0), 'total']],
      raw: true,
    }),
  ]);

  const credits = Number(ledgerRow?.total || 0);
  const spent = Number(spendRow?.total || 0);
  const topupsCount = Number(topupRow?.count || 0);
  const remaining = Math.round((credits - spent) * 10000) / 10000;

  if (topupsCount > 0 && remaining <= 0) {
    return {
      blocked: true,
      remaining,
      topups_count: topupsCount,
      message:
        'Our AI assistant is paused while AI credits are topped up. A team member will help you shortly — or reply again later.',
    };
  }
  return { blocked: false, remaining, topups_count: topupsCount };
}

module.exports = { getAiCreditGate };
