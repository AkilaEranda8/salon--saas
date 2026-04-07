const { Tenant, Subscription } = require('../models');
const { invalidateTenantCache } = require('../middleware/tenantScope');

// Lazy-load Stripe so the app still boots when STRIPE_SECRET_KEY is not set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PRICE_IDS = {
  basic:      process.env.STRIPE_BASIC_PRICE_ID,
  pro:        process.env.STRIPE_PRO_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

// ── POST /api/billing/checkout ────────────────────────────────────────────────
const createCheckout = async (req, res) => {
  try {
    const stripe = getStripe();
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });

    const { plan } = req.body;
    const priceId  = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ message: `Invalid plan: ${plan}. Valid: basic, pro, enterprise.` });
    }

    // Get or create Stripe customer
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    tenant.email,
        name:     tenant.name,
        metadata: { tenant_id: String(tenant.id), tenant_slug: tenant.slug },
      });
      customerId = customer.id;
      await tenant.update({ stripe_customer_id: customerId });
    }

    const baseUrl = process.env.FRONTEND_BASE_URL
      ? process.env.FRONTEND_BASE_URL.replace('{slug}', tenant.slug)
      : `https://${tenant.slug}.zanesalon.com`;

    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/billing`,
      metadata: { tenant_id: String(tenant.id) },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('billing.createCheckout error:', err);
    return res.status(500).json({ message: err.message || 'Failed to create checkout session.' });
  }
};

// ── GET /api/billing/portal ───────────────────────────────────────────────────
const billingPortal = async (req, res) => {
  try {
    const stripe = getStripe();
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });
    if (!tenant.stripe_customer_id) {
      return res.status(400).json({ message: 'No billing account found. Please subscribe first.' });
    }

    const baseUrl = process.env.FRONTEND_BASE_URL
      ? process.env.FRONTEND_BASE_URL.replace('{slug}', tenant.slug)
      : `https://${tenant.slug}.zanesalon.com`;

    const session = await stripe.billingPortal.sessions.create({
      customer:   tenant.stripe_customer_id,
      return_url: `${baseUrl}/billing`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('billing.billingPortal error:', err);
    return res.status(500).json({ message: err.message || 'Failed to open billing portal.' });
  }
};

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
// NOTE: This route is registered BEFORE express.json() in server.js
//       so req.body contains the raw Buffer (needed for signature verification)
const stripeWebhook = async (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ message: 'STRIPE_WEBHOOK_SECRET not configured.' });
  }

  let event;
  try {
    const stripe = getStripe();
    const sig    = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  try {
    await handleStripeEvent(event);
    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    return res.status(500).json({ message: 'Webhook handler failed.' });
  }
};

async function handleStripeEvent(event) {
  const stripe = getStripe();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session    = event.data.object;
      const tenantId   = parseInt(session.metadata?.tenant_id);
      if (!tenantId) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await syncSubscription(tenantId, subscription);
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const stripeSubscription = event.data.object;
      // Find tenant by Stripe customer ID
      const tenant = await Tenant.findOne({ where: { stripe_customer_id: stripeSubscription.customer } });
      if (!tenant) break;

      await syncSubscription(tenant.id, stripeSubscription);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const tenant  = await Tenant.findOne({ where: { stripe_customer_id: invoice.customer } });
      if (!tenant) break;

      await tenant.update({ status: 'suspended' });
      invalidateTenantCache(tenant.slug);
      break;
    }

    default:
      // Unhandled event type — ignore
      break;
  }
}

async function syncSubscription(tenantId, stripeSubscription) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return;

  const priceId = stripeSubscription.items.data[0]?.price?.id;
  const plan    = getPlanFromPriceId(priceId);
  const status  = stripeSubscription.status; // active, trialing, past_due, canceled

  const tenantStatus = (status === 'active' || status === 'trialing') ? 'active' : 'suspended';

  await tenant.update({
    plan,
    status:                 tenantStatus,
    stripe_subscription_id: stripeSubscription.id,
  });

  // Upsert Subscription record
  await Subscription.upsert({
    tenant_id:              tenantId,
    stripe_subscription_id: stripeSubscription.id,
    stripe_price_id:        priceId,
    plan,
    status,
    current_period_start:   new Date(stripeSubscription.current_period_start * 1000),
    current_period_end:     new Date(stripeSubscription.current_period_end   * 1000),
    cancel_at_period_end:   stripeSubscription.cancel_at_period_end,
  });

  invalidateTenantCache(tenant.slug);
}

function getPlanFromPriceId(priceId) {
  if (priceId === PRICE_IDS.enterprise) return 'enterprise';
  if (priceId === PRICE_IDS.pro)        return 'pro';
  if (priceId === PRICE_IDS.basic)      return 'basic';
  return 'basic'; // default
}

// ── GET /api/billing/status ───────────────────────────────────────────────────
const billingStatus = async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });

    const sub = await Subscription.findOne({
      where:  { tenant_id: tenant.id },
      order:  [['createdAt', 'DESC']],
    });

    return res.json({
      plan:           tenant.plan,
      status:         tenant.status,
      trial_ends_at:  tenant.trial_ends_at,
      subscription:   sub,
    });
  } catch (err) {
    console.error('billing.billingStatus error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { createCheckout, billingPortal, stripeWebhook, billingStatus };
