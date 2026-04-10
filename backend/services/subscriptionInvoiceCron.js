'use strict';

/**
 * Subscription Invoice Cron
 * ─────────────────────────
 * Runs daily. For every subscription whose `current_period_end` fell within
 * the last 24 hours (i.e. the billing period just ended), it auto-generates a
 * PlatformInvoice with status 'issued' so the tenant can pay / review it.
 *
 * Duplicate guard: skips if an invoice already exists whose notes contain
 * `[sub-period:<subscriptionId>:<periodEndISO>]`.
 *
 * Configurable env vars:
 *   SUBSCRIPTION_INVOICE_CRON       – set to 'false' / '0' / 'no' to disable
 *   SUBSCRIPTION_INVOICE_TZ         – timezone (default: Asia/Colombo)
 *   SUBSCRIPTION_INVOICE_HOUR       – hour to run (default: 0)
 *   SUBSCRIPTION_INVOICE_MINUTE     – minute to run (default: 5)
 *   PLAN_PRICE_BASIC                – override price for basic plan (LKR)
 *   PLAN_PRICE_PRO                  – override price for pro plan (LKR)
 *   PLAN_PRICE_ENTERPRISE           – override price for enterprise plan (LKR)
 */

const cron        = require('node-cron');
const { Op }      = require('sequelize');
const { Subscription, PlatformInvoice, Tenant, PlanConfig } = require('../models');

// ── Price resolution helpers ──────────────────────────────────────────────────

const PLAN_PRICE_DEFAULTS = {
  basic:      5000,
  pro:       10000,
  enterprise: 20000,
};

/**
 * Try to extract a numeric price from a PlanConfig row.
 * `price_display` is typically something like "LKR 2,999" or "$49.99/mo".
 */
function parsePriceDisplay(str) {
  if (!str) return null;
  // Strip currency symbols / letters, keep digits and decimal point
  const clean = str.replace(/[^0-9.]/g, '');
  const v = parseFloat(clean);
  return isNaN(v) || v <= 0 ? null : v;
}

async function getPlanPrice(planKey) {
  // 1. Env override
  const envKey = `PLAN_PRICE_${(planKey || '').toUpperCase()}`;
  if (process.env[envKey]) {
    const v = parseFloat(process.env[envKey]);
    if (!isNaN(v) && v > 0) return v;
  }
  // 2. PlanConfig table
  try {
    const cfg = await PlanConfig.findOne({ where: { key: planKey } });
    if (cfg) {
      const v = parsePriceDisplay(cfg.price_display);
      if (v) return v;
    }
  } catch (_) { /* ignore */ }
  // 3. Hardcoded fallback
  return PLAN_PRICE_DEFAULTS[planKey] || 0;
}

// ── Core logic ────────────────────────────────────────────────────────────────

async function runSubscriptionInvoiceGeneration() {
  const now   = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 h ago

  // Find subscriptions whose period just ended
  const subs = await Subscription.findAll({
    where: {
      current_period_end: { [Op.between]: [since, now] },
      status:             { [Op.in]: ['active', 'past_due', 'trialing'] },
    },
    include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'email', 'plan'], required: false }],
  });

  if (!subs.length) {
    console.log('[SubInvoiceCron] No subscriptions ended in the last 24 h.');
    return { checked: 0, created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const sub of subs) {
    const periodEndISO = sub.current_period_end.toISOString();
    const dupeTag      = `[sub-period:${sub.id}:${periodEndISO}]`;

    // Duplicate guard
    const existing = await PlatformInvoice.findOne({
      where: {
        tenant_id: sub.tenant_id,
        notes:     { [Op.like]: `%${dupeTag}%` },
      },
    });
    if (existing) {
      console.log(`[SubInvoiceCron] Invoice already exists for sub ${sub.id} period ${periodEndISO} — skipping.`);
      skipped++;
      continue;
    }

    const plan  = sub.plan || (sub.tenant && sub.tenant.plan) || 'basic';
    const price = await getPlanPrice(plan);

    const invoiceNumber = `SUB-${sub.tenant_id}-${Date.now()}`;
    const issuedAt      = new Date();
    const dueAt         = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

    try {
      await PlatformInvoice.create({
        tenant_id:             sub.tenant_id,
        invoice_number:        invoiceNumber,
        billing_period_start:  sub.current_period_start || since,
        billing_period_end:    sub.current_period_end,
        amount:                price,
        base_price:            price,
        additional_charges:    0,
        discount:              0,
        currency:              'LKR',
        status:                'issued',
        plan,
        issued_at:             issuedAt,
        due_at:                dueAt,
        notes: `Auto-generated on subscription period end. ${dupeTag}`,
      });
      console.log(`[SubInvoiceCron] Created invoice ${invoiceNumber} for tenant ${sub.tenant_id} (plan: ${plan}, amount: ${price}).`);
      created++;
    } catch (err) {
      console.error(`[SubInvoiceCron] Failed to create invoice for sub ${sub.id}:`, err.message);
    }
  }

  console.log(`[SubInvoiceCron] Done — checked: ${subs.length}, created: ${created}, skipped: ${skipped}.`);
  return { checked: subs.length, created, skipped };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function isCronEnabled() {
  const v = String(process.env.SUBSCRIPTION_INVOICE_CRON ?? '').trim().toLowerCase();
  if (!v) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return true;
}

function startSubscriptionInvoiceCron() {
  if (!isCronEnabled()) {
    console.log('[SubInvoiceCron] Disabled via SUBSCRIPTION_INVOICE_CRON env var.');
    return;
  }

  const tz     = process.env.SUBSCRIPTION_INVOICE_TZ     || 'Asia/Colombo';
  const hour   = Math.min(23, Math.max(0, parseInt(process.env.SUBSCRIPTION_INVOICE_HOUR   || '0',  10) || 0));
  const minute = Math.min(59, Math.max(0, parseInt(process.env.SUBSCRIPTION_INVOICE_MINUTE || '5', 10) || 5));
  // Runs daily at <hour>:<minute>
  const pattern = `${minute} ${hour} * * *`;

  cron.schedule(
    pattern,
    async () => {
      console.log('[SubInvoiceCron] Running subscription period-end invoice generation…');
      try {
        await runSubscriptionInvoiceGeneration();
      } catch (err) {
        console.error('[SubInvoiceCron] Unexpected error:', err.message);
      }
    },
    { timezone: tz },
  );

  console.log(`✓ Subscription invoice cron: ${pattern} (${tz}) — auto-generates invoices on period end`);
}

module.exports = { startSubscriptionInvoiceCron, runSubscriptionInvoiceGeneration };
