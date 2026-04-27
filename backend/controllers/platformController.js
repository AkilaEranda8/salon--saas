const { Op, fn, col, literal } = require('sequelize');
const { Tenant, Subscription, Branch, Staff, User, Customer, Appointment, Payment, NotificationSettings, MaintenanceLog, NotificationLog, SupportTicket, PlatformInvoice, PlanConfig, PlanChangeLog } = require('../models');
const { sequelize } = require('../config/database');
const { invalidateTenantCache } = require('../middleware/tenantScope');
const { getMaintenanceMode, setMaintenanceMode } = require('../services/systemSettings');
const { getApiMonitoringSnapshot } = require('../services/apiMonitoring');
const { sendSMS, sendEmail } = require('../services/notificationService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { addTrialDays, getTenantCaps } = require('../utils/planConfig');
const { generateInvoicePdfBuffer, sendInvoiceEmail } = require('../services/invoiceDocumentService');
const { FORBIDDEN_SLUGS, SLUG_RE, findUniqueSlug, buildTenantAppUrl } = require('../utils/tenantDomain');

const TENANT_ACTIVE_SUB_STATUSES = new Set(['active', 'trialing']);

const tenantStatusFromSubscriptionStatus = (status) => (
  TENANT_ACTIVE_SUB_STATUSES.has(status) ? 'active' : 'suspended'
);

const ALLOWED_PLANS = new Set(['trial', 'basic', 'pro', 'enterprise']);
const ALLOWED_STATUSES = new Set(['active', 'suspended', 'cancelled']);

const hasMaintenanceLogModel = !!MaintenanceLog && typeof MaintenanceLog.findAll === 'function';
const hasSupportTicketModel = !!SupportTicket && typeof SupportTicket.count === 'function';
const hasNotificationLogModel = !!NotificationLog && typeof NotificationLog.findAll === 'function';
const hasAppointmentModel = !!Appointment && typeof Appointment.count === 'function';

const TENANT_SAFE_ATTRIBUTES = [
  'id',
  'name',
  'slug',
  'email',
  'brand_name',
  'logo_sidebar_url',
  'logo_header_url',
  'logo_login_url',
  'logo_public_url',
  'plan',
  'status',
  'trial_ends_at',
  'max_branches',
  'max_staff',
  'payment_gateway',
  'back_transfer_wage',
  'helapay_merchant_id',
  'helapay_app_id',
  'helapay_business_id',
  'helapay_notify_url',
  'createdAt',
  'updatedAt',
];

const fetchMaintenanceLogsSafe = async (limit = 20) => {
  if (!hasMaintenanceLogModel) {
    console.warn('platform.maintenanceLogs model missing; returning empty logs.');
    return [];
  }

  try {
    return await MaintenanceLog.findAll({
      order: [['createdAt', 'DESC']],
      limit,
      include: [{ model: User, as: 'changedBy', attributes: ['id', 'name', 'username', 'role'] }],
    });
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    console.warn('platform.maintenanceLogs include fallback:', err?.message || err);

    if (
      msg.includes('changedby') ||
      msg.includes('eagerloadingerror') ||
      msg.includes('unknown column') ||
      msg.includes('doesn\'t exist') ||
      msg.includes('no such table') ||
      msg.includes('maintenance_logs')
    ) {
      try {
        const rows = await MaintenanceLog.findAll({
          order: [['createdAt', 'DESC']],
          limit,
        });
        return rows.map((row) => ({
          ...row.toJSON(),
          changedBy: null,
        }));
      } catch (fallbackErr) {
        console.warn('platform.maintenanceLogs base fallback failed:', fallbackErr?.message || fallbackErr);
        return [];
      }
    }

    return [];
  }
};

// ── GET /api/platform/tenants ─────────────────────────────────────────────────
const listTenants = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.plan)   where.plan   = req.query.plan;
    if (req.query.status) where.status = req.query.status;
    if (req.query.search) {
      where[Op.or] = [
        { name:  { [Op.like]: `%${req.query.search}%` } },
        { slug:  { [Op.like]: `%${req.query.search}%` } },
        { email: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const { count, rows } = await Tenant.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: TENANT_SAFE_ATTRIBUTES,
    });

    // Attach the latest subscription snapshot per tenant for platform billing UI.
    const tenantIds = rows.map((t) => t.id);
    const subscriptions = tenantIds.length
      ? await Subscription.findAll({
          where: { tenant_id: tenantIds },
          attributes: ['id', 'tenant_id', 'plan', 'status', 'current_period_end', 'createdAt'],
          order: [['tenant_id', 'ASC'], ['createdAt', 'DESC']],
        })
      : [];

    const latestSubByTenant = new Map();
    for (const sub of subscriptions) {
      if (!latestSubByTenant.has(sub.tenant_id)) {
        latestSubByTenant.set(sub.tenant_id, sub);
      }
    }

    const tenants = rows.map((tenant) => {
      const sub = latestSubByTenant.get(tenant.id);
      return {
        ...tenant.toJSON(),
        subscription: sub
          ? {
              id: sub.id,
              plan: sub.plan,
              status: sub.status,
              current_period_end: sub.current_period_end,
              createdAt: sub.createdAt,
            }
          : null,
      };
    });

    return res.json({ total: count, page, limit, tenants });
  } catch (err) {
    console.error('platform.listTenants error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/tenants ───────────────────────────────────────────────
const createTenant = async (req, res) => {
  const {
    businessName,
    slug,
    ownerEmail,
    ownerName,
    password,
    phone,
    plan = 'trial',
    status = 'active',
    branchName,
  } = req.body || {};

  if (!businessName || !ownerEmail || !ownerName || !password) {
    return res.status(400).json({ message: 'businessName, ownerEmail, ownerName, and password are required.' });
  }

  const rawSlug = String(slug || '').toLowerCase().trim();
  let cleanSlug = rawSlug;
  if (rawSlug && !SLUG_RE.test(cleanSlug)) {
    return res.status(400).json({ message: 'Invalid slug format.' });
  }
  if (rawSlug && FORBIDDEN_SLUGS.has(cleanSlug)) {
    return res.status(400).json({ message: `The slug "${cleanSlug}" is reserved.` });
  }

  if (!ALLOWED_PLANS.has(plan)) {
    return res.status(400).json({ message: 'Invalid plan. Use trial, basic, pro, or enterprise.' });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ message: 'Invalid status. Use active, suspended, or cancelled.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const t = await sequelize.transaction();
  try {
    if (!cleanSlug) {
      cleanSlug = await findUniqueSlug(businessName, t);
    } else {
      const existing = await Tenant.findOne({ where: { slug: cleanSlug }, transaction: t });
      if (existing) {
        await t.rollback();
        return res.status(409).json({ message: 'This business URL is already taken.' });
      }
    }

    const caps = getTenantCaps(plan);
    const trialEnds = plan === 'trial' ? addTrialDays() : null;

    const tenant = await Tenant.create({
      name: businessName,
      slug: cleanSlug,
      email: ownerEmail,
      brand_name: businessName,
      plan,
      status,
      trial_ends_at: trialEnds,
      max_branches: caps.max_branches,
      max_staff: caps.max_staff,
    }, { transaction: t });

    const branch = await Branch.create({
      name: branchName || businessName,
      phone: phone || null,
      status: 'active',
      tenant_id: tenant.id,
    }, { transaction: t });

    const username = String(ownerEmail).trim().toLowerCase();
    const existingUser = await User.findOne({ where: { username }, transaction: t });
    if (existingUser) {
      await t.rollback();
      return res.status(409).json({ message: 'Owner email is already used by another user.' });
    }
    const hash = await bcrypt.hash(String(password), 10);

    const owner = await User.create({
      username,
      password: hash,
      name: ownerName,
      role: 'superadmin',
      branch_id: branch.id,
      tenant_id: tenant.id,
      is_active: true,
    }, { transaction: t });

    await NotificationSettings.create({
      branch_id: branch.id,
      tenant_id: tenant.id,
    }, { transaction: t });

    // Auto-generate initial invoice for the tenant
    await autoGenerateInvoice(tenant.id, plan);

    await t.commit();
    invalidateTenantCache(tenant.slug);

    // ── Send welcome email with account details ───────────────────────────────
    const tenantUrl = buildTenantAppUrl(cleanSlug, req);
    const trialNote = trialEnds
      ? `Your <strong>${plan}</strong> trial is active until <strong>${new Date(trialEnds).toDateString()}</strong>.`
      : `Your account is on the <strong>${plan}</strong> plan.`;

    sendEmail({
      to:      ownerEmail,
      subject: `Welcome to Zane Salon — Your account is ready 🎉`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#F0F2F5;font-family:'Inter',Arial,sans-serif;}
  .wrap{max-width:560px;margin:40px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
  .header{background:linear-gradient(135deg,#4F46E5 0%,#6366F1 100%);padding:36px 32px;text-align:center;}
  .header h1{margin:0;font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;}
  .header p{margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);}
  .body{padding:32px;}
  .greeting{font-size:16px;font-weight:700;color:#0F172A;margin-bottom:8px;}
  .sub{font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px;}
  .card{background:#F8F9FC;border:1px solid #E5E7EB;border-radius:12px;padding:20px 22px;margin-bottom:20px;}
  .card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;margin-bottom:14px;}
  .row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #E5E7EB;}
  .row:last-child{border-bottom:none;}
  .label{font-size:12px;color:#64748B;font-weight:600;}
  .value{font-size:13px;color:#0F172A;font-weight:700;text-align:right;word-break:break-all;max-width:60%;}
  .value.mono{font-family:monospace;background:#EEF2FF;color:#4338CA;padding:2px 7px;border-radius:5px;font-size:12px;}
  .btn{display:block;text-align:center;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;margin:24px 0 0;box-shadow:0 2px 8px rgba(99,102,241,0.35);}
  .notice{background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#92400E;line-height:1.5;margin-top:20px;}
  .footer{padding:18px 32px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #F1F5F9;}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>🎉 Welcome to Zane Salon</h1>
    <p>Your salon management account is ready</p>
  </div>
  <div class="body">
    <div class="greeting">Hi ${ownerName},</div>
    <div class="sub">Your account has been created by the platform admin. Below are your login credentials and account details. Please keep this email safe.</div>

    <div class="card">
      <div class="card-title">Login Credentials</div>
      <div class="row"><span class="label">Login URL</span><span class="value"><a href="${tenantUrl}" style="color:#4F46E5;">${tenantUrl}</a></span></div>
      <div class="row"><span class="label">Email / Username</span><span class="value mono">${ownerEmail}</span></div>
      <div class="row"><span class="label">Password</span><span class="value mono">${password}</span></div>
    </div>

    <div class="card">
      <div class="card-title">Account Details</div>
      <div class="row"><span class="label">Business Name</span><span class="value">${businessName}</span></div>
      <div class="row"><span class="label">Branch</span><span class="value">${branchName || businessName}</span></div>
      <div class="row"><span class="label">Plan</span><span class="value" style="text-transform:capitalize;">${plan}</span></div>
      ${trialEnds ? `<div class="row"><span class="label">Trial Ends</span><span class="value">${new Date(trialEnds).toDateString()}</span></div>` : ''}
      <div class="row"><span class="label">Subdomain</span><span class="value mono">${cleanSlug}</span></div>
    </div>

    <a href="${tenantUrl}" class="btn">Go to My Dashboard →</a>

    <div class="notice">⚠️ For security, please change your password after your first login under <strong>Settings → Profile</strong>.</div>
  </div>
  <div class="footer">Zane Salon Platform · This email was sent to ${ownerEmail}</div>
</div>
</body></html>`,
      meta: { event_type: 'tenant_welcome', channel: 'email' },
    }).catch(err => console.error('tenant welcome email failed:', err.message));

    return res.status(201).json({
      tenant_url: buildTenantAppUrl(tenant.slug, req),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        email: tenant.email,
        brand_name: tenant.brand_name,
        plan: tenant.plan,
        status: tenant.status,
        trial_ends_at: tenant.trial_ends_at,
      },
      branch: {
        id: branch.id,
        name: branch.name,
      },
      owner: {
        id: owner.id,
        name: owner.name,
        username: owner.username,
        role: owner.role,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('platform.createTenant error:', err);
    return res.status(500).json({ message: 'Failed to create tenant.' });
  }
};

// ── GET /api/platform/tenants/:id ─────────────────────────────────────────────
const getTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id, {
      include: [
        { model: Subscription, as: 'subscriptions', separate: true, order: [['createdAt', 'DESC']], limit: 10 },
      ],
    });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const [branchCount, staffCount, customerCount] = await Promise.all([
      Branch.count({ where: { tenant_id: tenant.id } }),
      Staff.count({  where: { tenant_id: tenant.id, is_active: true } }),
      Customer.count({ where: { tenant_id: tenant.id } }),
    ]);

    return res.json({
      ...tenant.toJSON(),
      stats: { branches: branchCount, staff: staffCount, customers: customerCount },
    });
  } catch (err) {
    console.error('platform.getTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/tenants/:id ──────────────────────────────────────────
const updateTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const allowed = ['status', 'plan', 'trial_ends_at', 'max_branches', 'max_staff', 'name', 'email', 'payment_gateway', 'back_transfer_wage', 'helapay_merchant_id', 'helapay_app_id', 'helapay_app_secret', 'helapay_business_id', 'helapay_notify_url'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.plan) {
      const caps = getTenantCaps(updates.plan);
      // Keep explicit manual overrides if caller provided them.
      if (updates.max_branches === undefined) updates.max_branches = caps.max_branches;
      if (updates.max_staff === undefined) updates.max_staff = caps.max_staff;

      if (updates.plan === 'trial') {
        if (updates.trial_ends_at === undefined) {
          updates.trial_ends_at = addTrialDays();
        }
      } else if (updates.trial_ends_at === undefined) {
        updates.trial_ends_at = null;
      }
    }

    await tenant.update(updates);
    invalidateTenantCache(tenant.slug);
    return res.json(tenant);
  } catch (err) {
    console.error('platform.updateTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/tenants/:id ─────────────────────────────────────────
const deleteTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    // Soft-delete by suspending + marking cancelled
    await tenant.update({ status: 'cancelled' });
    invalidateTenantCache(tenant.slug);
    return res.json({ message: `Tenant ${tenant.slug} cancelled.` });
  } catch (err) {
    console.error('platform.deleteTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/tenants/:id/stats ──────────────────────────────────────
const tenantStats = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const [branchCount, staffCount, userCount, customerCount] = await Promise.all([
      Branch.count({ where: { tenant_id: tenant.id } }),
      Staff.count({  where: { tenant_id: tenant.id, is_active: true } }),
      User.count({   where: { tenant_id: tenant.id, is_active: true } }),
      Customer.count({ where: { tenant_id: tenant.id } }),
    ]);

    return res.json({ branches: branchCount, staff: staffCount, users: userCount, customers: customerCount });
  } catch (err) {
    console.error('platform.tenantStats error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/stats ───────────────────────────────────────────────────
const platformStats = async (req, res) => {
  try {
    const [totalTenants, activePaid, activeTrials, suspended] = await Promise.all([
      Tenant.count(),
      Tenant.count({ where: { status: 'active', plan: { [Op.ne]: 'trial' } } }),
      Tenant.count({ where: { plan: 'trial',  status: 'active' } }),
      Tenant.count({ where: { status: 'suspended' } }),
    ]);

    // Plan distribution
    const planRows = await Tenant.findAll({
      attributes: ['plan', [fn('COUNT', col('id')), 'cnt']],
      group: ['plan'], raw: true,
    });
    const byPlan = {};
    for (const r of planRows) byPlan[r.plan] = Number(r.cnt);

    // Status distribution
    const statusRows = await Tenant.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'cnt']],
      group: ['status'], raw: true,
    });
    const byStatus = {};
    for (const r of statusRows) byStatus[r.status] = Number(r.cnt);

    // Rough MRR estimate (basic=$29, pro=$79, enterprise=$299 — adjust as needed)
    const MRR_MAP = { basic: 29, pro: 79, enterprise: 299 };
    let estimatedMrr = 0;
    for (const [plan, price] of Object.entries(MRR_MAP)) {
      estimatedMrr += (byPlan[plan] || 0) * price;
    }

    // Recent sign-ups (last 10)
    const recentTenants = await Tenant.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
      attributes: ['id', 'name', 'slug', 'plan', 'status', 'createdAt', 'trial_ends_at'],
    });

    return res.json({
      totalTenants, activePaid, activeTrials, suspended,
      estimatedMrr, byPlan, byStatus,
      recentTenants,
    });
  } catch (err) {
    console.error('platform.platformStats error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/subscriptions ──────────────────────────────────────────
const listSubscriptions = async (req, res) => {
  try {
    const where = {};
    if (req.query.tenant_id) where.tenant_id = parseInt(req.query.tenant_id, 10);
    if (req.query.status) where.status = req.query.status;
    if (req.query.plan) where.plan = req.query.plan;

    const rows = await Subscription.findAll({
      where,
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'email'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json(rows);
  } catch (err) {
    console.error('platform.listSubscriptions error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/subscriptions ─────────────────────────────────────────
const createSubscription = async (req, res) => {
  try {
    const {
      tenant_id,
      stripe_subscription_id,
      stripe_price_id,
      plan,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      stripe_customer_id,
    } = req.body;

    if (!tenant_id || !stripe_subscription_id || !stripe_price_id || !plan || !status) {
      return res.status(400).json({ message: 'tenant_id, stripe_subscription_id, stripe_price_id, plan and status are required.' });
    }

    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const exists = await Subscription.findOne({ where: { stripe_subscription_id } });
    if (exists) return res.status(409).json({ message: 'stripe_subscription_id already exists.' });

    const sub = await Subscription.create({
      tenant_id,
      stripe_subscription_id,
      stripe_price_id,
      plan,
      status,
      current_period_start: current_period_start || null,
      current_period_end: current_period_end || null,
      cancel_at_period_end: !!cancel_at_period_end,
    });

    const caps = getTenantCaps(plan);
    await tenant.update({
      plan,
      status: tenantStatusFromSubscriptionStatus(status),
      stripe_subscription_id,
      stripe_customer_id: stripe_customer_id || tenant.stripe_customer_id,
      max_branches: caps.max_branches,
      max_staff: caps.max_staff,
      trial_ends_at: plan === 'trial' ? (tenant.trial_ends_at || addTrialDays()) : null,
    });
    invalidateTenantCache(tenant.slug);

    // Auto-generate invoice for this subscription
    await autoGenerateInvoice(tenant_id, plan);

    const full = await Subscription.findByPk(sub.id, {
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'email'] }],
    });
    return res.status(201).json(full);
  } catch (err) {
    console.error('platform.createSubscription error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/subscriptions/:id ───────────────────────────────────
const updateSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription not found.' });

    const allowed = [
      'stripe_subscription_id',
      'stripe_price_id',
      'plan',
      'status',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await sub.update(updates);

    const tenant = await Tenant.findByPk(sub.tenant_id);
    if (tenant) {
      const caps = getTenantCaps(sub.plan);
      await tenant.update({
        plan: sub.plan,
        status: tenantStatusFromSubscriptionStatus(sub.status),
        stripe_subscription_id: sub.stripe_subscription_id,
        max_branches: caps.max_branches,
        max_staff: caps.max_staff,
        trial_ends_at: sub.plan === 'trial' ? (tenant.trial_ends_at || addTrialDays()) : null,
      });
      invalidateTenantCache(tenant.slug);
    }

    const full = await Subscription.findByPk(sub.id, {
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'email'] }],
    });
    return res.json(full);
  } catch (err) {
    console.error('platform.updateSubscription error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/subscriptions/:id ──────────────────────────────────
const deleteSubscription = async (req, res) => {
  try {
    const sub = await Subscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription not found.' });

    const tenant = await Tenant.findByPk(sub.tenant_id);
    await sub.destroy();

    if (tenant && tenant.stripe_subscription_id === sub.stripe_subscription_id) {
      await tenant.update({ stripe_subscription_id: null });
      invalidateTenantCache(tenant.slug);
    }

    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('platform.deleteSubscription error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/admins ──────────────────────────────────────────────────
const listAdmins = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: { role: 'platform_admin' },
      attributes: ['id', 'name', 'username', 'createdAt', 'is_active'],
      order: [['createdAt', 'DESC']],
    });
    return res.json(admins);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/admins ─────────────────────────────────────────────────
const createAdmin = async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required.' });
    const exists = await User.findOne({ where: { username } });
    if (exists) return res.status(409).json({ message: 'Username already taken.' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name || 'Platform Admin',
      username,
      password: hash,
      role: 'platform_admin',
      tenant_id: null,
      is_active: true,
    });
    return res.status(201).json({ id: user.id, name: user.name, username: user.username, is_active: user.is_active });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/admins/:id ──────────────────────────────────────────
const deleteAdmin = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Cannot delete yourself.' });
    }
    const user = await User.findOne({ where: { id: req.params.id, role: 'platform_admin' } });
    if (!user) return res.status(404).json({ message: 'Admin not found.' });
    await user.destroy();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/system/maintenance ───────────────────────────────────
const getMaintenance = async (_req, res) => {
  try {
    const mode = await getMaintenanceMode({ force: true });
    return res.json(mode);
  } catch (err) {
    console.error('platform.getMaintenance error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getMaintenanceLogs = async (_req, res) => {
  try {
    const logs = await fetchMaintenanceLogsSafe(20);
    return res.json({ logs });
  } catch (err) {
    console.error('platform.getMaintenanceLogs error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/system/monitoring ─────────────────────────────────────
const getMonitoring = async (_req, res) => {
  try {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    const from24h = new Date(now - dayMs);
    const from7d = new Date(now - 7 * dayMs);

    const supportTicketOpenPromise = hasSupportTicketModel
      ? SupportTicket.count({ where: { status: { [Op.notIn]: ['resolved', 'closed'] } } })
      : Promise.resolve(0);

    const supportTicketUrgentPromise = hasSupportTicketModel
      ? SupportTicket.count({
          where: {
            status: { [Op.notIn]: ['resolved', 'closed'] },
            priority: { [Op.in]: ['high', 'urgent'] },
          },
        })
      : Promise.resolve(0);

    const supportTicketStalePromise = hasSupportTicketModel
      ? SupportTicket.count({
          where: {
            status: { [Op.notIn]: ['resolved', 'closed'] },
            last_activity_at: { [Op.lt]: new Date(now - dayMs) },
          },
        })
      : Promise.resolve(0);

    const supportTicketByPriorityPromise = hasSupportTicketModel
      ? SupportTicket.findAll({
          where: { status: { [Op.notIn]: ['resolved', 'closed'] } },
          attributes: ['priority', [fn('COUNT', col('id')), 'cnt']],
          group: ['priority'],
          raw: true,
        })
      : Promise.resolve([]);

    const supportTicketByStatusPromise = hasSupportTicketModel
      ? SupportTicket.findAll({
          where: { status: { [Op.notIn]: ['resolved', 'closed'] } },
          attributes: ['status', [fn('COUNT', col('id')), 'cnt']],
          group: ['status'],
          raw: true,
        })
      : Promise.resolve([]);

    const supportTicketRecentPromise = hasSupportTicketModel
      ? SupportTicket.findAll({
          where: { createdAt: { [Op.gte]: from7d } },
          attributes: ['id', 'createdAt'],
          order: [['createdAt', 'DESC']],
          limit: 2000,
        })
      : Promise.resolve([]);

    const notifications24hPromise = hasNotificationLogModel
      ? NotificationLog.findAll({
          where: { createdAt: { [Op.gte]: from24h } },
          attributes: ['id', 'status', 'channel', 'createdAt'],
          order: [['createdAt', 'DESC']],
          limit: 2500,
        })
      : Promise.resolve([]);

    const failedNotificationsPromise = hasNotificationLogModel
      ? NotificationLog.findAll({
          where: { status: 'failed' },
          order: [['createdAt', 'DESC']],
          limit: 10,
          attributes: ['id', 'channel', 'event_type', 'message_preview', 'error_message', 'createdAt'],
        })
      : Promise.resolve([]);

    const appointmentsTodayPromise = hasAppointmentModel
      ? Appointment.count({
          where: {
            date: new Date().toISOString().slice(0, 10),
            status: { [Op.not]: 'cancelled' },
          },
        })
      : Promise.resolve(0);

    const appointments24hPromise = hasAppointmentModel
      ? Appointment.count({ where: { createdAt: { [Op.gte]: from24h } } })
      : Promise.resolve(0);

    const appointmentsCancelled24hPromise = hasAppointmentModel
      ? Appointment.count({
          where: {
            createdAt: { [Op.gte]: from24h },
            status: 'cancelled',
          },
        })
      : Promise.resolve(0);

    const [
      dbPing,
      tenants,
      activeTenants,
      suspendedTenants,
      cancelledTenants,
      notifications24h,
      recentFailedNotifications,
      openTickets,
      urgentOpenTickets,
      staleOpenTickets,
      openByPriority,
      openByStatus,
      recentTickets,
      maintenance,
      recentMaintenance,
      appointmentsToday,
      appointments24h,
      appointmentsCancelled24h,
    ] = await Promise.all([
      sequelize.query('SELECT 1 AS ok'),
      Tenant.count(),
      Tenant.count({ where: { status: 'active' } }),
      Tenant.count({ where: { status: 'suspended' } }),
      Tenant.count({ where: { status: 'cancelled' } }),
      notifications24hPromise,
      failedNotificationsPromise,
      supportTicketOpenPromise,
      supportTicketUrgentPromise,
      supportTicketStalePromise,
      supportTicketByPriorityPromise,
      supportTicketByStatusPromise,
      supportTicketRecentPromise,
      getMaintenanceMode({ force: true }),
      fetchMaintenanceLogsSafe(10),
      appointmentsTodayPromise,
      appointments24hPromise,
      appointmentsCancelled24hPromise,
    ]);

    const dbHealthy = Array.isArray(dbPing) && dbPing.length > 0;
    const mem = process.memoryUsage();
    const loadAvg = typeof process.loadavg === 'function'
      ? process.loadavg()
      : [0, 0, 0];

    const failedNotifications24h = notifications24h.filter((n) => n.status === 'failed').length;
    const totalNotifications24h = notifications24h.length;
    const notificationFailureRate24h = totalNotifications24h > 0
      ? Number(((failedNotifications24h / totalNotifications24h) * 100).toFixed(1))
      : 0;

    const channels = ['email', 'whatsapp'];
    const notificationsByChannel24h = channels.map((channel) => {
      const rows = notifications24h.filter((n) => n.channel === channel);
      const failed = rows.filter((n) => n.status === 'failed').length;
      const total = rows.length;
      return {
        channel,
        total,
        failed,
        sent: Math.max(total - failed, 0),
        failureRate: total > 0 ? Number(((failed / total) * 100).toFixed(1)) : 0,
      };
    });

    const hourlyFailures = [];
    for (let i = 23; i >= 0; i--) {
      const bucket = new Date(now - i * hourMs);
      bucket.setMinutes(0, 0, 0);
      const key = bucket.toISOString().slice(0, 13);
      hourlyFailures.push({ hour: `${key}:00:00Z`, count: 0 });
    }
    const hourIndex = new Map(hourlyFailures.map((b) => [b.hour.slice(0, 13), b]));
    for (const row of notifications24h) {
      if (row.status !== 'failed') continue;
      const hourKey = new Date(row.createdAt).toISOString().slice(0, 13);
      const entry = hourIndex.get(hourKey);
      if (entry) entry.count += 1;
    }

    const dailyTickets = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * dayMs);
      const key = d.toISOString().slice(0, 10);
      dailyTickets.push({ date: key, count: 0 });
    }
    const dayIndex = new Map(dailyTickets.map((d) => [d.date, d]));
    for (const row of recentTickets) {
      const dayKey = new Date(row.createdAt).toISOString().slice(0, 10);
      const entry = dayIndex.get(dayKey);
      if (entry) entry.count += 1;
    }

    const ticketByPriority = {};
    for (const row of openByPriority) {
      ticketByPriority[row.priority] = Number(row.cnt || 0);
    }

    const ticketByStatus = {};
    for (const row of openByStatus) {
      ticketByStatus[row.status] = Number(row.cnt || 0);
    }

    const alerts = [];
    if (!dbHealthy) {
      alerts.push({ severity: 'critical', code: 'DB_DOWN', message: 'Database health check failed.' });
    }
    if (notificationFailureRate24h >= 20) {
      alerts.push({
        severity: 'high',
        code: 'NOTIFICATION_FAILURE_SPIKE',
        message: `Notification failure rate is ${notificationFailureRate24h}% in last 24h.`,
      });
    }
    if (urgentOpenTickets >= 5) {
      alerts.push({
        severity: 'high',
        code: 'URGENT_TICKET_BACKLOG',
        message: `${urgentOpenTickets} high/urgent tickets are still open.`,
      });
    }
    if (staleOpenTickets >= 10) {
      alerts.push({
        severity: 'medium',
        code: 'STALE_OPEN_TICKETS',
        message: `${staleOpenTickets} open tickets have no activity for 24h+.`,
      });
    }
    if (maintenance?.enabled) {
      alerts.push({
        severity: 'info',
        code: 'MAINTENANCE_ACTIVE',
        message: 'Maintenance mode is currently active.',
      });
    }

    const cancellationRate24h = appointments24h > 0
      ? Number(((appointmentsCancelled24h / appointments24h) * 100).toFixed(1))
      : 0;

    return res.json({
      generatedAt: new Date().toISOString(),
      server: {
        nodeEnv: process.env.NODE_ENV || 'development',
        uptimeSeconds: Math.floor(process.uptime()),
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        loadAverage: {
          min1: Number(loadAvg[0].toFixed(2)),
          min5: Number(loadAvg[1].toFixed(2)),
          min15: Number(loadAvg[2].toFixed(2)),
        },
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
        },
      },
      health: {
        api: true,
        db: dbHealthy,
        overall: dbHealthy ? 'healthy' : 'degraded',
      },
      counts: {
        tenants,
        activeTenants,
        suspendedTenants,
        cancelledTenants,
        openTickets,
        urgentOpenTickets,
        staleOpenTickets,
        failedNotifications24h,
        totalNotifications24h,
        notificationFailureRate24h,
        appointmentsToday,
        appointments24h,
        appointmentsCancelled24h,
        cancellationRate24h,
      },
      breakdowns: {
        notificationsByChannel24h,
        ticketByPriority,
        ticketByStatus,
      },
      trends: {
        failedNotificationsByHour24h: hourlyFailures,
        ticketsCreatedByDay7d: dailyTickets,
      },
      apiRealtime: getApiMonitoringSnapshot(),
      alerts,
      maintenance,
      recentFailedNotifications,
      recentMaintenance,
    });
  } catch (err) {
    console.error('platform.getMonitoring error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/system/maintenance ─────────────────────────────────
const updateMaintenance = async (req, res) => {
  try {
    const { enabled, message, durationMinutes } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean.' });
    }
    const current = await getMaintenanceMode({ force: true });
    let endsAt = null;
    if (enabled) {
      const duration = Math.max(1, Math.min(parseInt(durationMinutes, 10) || 60, 24 * 60));
      endsAt = new Date(Date.now() + duration * 60 * 1000).toISOString();
    }

    const updated = await setMaintenanceMode({ enabled, message, endsAt });

    if (hasMaintenanceLogModel && typeof MaintenanceLog.create === 'function') {
      await MaintenanceLog.create({
        enabled: updated.enabled,
        message: updated.message,
        ends_at: updated.endsAt || null,
        changed_by_user_id: req.user?.id || null,
      });
    } else {
      console.warn('platform.updateMaintenance: MaintenanceLog model missing; skipping log insert.');
    }

    return res.json(updated);
  } catch (err) {
    console.error('platform.updateMaintenance error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/system/broadcast-sms ────────────────────────────────
const broadcastSms = async (req, res) => {
  try {
    const tenantId = req.body?.tenant_id ? parseInt(req.body.tenant_id, 10) : null;
    const message = String(req.body?.message || '').trim();

    if (!message) {
      return res.status(400).json({ message: 'Message is required.' });
    }

    const isUnicode = /[^\u0000-\u007F]/.test(message);
    const maxLen = isUnicode ? 335 : 480;
    if ([...message].length > maxLen) {
      return res.status(400).json({
        message: isUnicode
          ? `Sinhala/Unicode message is too long (max ${maxLen} characters).`
          : `Message is too long (max ${maxLen} characters).`,
      });
    }

    const where = {
      phone: { [Op.ne]: null },
    };
    if (Number.isInteger(tenantId) && tenantId > 0) where.tenant_id = tenantId;

    const customers = await Customer.findAll({
      where,
      attributes: ['id', 'name', 'phone', 'branch_id', 'tenant_id'],
    });

    if (!customers.length) {
      return res.status(404).json({ message: 'No customers with phone numbers found.' });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const customer of customers) {
      const phone = String(customer.phone || '').trim();
      if (!phone) {
        skipped++;
        continue;
      }

      const result = await sendSMS({
        to: phone,
        message,
        meta: {
          customer_name: customer.name,
          event_type: 'test',
          branch_id: customer.branch_id || null,
          tenant_id: customer.tenant_id || null,
        },
      });

      if (!result) skipped++;
      else if (result.status === 'failed') failed++;
      else sent++;
    }

    return res.json({
      message: `Broadcast SMS complete. Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}.`,
      totals: {
        matchedCustomers: customers.length,
        sent,
        failed,
        skipped,
      },
    });
  } catch (err) {
    console.error('platform.broadcastSms error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/tenants/:id/impersonate ───────────────────────────────
// Issues a short-lived JWT for the tenant's superadmin so the platform admin
// can open a tab and be logged in as that tenant (read/write access).
const impersonateTenant = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    // Find the superadmin of this tenant
    const owner = await User.findOne({
      where: { tenant_id: tenant.id, role: 'superadmin', is_active: true },
      order: [['createdAt', 'ASC']],
    });

    if (!owner) {
      return res.status(404).json({ message: 'No active superadmin found for this tenant.' });
    }

    const payload = {
      id:           owner.id,
      username:     owner.username,
      role:         owner.role,
      branchId:     owner.branch_id,
      name:         owner.name,
      tenantId:     tenant.id,
      tenantSlug:   tenant.slug,
      impersonated: true,
      byAdmin:      req.user?.username || 'platform_admin',
    };

    // Short-lived token: 2 hours
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });

    return res.json({
      token,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user:   { id: owner.id, name: owner.name, username: owner.username },
    });
  } catch (err) {
    console.error('platform.impersonateTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/tenants/:id/quick-status ─────────────────────────────
// Quick toggle: active ↔ suspended, or cancel
const quickStatusTenant = async (req, res) => {
  try {
    const { action } = req.body; // 'activate' | 'suspend' | 'cancel'
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    let newStatus;
    if (action === 'activate')  newStatus = 'active';
    else if (action === 'suspend')  newStatus = 'suspended';
    else if (action === 'cancel')   newStatus = 'cancelled';
    else return res.status(400).json({ message: 'Invalid action. Use activate, suspend, or cancel.' });

    await tenant.update({ status: newStatus });
    invalidateTenantCache(tenant.slug);
    return res.json({ id: tenant.id, status: tenant.status, message: `Tenant ${newStatus}.` });
  } catch (err) {
    console.error('platform.quickStatusTenant error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Helper: Auto-generate invoice ─────────────────────────────────────────────
const autoGenerateInvoice = async (tenantId, plan, basePrice = null) => {
  try {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Billing period: start of current month to end of current month
    const periodStart = new Date(currentYear, currentMonth, 1);
    const periodEnd = new Date(currentYear, currentMonth + 1, 0);

    // Default pricing if not provided
    const pricing = {
      trial: 0,
      basic: 99.00,
      pro: 299.00,
      enterprise: 999.00,
    };

    const amount = basePrice ?? pricing[plan] ?? 99.00;
    const invoiceNumber = `INV-${tenantId}-${now.getTime()}`;

    const invoice = await PlatformInvoice.create({
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      amount,
      currency: 'USD',
      status: plan === 'trial' ? 'draft' : 'issued',
      issued_at: plan === 'trial' ? null : now,
      due_at: plan === 'trial' ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
      plan,
      base_price: amount,
      additional_charges: 0,
      discount: 0,
      notes: `Auto-generated invoice for ${plan} plan`,
    });

    return invoice;
  } catch (err) {
    console.error('autoGenerateInvoice error:', err);
    return null;
  }
};

// ── GET /api/platform/invoices ────────────────────────────────────────────────
const listInvoices = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = (page - 1) * limit;

    const where = {};
    
    // Handle paid/unpaid filter
    if (req.query.unpaid === 'true') {
      // Unpaid: draft, issued, overdue
      where.status = { [Op.in]: ['draft', 'issued', 'overdue'] };
    } else if (req.query.status === 'paid') {
      // Paid invoices
      where.status = 'paid';
    } else if (req.query.status) {
      // Other specific statuses
      where.status = req.query.status;
    }
    
    if (req.query.tenant_id) where.tenant_id = req.query.tenant_id;
    if (req.query.plan) where.plan = req.query.plan;

    const { count, rows } = await PlatformInvoice.findAndCountAll({
      where,
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'slug', 'email', 'plan'],
        },
      ],
      order: [['issued_at', 'DESC'], ['created_at', 'DESC']],
      limit,
      offset,
    });

    return res.json({ total: count, page, limit, invoices: rows });
  } catch (err) {
    console.error('platform.listInvoices error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/invoices ───────────────────────────────────────────────
const createInvoice = async (req, res) => {
  try {
    const {
      tenant_id,
      billing_period_start,
      billing_period_end,
      amount,
      currency = 'USD',
      plan,
      base_price,
      additional_charges = 0,
      discount = 0,
      notes,
    } = req.body || {};

    if (!tenant_id || !billing_period_start || !billing_period_end || !amount) {
      return res.status(400).json({ message: 'tenant_id, billing_period_start, billing_period_end, and amount are required.' });
    }

    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found.' });
    }

    const invoiceNumber = `INV-${Date.now()}`;

    const invoice = await PlatformInvoice.create({
      tenant_id,
      invoice_number: invoiceNumber,
      billing_period_start,
      billing_period_end,
      amount,
      currency,
      status: 'issued',
      issued_at: new Date(),
      due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      plan,
      base_price,
      additional_charges,
      discount,
      notes,
    });

    return res.status(201).json({ invoice });
  } catch (err) {
    console.error('platform.createInvoice error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/invoices/:id ────────────────────────────────────────────
const getInvoice = async (req, res) => {
  try {
    const invoice = await PlatformInvoice.findByPk(req.params.id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'slug', 'email', 'plan'],
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    return res.json({ invoice });
  } catch (err) {
    console.error('platform.getInvoice error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/invoices/:id ──────────────────────────────────────────
const updateInvoice = async (req, res) => {
  try {
    const invoice = await PlatformInvoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    const { status, paid_at, notes, additional_charges, discount } = req.body;

    if (status) invoice.status = status;
    if (paid_at !== undefined) invoice.paid_at = paid_at;
    if (notes !== undefined) invoice.notes = notes;
    if (additional_charges !== undefined) invoice.additional_charges = additional_charges;
    if (discount !== undefined) invoice.discount = discount;

    await invoice.save();

    return res.json({ invoice });
  } catch (err) {
    console.error('platform.updateInvoice error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/invoices/:id ────────────────────────────────────────
const deleteInvoice = async (req, res) => {
  try {
    const invoice = await PlatformInvoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    await invoice.destroy();

    return res.json({ message: 'Invoice deleted.' });
  } catch (err) {
    console.error('platform.deleteInvoice error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/invoices/:id/pdf ─────────────────────────────────────
const downloadInvoicePdf = async (req, res) => {
  try {
    const invoice = await PlatformInvoice.findByPk(req.params.id, {
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'email', 'plan'] }],
    });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

    const pdf = await generateInvoicePdfBuffer({ invoice, tenant: invoice.tenant });
    const fileName = `${invoice.invoice_number || `invoice-${invoice.id}`}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdf);
  } catch (err) {
    console.error('platform.downloadInvoicePdf error:', err);
    return res.status(500).json({ message: 'Failed to generate invoice PDF.' });
  }
};

// ── POST /api/platform/invoices/:id/email ───────────────────────────────────
const emailInvoice = async (req, res) => {
  try {
    const invoice = await PlatformInvoice.findByPk(req.params.id, {
      include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'email', 'plan'] }],
    });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });

    const to = req.body?.email || invoice.tenant?.email;
    if (!to) return res.status(400).json({ message: 'Recipient email is required.' });

    const pdf = await generateInvoicePdfBuffer({ invoice, tenant: invoice.tenant });
    await sendInvoiceEmail({ to, invoice, tenant: invoice.tenant, pdfBuffer: pdf });

    return res.json({ message: `Invoice emailed to ${to}.` });
  } catch (err) {
    console.error('platform.emailInvoice error:', err);
    return res.status(500).json({ message: err.message || 'Failed to send invoice email.' });
  }
};

// ── GET /api/platform/plans ─────────────────────────────────────────────────
const listPlans = async (req, res) => {
  try {
    await PlanConfig.sync();
    const plans = await PlanConfig.findAll({ order: [['sort_order', 'ASC'], ['id', 'ASC']] });
    // If no plans in DB yet, seed from planConfig.js defaults
    if (plans.length === 0) {
      const { PLAN_LIMITS } = require('../utils/planConfig');
      const defaults = [
        { key: 'trial',      label: 'Free Trial',  price_display: 'Free',        price_period: '',     tagline: '14-day free trial for new salons',    max_branches: 1,  max_staff: 5,  max_services: 20,  features: ['1 branch', '5 staff members', '20 services', 'Email notifications', 'Basic reports'], trial_days: 14, is_popular: false, is_active: true,  sort_order: 0 },
        { key: 'basic',      label: 'Basic',        price_display: 'LKR 2,900',   price_period: '/mo',  tagline: 'Perfect for single-location salons',   max_branches: 1,  max_staff: 10, max_services: 50,  features: ['1 branch', '10 staff members', '50 services', 'Email & WhatsApp notifications', 'Basic reports'], trial_days: 0, is_popular: false, is_active: true,  sort_order: 1 },
        { key: 'pro',        label: 'Pro',          price_display: 'LKR 7,900',   price_period: '/mo',  tagline: 'For growing multi-branch salons',       max_branches: 5,  max_staff: 50, max_services: 200, features: ['5 branches', '50 staff members', '200 services', 'AI Chat assistant', 'Advanced analytics & reports', 'Customer loyalty packages'], trial_days: 0, is_popular: true,  is_active: true,  sort_order: 2 },
        { key: 'enterprise', label: 'Enterprise',   price_display: 'Custom',      price_period: ' pricing', tagline: 'Tailored for large salon chains',   max_branches: -1, max_staff: -1, max_services: -1,  features: ['Unlimited branches', 'Unlimited staff', 'Unlimited services', 'Custom domain', 'API access', 'Priority support'], trial_days: 0, is_popular: false, is_active: true,  sort_order: 3 },
      ];
      await PlanConfig.bulkCreate(defaults, { ignoreDuplicates: true });
      return res.json(await PlanConfig.findAll({ order: [['sort_order', 'ASC'], ['id', 'ASC']] }));
    }
    return res.json(plans);
  } catch (err) {
    console.error('platform.listPlans error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/plans ─────────────────────────────────────────────────
const createPlan = async (req, res) => {
  try {
    const { key, label, price_display, price_period, tagline, max_branches, max_staff, max_services, features, trial_days, is_popular, is_active, sort_order, offer_active, offer_label, offer_price_display, offer_badge, offer_ends_at } = req.body;
    if (!key || !label) return res.status(400).json({ message: 'key and label are required.' });
    const existing = await PlanConfig.findOne({ where: { key } });
    if (existing) return res.status(409).json({ message: `Plan key '${key}' already exists.` });
    const plan = await PlanConfig.create({
      key: String(key).toLowerCase().trim(),
      label,
      price_display:  price_display  ?? null,
      price_period:   price_period   ?? null,
      tagline:        tagline        ?? null,
      max_branches:   Number(max_branches  ?? 1),
      max_staff:      Number(max_staff     ?? 5),
      max_services:   Number(max_services  ?? 20),
      features:       Array.isArray(features) ? features : [],
      trial_days:     Number(trial_days    ?? 0),
      is_popular:     Boolean(is_popular),
      is_active:      is_active !== undefined ? Boolean(is_active) : true,
      sort_order:     Number(sort_order    ?? 0),
      offer_active:        Boolean(offer_active),
      offer_label:         offer_label         ?? null,
      offer_price_display: offer_price_display ?? null,
      offer_badge:         offer_badge         ?? null,
      offer_ends_at:       offer_ends_at       ?? null,
    });
    // Log creation
    await PlanChangeLog.create({
      plan_config_id: plan.id,
      plan_key: plan.key,
      plan_label: plan.label,
      action: 'created',
      new_values: plan.toJSON(),
      full_snapshot: plan.toJSON(),
      changed_by: req.user?.email || req.user?.name || 'platform_admin',
    }).catch(() => {});
    return res.status(201).json(plan);
  } catch (err) {
    console.error('platform.createPlan error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PATCH /api/platform/plans/:id ─────────────────────────────────────────────
const updatePlan = async (req, res) => {
  try {
    const plan = await PlanConfig.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    const allowed = ['label', 'price_display', 'price_period', 'tagline', 'max_branches', 'max_staff', 'max_services', 'features', 'trial_days', 'is_popular', 'is_active', 'sort_order', 'offer_active', 'offer_label', 'offer_price_display', 'offer_badge', 'offer_ends_at'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.features !== undefined && !Array.isArray(updates.features)) {
      updates.features = [];
    }
    // Capture old values before update
    const oldSnap = plan.toJSON();
    const oldValues = {};
    const newValues = {};
    const changedFields = [];
    for (const field of Object.keys(updates)) {
      const oldVal = oldSnap[field];
      const newVal = updates[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields.push(field);
        oldValues[field] = oldVal;
        newValues[field] = newVal;
      }
    }
    await plan.update(updates);
    // Log update if anything actually changed
    if (changedFields.length > 0) {
      await PlanChangeLog.create({
        plan_config_id: plan.id,
        plan_key: plan.key,
        plan_label: plan.label,
        action: 'updated',
        changed_fields: changedFields,
        old_values: oldValues,
        new_values: newValues,
        full_snapshot: plan.toJSON(),
        changed_by: req.user?.email || req.user?.name || 'platform_admin',
      }).catch(() => {});
    }
    return res.json(plan);
  } catch (err) {
    console.error('platform.updatePlan error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/platform/plans/:id ───────────────────────────────────────────
const deletePlan = async (req, res) => {
  try {
    const plan = await PlanConfig.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    const snap = plan.toJSON();
    await plan.destroy();
    // Log deletion
    await PlanChangeLog.create({
      plan_config_id: snap.id,
      plan_key: snap.key,
      plan_label: snap.label,
      action: 'deleted',
      old_values: snap,
      full_snapshot: snap,
      changed_by: req.user?.email || req.user?.name || 'platform_admin',
    }).catch(() => {});
    return res.json({ message: 'Plan deleted.' });
  } catch (err) {
    console.error('platform.deletePlan error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/platform/plans/change-logs ──────────────────────────────────────
const listPlanChangeLogs = async (req, res) => {
  try {
    await PlanChangeLog.sync({ alter: true });
    const logs = await PlanChangeLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return res.json(logs);
  } catch (err) {
    console.error('platform.listPlanChangeLogs error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Platform SMTP / SMS helpers ───────────────────────────────────────────────
function maskSecret(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 4) return '****';
  return '••••••••' + s.slice(-4);
}

function buildSmtpSmsOut(row) {
  return {
    smtp_host:             row?.smtp_host             || process.env.EMAIL_HOST  || 'smtp.gmail.com',
    smtp_port:             row?.smtp_port             || parseInt(process.env.EMAIL_PORT) || 587,
    smtp_user:             row?.smtp_user             || process.env.EMAIL_USER  || '',
    smtp_from:             row?.smtp_from             || process.env.EMAIL_FROM  || '',
    smtp_pass:             maskSecret(row?.smtp_pass  || process.env.EMAIL_PASS  || ''),
    smtp_pass_set:         !!(row?.smtp_pass          || process.env.EMAIL_PASS),
    smtp_source:           row?.smtp_user && row?.smtp_pass ? 'db' : (process.env.EMAIL_USER ? 'env' : 'none'),
    sms_user_id:           row?.sms_user_id           || process.env.SMS_USER_ID   || '',
    sms_api_key:           maskSecret(row?.sms_api_key || process.env.SMS_API_KEY  || ''),
    sms_api_key_set:       !!(row?.sms_api_key         || process.env.SMS_API_KEY),
    sms_sender_id:         row?.sms_sender_id          || process.env.SMS_SENDER_ID || '',
    sms_source:            row?.sms_user_id && row?.sms_api_key ? 'db' : (process.env.SMS_USER_ID ? 'env' : 'none'),
    twilio_account_sid:    row?.twilio_account_sid    || process.env.TWILIO_ACCOUNT_SID    || '',
    twilio_auth_token:     maskSecret(row?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || ''),
    twilio_auth_token_set: !!(row?.twilio_auth_token  || process.env.TWILIO_AUTH_TOKEN),
    twilio_whatsapp_from:  row?.twilio_whatsapp_from  || process.env.TWILIO_WHATSAPP_FROM   || '',
    twilio_source:         row?.twilio_account_sid && row?.twilio_auth_token ? 'db' : (process.env.TWILIO_ACCOUNT_SID ? 'env' : 'none'),
  };
}

// ── GET /api/platform/system/smtp-sms ─────────────────────────────────────────
const getPlatformSmtpSms = async (req, res) => {
  try {
    const row = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: null } });
    return res.json(buildSmtpSmsOut(row));
  } catch (err) {
    console.error('getPlatformSmtpSms error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PUT /api/platform/system/smtp-sms ─────────────────────────────────────────
const updatePlatformSmtpSms = async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.smtp_host === 'string') update.smtp_host = req.body.smtp_host.trim() || null;
    if (req.body.smtp_port !== undefined)        update.smtp_port = parseInt(req.body.smtp_port) || null;
    if (typeof req.body.smtp_user === 'string')  update.smtp_user = req.body.smtp_user.trim() || null;
    if (typeof req.body.smtp_from === 'string')  update.smtp_from = req.body.smtp_from.trim() || null;
    if (typeof req.body.smtp_pass === 'string' && !req.body.smtp_pass.includes('•')) {
      update.smtp_pass = req.body.smtp_pass.trim() || null;
    }
    if (typeof req.body.sms_user_id   === 'string') update.sms_user_id   = req.body.sms_user_id.trim()   || null;
    if (typeof req.body.sms_sender_id === 'string') update.sms_sender_id = req.body.sms_sender_id.trim() || null;
    if (typeof req.body.sms_api_key   === 'string' && !req.body.sms_api_key.includes('•')) {
      update.sms_api_key = req.body.sms_api_key.trim() || null;
    }
    if (typeof req.body.twilio_account_sid   === 'string') update.twilio_account_sid   = req.body.twilio_account_sid.trim()   || null;
    if (typeof req.body.twilio_whatsapp_from === 'string') update.twilio_whatsapp_from = req.body.twilio_whatsapp_from.trim() || null;
    if (typeof req.body.twilio_auth_token    === 'string' && !req.body.twilio_auth_token.includes('•')) {
      update.twilio_auth_token = req.body.twilio_auth_token.trim() || null;
    }

    const [row, created] = await NotificationSettings.findOrCreate({
      where:    { branch_id: null, tenant_id: null },
      defaults: update,
    });
    if (!created) await row.update(update);

    const fresh = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: null } });
    return res.json({ ...buildSmtpSmsOut(fresh), message: 'Settings saved.' });
  } catch (err) {
    console.error('updatePlatformSmtpSms error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/platform/system/smtp-sms/test ───────────────────────────────────
const testPlatformSmtp = async (req, res) => {
  try {
    const nodemailer = require('nodemailer');
    const { to_email } = req.body;
    if (!to_email) return res.status(400).json({ message: 'to_email is required.' });

    const row  = await NotificationSettings.findOne({ where: { branch_id: null, tenant_id: null } });
    const host = row?.smtp_host || process.env.EMAIL_HOST || 'smtp.gmail.com';
    const port = parseInt(row?.smtp_port || process.env.EMAIL_PORT || 587);
    const user = row?.smtp_user || process.env.EMAIL_USER || '';
    const pass = row?.smtp_pass || process.env.EMAIL_PASS || '';
    const from = row?.smtp_from || process.env.EMAIL_FROM || user;

    if (!user || !pass) return res.status(400).json({ message: 'SMTP credentials not configured.' });

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({
      from,
      to:      to_email,
      subject: '[Platform] SMTP Test — System',
      html:    `<p>This is a test email from the platform admin panel at <b>${new Date().toISOString()}</b>.</p>`,
    });
    return res.json({ message: `Test email sent to ${to_email}.` });
  } catch (err) {
    console.error('testPlatformSmtp error:', err);
    return res.status(500).json({ message: err.message || 'SMTP test failed.' });
  }
};

module.exports = {
  listTenants,
  createTenant,
  getTenant,
  updateTenant,
  deleteTenant,
  tenantStats,
  impersonateTenant,
  quickStatusTenant,
  platformStats,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listAdmins,
  createAdmin,
  deleteAdmin,
  getMaintenance,
  getMaintenanceLogs,
  getMonitoring,
  updateMaintenance,
  broadcastSms,
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  emailInvoice,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listPlanChangeLogs,
  getPlatformSmtpSms,
  updatePlatformSmtpSms,
  testPlatformSmtp,
};