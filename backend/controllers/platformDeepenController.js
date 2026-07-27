/**
 * Wave 4 Salon platform deepen — analytics, notifications feed,
 * IAM revoke/reset, platform WhatsApp console.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op, fn, col, literal } = require('sequelize');
const {
  Tenant,
  Subscription,
  User,
  Payment,
  PlanConfig,
} = require('../models');
const { FeatureSuggestion } = require('../models/FeatureSuggestion');
const whatsappWeb = require('../services/whatsappWebService');

const OPS_CFG_PATH = path.join(__dirname, '../uploads/platform_ops.json');

function readOpsCfg() {
  try {
    if (fs.existsSync(OPS_CFG_PATH)) {
      return JSON.parse(fs.readFileSync(OPS_CFG_PATH, 'utf8'));
    }
  } catch (_) { /* ignore */ }
  return {};
}

function writeOpsCfg(patch) {
  const dir = path.dirname(OPS_CFG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next = { ...readOpsCfg(), ...patch };
  fs.writeFileSync(OPS_CFG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function parsePrice(display) {
  if (!display) return 0;
  const n = Number(String(display).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function planPriceMap() {
  const map = { trial: 0, basic: 2999, pro: 7999, enterprise: 14999 };
  try {
    const rows = await PlanConfig.findAll({ where: { is_active: true } });
    for (const r of rows) {
      map[r.key] = parsePrice(r.offer_active && r.offer_price_display
        ? r.offer_price_display
        : r.price_display);
    }
  } catch (_) { /* PlanConfig may be empty */ }
  return map;
}

async function ensureUserSessionsColumn() {
  // Sequelize alter:true on User model definition — call sync lightly
  await User.sync({ alter: true });
}

// ── Analytics ────────────────────────────────────────────────────────────────
const platformAnalytics = async (_req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
    const prices = await planPriceMap();

    const [
      gmvRow,
      invoiceCount,
      newTenantsThisMonth,
      activeTenantsCount,
      tenants,
      byPlanRows,
    ] = await Promise.all([
      Payment.findOne({
        attributes: [[fn('COALESCE', fn('SUM', col('total_amount')), 0), 'gmv']],
        where: { status: 'paid' },
        raw: true,
      }),
      Payment.count({ where: { status: 'paid' } }),
      Tenant.count({ where: { createdAt: { [Op.gte]: thirtyDaysAgo } } }),
      Tenant.count({ where: { status: { [Op.in]: ['active'] } } }),
      Tenant.findAll({
        attributes: ['id', 'name', 'plan', 'status', 'createdAt'],
        order: [['createdAt', 'DESC']],
      }),
      Tenant.findAll({
        attributes: ['plan', [fn('COUNT', col('id')), 'cnt']],
        group: ['plan'],
        raw: true,
      }),
    ]);

    const gmv30 = await Payment.findAll({
      attributes: [
        'tenant_id',
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'gmv'],
        [fn('COUNT', col('id')), 'invoices'],
      ],
      where: {
        status: 'paid',
        createdAt: { [Op.gte]: thirtyDaysAgo },
        tenant_id: { [Op.ne]: null },
      },
      group: ['tenant_id'],
      order: [[literal('gmv'), 'DESC']],
      limit: 10,
      raw: true,
    });

    const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));
    const topTenantsByRevenue = gmv30.map((r) => {
      const t = tenantMap[r.tenant_id];
      return {
        id: r.tenant_id,
        name: t?.name || `Tenant #${r.tenant_id}`,
        plan: t?.plan,
        status: t?.status,
        gmv30d: Number(r.gmv) || 0,
        invoices: Number(r.invoices) || 0,
        estimatedMrr: t?.status === 'active' ? (prices[t.plan] || 0) : 0,
      };
    });

    const gmvMonths = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const row = await Payment.findOne({
        attributes: [
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'gmv'],
          [fn('COUNT', col('id')), 'invoices'],
        ],
        where: {
          status: 'paid',
          createdAt: { [Op.gte]: start, [Op.lt]: end },
        },
        raw: true,
      });
      gmvMonths.push({
        month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        gmv: Number(row?.gmv) || 0,
        invoices: Number(row?.invoices) || 0,
      });
    }

    const from12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    let cumulative = await Tenant.count({ where: { createdAt: { [Op.lt]: from12 } } });
    const tenantMonths = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const cnt = await Tenant.count({
        where: { createdAt: { [Op.gte]: start, [Op.lt]: end } },
      });
      cumulative += cnt;
      tenantMonths.push({
        month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        newTenants: cnt,
        cumulative,
      });
    }

    const activePayTenantIds = await Payment.findAll({
      attributes: ['tenant_id'],
      where: {
        status: 'paid',
        createdAt: { [Op.gte]: sevenDaysAgo },
        tenant_id: { [Op.ne]: null },
      },
      group: ['tenant_id'],
      raw: true,
    });
    const activeSet = new Set(activePayTenantIds.map((r) => r.tenant_id));
    const inactiveTenants = tenants
      .filter((t) => t.status === 'active' && !activeSet.has(t.id))
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        name: t.name,
        plan: t.plan,
        status: t.status,
        createdAt: t.createdAt,
      }));

    return res.json({
      totalGMV: Number(gmvRow?.gmv) || 0,
      totalInvoices: invoiceCount,
      newTenantsThisMonth,
      activeTenantsCount,
      tenantsByPlan: byPlanRows.map((r) => ({
        plan: r.plan,
        count: Number(r.cnt) || 0,
        estimatedMrr: (prices[r.plan] || 0) * (Number(r.cnt) || 0),
      })),
      topTenantsByRevenue,
      gmvMonths,
      tenantMonths,
      inactiveTenants,
    });
  } catch (err) {
    console.error('deepen.platformAnalytics', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const mrrChart = async (_req, res) => {
  try {
    const prices = await planPriceMap();
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const labelDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const tenants = await Tenant.findAll({
        where: {
          createdAt: { [Op.lt]: end },
          status: 'active',
          plan: { [Op.ne]: 'trial' },
        },
        attributes: ['plan'],
      });
      let mrr = 0;
      for (const t of tenants) mrr += prices[t.plan] || 0;
      months.push({
        month: labelDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        mrr,
      });
    }
    return res.json(months);
  } catch (err) {
    console.error('deepen.mrrChart', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Notifications feed ───────────────────────────────────────────────────────
const platformNotifications = async (_req, res) => {
  try {
    const now = new Date();
    const in3d = new Date(now.getTime() + 3 * 86400_000);
    const in7d = new Date(now.getTime() + 7 * 86400_000);
    const ago30d = new Date(now.getTime() - 30 * 86400_000);
    const ago24h = new Date(now.getTime() - 86400_000);

    const [expiringTrials, expiringSubs, suspended, newTenants, suggestions] = await Promise.all([
      Tenant.findAll({
        where: {
          plan: 'trial',
          status: 'active',
          trial_ends_at: { [Op.lte]: in3d, [Op.gte]: now },
        },
        attributes: ['id', 'name', 'plan', 'trial_ends_at'],
      }),
      Subscription.findAll({
        where: {
          status: { [Op.in]: ['active', 'trialing', 'past_due'] },
          current_period_end: { [Op.lte]: in7d, [Op.gte]: now },
        },
        attributes: ['id', 'tenant_id', 'plan', 'current_period_end', 'status'],
      }),
      Tenant.findAll({
        where: { status: 'suspended', updatedAt: { [Op.gte]: ago30d } },
        attributes: ['id', 'name', 'plan', 'updatedAt'],
        order: [['updatedAt', 'DESC']],
        limit: 20,
      }),
      Tenant.findAll({
        where: { createdAt: { [Op.gte]: ago24h } },
        attributes: ['id', 'name', 'plan', 'email', 'createdAt'],
        order: [['createdAt', 'DESC']],
      }),
      FeatureSuggestion.findAll({
        where: { status: 'NEW', createdAt: { [Op.gte]: ago30d } },
        order: [['createdAt', 'DESC']],
        limit: 40,
      }).catch(() => []),
    ]);

    const items = [];

    for (const t of expiringTrials) {
      const days = Math.round((new Date(t.trial_ends_at).getTime() - now.getTime()) / 86400_000);
      items.push({
        id: `trial-exp-${t.id}`,
        type: 'TRIAL_EXPIRING',
        title: `Trial expiring in ${days}d`,
        message: `${t.name} trial ends soon`,
        severity: days <= 1 ? 'ERROR' : 'WARN',
        createdAt: now.toISOString(),
        tenantId: t.id,
      });
    }

    const subTenantIds = [...new Set(expiringSubs.map((s) => s.tenant_id))];
    const subTenants = subTenantIds.length
      ? await Tenant.findAll({
          where: { id: subTenantIds },
          attributes: ['id', 'name'],
        })
      : [];
    const subTenantMap = Object.fromEntries(subTenants.map((t) => [t.id, t]));
    for (const s of expiringSubs) {
      const days = Math.round(
        (new Date(s.current_period_end).getTime() - now.getTime()) / 86400_000,
      );
      const name = subTenantMap[s.tenant_id]?.name || `Tenant #${s.tenant_id}`;
      items.push({
        id: `sub-exp-${s.id}`,
        type: 'SUBSCRIPTION_EXPIRING',
        title: `Subscription expiring in ${days}d`,
        message: `${name} (${s.plan}) period ends soon`,
        severity: days <= 2 ? 'ERROR' : 'WARN',
        createdAt: now.toISOString(),
        tenantId: s.tenant_id,
      });
    }

    for (const t of suspended) {
      items.push({
        id: `suspended-${t.id}`,
        type: 'TENANT_SUSPENDED',
        title: 'Tenant suspended',
        message: `${t.name} (${t.plan}) was suspended.`,
        severity: 'ERROR',
        createdAt: t.updatedAt.toISOString(),
        tenantId: t.id,
      });
    }

    for (const t of newTenants) {
      items.push({
        id: `new-tenant-${t.id}`,
        type: 'NEW_TENANT',
        title: 'New tenant signup',
        message: `${t.name} registered on ${t.plan}${t.email ? ` · ${t.email}` : ''}`,
        severity: 'INFO',
        createdAt: t.createdAt.toISOString(),
        tenantId: t.id,
      });
    }

    for (const s of suggestions) {
      items.push({
        id: `suggestion-${s.id}`,
        type: 'FEATURE_SUGGESTION',
        title: `New feature suggestion · ${s.category}`,
        message: s.title,
        severity: 'INFO',
        createdAt: s.createdAt.toISOString(),
        tenantId: s.tenant_id,
      });
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ data: items, total: items.length });
  } catch (err) {
    console.error('deepen.platformNotifications', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── IAM ──────────────────────────────────────────────────────────────────────
const revokeTenantSessions = async (req, res) => {
  try {
    await ensureUserSessionsColumn();
    const tenant = await Tenant.findByPk(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const [count] = await User.update(
      { sessions_revoked_at: new Date() },
      { where: { tenant_id: tenant.id } },
    );
    return res.json({
      tenantId: tenant.id,
      revokedUsers: count,
      message: 'All tenant user sessions marked revoked. Tokens issued before now are rejected.',
    });
  } catch (err) {
    console.error('deepen.revokeTenantSessions', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    await ensureUserSessionsColumn();
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const tempPassword =
      (req.body && req.body.password) ||
      `Hx${crypto.randomBytes(4).toString('hex')}!`;
    const hash = await bcrypt.hash(tempPassword, 10);
    await user.update({
      password: hash,
      must_change_password: true,
      sessions_revoked_at: new Date(),
      password_reset_token: null,
      password_reset_expires: null,
    });

    return res.json({
      ok: true,
      userId: user.id,
      username: user.username,
      tempPassword: req.body?.password ? undefined : tempPassword,
      must_change_password: true,
      message: req.body?.password
        ? 'Password updated. User must change password on next login.'
        : 'Temporary password generated. Share securely with the user.',
    });
  } catch (err) {
    console.error('deepen.resetUserPassword', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const resetAdminPassword = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, role: 'platform_admin' },
    });
    if (!user) return res.status(404).json({ message: 'Admin not found.' });
    req.params.id = String(user.id);
    return resetUserPassword(req, res);
  } catch (err) {
    console.error('deepen.resetAdminPassword', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const enrichUpdateAdmin = async (req, res) => {
  try {
    await ensureUserSessionsColumn();
    const user = await User.findOne({
      where: { id: req.params.id, role: 'platform_admin' },
    });
    if (!user) return res.status(404).json({ message: 'Admin not found.' });

    const update = {};
    if (typeof req.body.email === 'string') update.email = req.body.email.trim() || null;
    if (typeof req.body.name === 'string') update.name = req.body.name.trim() || user.name;
    if (typeof req.body.is_active === 'boolean') update.is_active = req.body.is_active;
    if (typeof req.body.must_change_password === 'boolean') {
      update.must_change_password = req.body.must_change_password;
    }
    if (typeof req.body.password === 'string' && req.body.password.length >= 8) {
      update.password = await bcrypt.hash(req.body.password, 10);
      update.must_change_password = true;
      update.sessions_revoked_at = new Date();
    }
    if (Object.keys(update).length) await user.update(update);

    return res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      is_active: user.is_active,
      must_change_password: user.must_change_password,
    });
  } catch (err) {
    console.error('deepen.enrichUpdateAdmin', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Platform WhatsApp ────────────────────────────────────────────────────────
async function resolvePlatformWaTenantId() {
  const fromEnv = process.env.PLATFORM_WHATSAPP_TENANT_ID?.trim();
  if (fromEnv) {
    const t = await Tenant.findByPk(fromEnv);
    if (t) return t.id;
  }
  const cfg = readOpsCfg();
  if (cfg.platformWhatsAppTenantId) {
    const t = await Tenant.findByPk(cfg.platformWhatsAppTenantId);
    if (t) return t.id;
  }
  // Fall back to oldest active tenant (ops should pin explicitly)
  const first = await Tenant.findOne({
    where: { status: 'active' },
    order: [['id', 'ASC']],
  });
  if (!first) throw new Error('No tenant available for platform WhatsApp session');
  return first.id;
}

const platformWaStatus = async (_req, res) => {
  try {
    const tenantId = await resolvePlatformWaTenantId();
    const status = await whatsappWeb.getStatus(tenantId);
    return res.json({ tenantId, ...status });
  } catch (err) {
    console.error('deepen.platformWaStatus', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const platformWaConnect = async (req, res) => {
  try {
    const tenantId = await resolvePlatformWaTenantId();
    await whatsappWeb.startSession(tenantId, {
      by: req.user?.username || 'platform_admin',
    });
    const status = await whatsappWeb.getStatus(tenantId);
    return res.json({ tenantId, ...status });
  } catch (err) {
    console.error('deepen.platformWaConnect', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const platformWaDisconnect = async (req, res) => {
  try {
    const tenantId = await resolvePlatformWaTenantId();
    await whatsappWeb.stopSession(tenantId, true, {
      by: req.user?.username || 'platform_admin',
    });
    const status = await whatsappWeb.getStatus(tenantId);
    return res.json({ tenantId, ...status });
  } catch (err) {
    console.error('deepen.platformWaDisconnect', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const platformWaTestMessage = async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    if (!phone) return res.status(400).json({ message: 'phone is required.' });
    const tenantId = await resolvePlatformWaTenantId();
    const message =
      String(req.body?.message || '').trim() ||
      `HexaOne Salon platform WhatsApp test · ${new Date().toISOString()}`;
    const result = await whatsappWeb.sendViaQr(tenantId, phone, message, {
      event_type: 'platform_test',
    });
    return res.json({ tenantId, ...result });
  } catch (err) {
    console.error('deepen.platformWaTestMessage', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const platformWaSendOnboard = async (req, res) => {
  try {
    const { phone, businessName, slug, ownerEmail, tempPassword } = req.body || {};
    if (!phone?.trim() || !businessName?.trim() || !slug?.trim()) {
      return res.status(400).json({ message: 'phone, businessName, slug are required.' });
    }
    const tenantId = await resolvePlatformWaTenantId();
    const lines = [
      `Welcome to HexaOne Salon, ${businessName}!`,
      ``,
      `Your salon is ready:`,
      `• Slug: ${slug}`,
      ownerEmail ? `• Login: ${ownerEmail}` : null,
      tempPassword ? `• Temp password: ${tempPassword}` : null,
      `• URL: https://${slug}.salon.hexalyte.com`,
      ``,
      `Please change your password after first login.`,
    ].filter(Boolean);
    const result = await whatsappWeb.sendViaQr(tenantId, String(phone).trim(), lines.join('\n'), {
      event_type: 'platform_onboard',
    });
    return res.json({ tenantId, ...result });
  } catch (err) {
    console.error('deepen.platformWaSendOnboard', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const setPlatformWaTenant = async (req, res) => {
  try {
    const tenantId = Number(req.body?.tenantId || req.body?.tenant_id);
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required.' });
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    writeOpsCfg({ platformWhatsAppTenantId: tenant.id });
    return res.json({ platformWhatsAppTenantId: tenant.id, slug: tenant.slug, name: tenant.name });
  } catch (err) {
    console.error('deepen.setPlatformWaTenant', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  platformAnalytics,
  mrrChart,
  platformNotifications,
  revokeTenantSessions,
  resetUserPassword,
  resetAdminPassword,
  enrichUpdateAdmin,
  platformWaStatus,
  platformWaConnect,
  platformWaDisconnect,
  platformWaTestMessage,
  platformWaSendOnboard,
  setPlatformWaTenant,
};
