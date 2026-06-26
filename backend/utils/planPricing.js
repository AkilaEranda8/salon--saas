'use strict';

const { PlanConfig } = require('../models');

const PLAN_PRICE_DEFAULTS = {
  trial: 0,
  basic: 5000,
  pro: 10000,
  enterprise: 20000,
};

function parsePriceDisplay(str) {
  if (!str) return null;
  const clean = String(str).replace(/[^0-9.]/g, '');
  const v = parseFloat(clean);
  return Number.isNaN(v) || v < 0 ? null : v;
}

function offerIsActive(plan) {
  if (!plan?.offer_active || !plan.offer_price_display) return false;
  if (!plan.offer_ends_at) return true;
  return new Date(plan.offer_ends_at) > new Date();
}

async function getPlanPrice(planKey) {
  const key = String(planKey || '').toLowerCase().trim();
  if (!key) return 0;

  const envKey = `PLAN_PRICE_${key.toUpperCase()}`;
  if (process.env[envKey]) {
    const v = parseFloat(process.env[envKey]);
    if (!Number.isNaN(v) && v >= 0) return v;
  }

  try {
    const cfg = await PlanConfig.findOne({ where: { key } });
    if (cfg) {
      if (offerIsActive(cfg)) {
        const offer = parsePriceDisplay(cfg.offer_price_display);
        if (offer != null) return offer;
      }
      const v = parsePriceDisplay(cfg.price_display);
      if (v != null) return v;
    }
  } catch (_) { /* ignore */ }

  return PLAN_PRICE_DEFAULTS[key] ?? 0;
}

async function resolvePlanForInvoice(planKey) {
  const key = String(planKey || '').toLowerCase().trim();
  if (!key) return null;

  const cfg = await PlanConfig.findOne({ where: { key } });
  const price = await getPlanPrice(key);

  if (!cfg) {
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      price,
      price_display: price > 0 ? `LKR ${price.toLocaleString('en-LK')}` : 'Free',
      price_period: '/mo',
      tagline: null,
      features: [],
      offer_applied: false,
    };
  }

  const usingOffer = offerIsActive(cfg);
  const display = usingOffer && cfg.offer_price_display
    ? cfg.offer_price_display
    : cfg.price_display;

  return {
    key: cfg.key,
    label: cfg.label,
    price,
    price_display: display,
    price_period: cfg.price_period || '/mo',
    tagline: cfg.tagline,
    features: Array.isArray(cfg.features) ? cfg.features : [],
    offer_applied: usingOffer,
    offer_label: usingOffer ? cfg.offer_label : null,
  };
}

function currentMonthBillingPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    billing_period_start: start.toISOString().slice(0, 10),
    billing_period_end: end.toISOString().slice(0, 10),
  };
}

function computeInvoiceTotal(basePrice, additionalCharges = 0, discount = 0) {
  const base = Number(basePrice) || 0;
  const extra = Number(additionalCharges) || 0;
  const off = Number(discount) || 0;
  return Math.max(0, Math.round((base + extra - off) * 100) / 100);
}

module.exports = {
  parsePriceDisplay,
  getPlanPrice,
  resolvePlanForInvoice,
  currentMonthBillingPeriod,
  computeInvoiceTotal,
  PLAN_PRICE_DEFAULTS,
};
