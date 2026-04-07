const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { Tenant, Branch, User, NotificationSettings } = require('../models');
const { sequelize } = require('../config/database');

const FORBIDDEN_SLUGS = new Set([
  'www', 'api', 'pma', 'main', 'app', 'admin', 'platform',
  'status', 'mail', 'smtp', 'ftp', 'vpn', 'dev', 'staging',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * POST /api/onboarding/register
 *
 * Creates a new tenant + branch + admin user in a single transaction.
 * On success, issues a JWT and sets the auth cookie so the user is
 * immediately logged in and can be redirected to their subdomain.
 *
 * Body: { businessName, slug, ownerEmail, ownerName, password, phone? }
 */
const register = async (req, res) => {
  const { businessName, slug, ownerEmail, ownerName, password, phone } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!businessName || !slug || !ownerEmail || !ownerName || !password) {
    return res.status(400).json({ message: 'businessName, slug, ownerEmail, ownerName, and password are required.' });
  }

  const cleanSlug = slug.toLowerCase().trim();

  if (!SLUG_RE.test(cleanSlug)) {
    return res.status(400).json({
      message: 'Slug must be 3–63 lowercase letters, numbers, or hyphens and cannot start/end with a hyphen.',
    });
  }

  if (FORBIDDEN_SLUGS.has(cleanSlug)) {
    return res.status(400).json({ message: `The slug "${cleanSlug}" is reserved. Please choose another.` });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const t = await sequelize.transaction();
  try {
    // Check slug uniqueness
    const existing = await Tenant.findOne({ where: { slug: cleanSlug }, transaction: t });
    if (existing) {
      await t.rollback();
      return res.status(409).json({ message: 'This business URL is already taken. Please choose another.' });
    }

    // ── Create Tenant ─────────────────────────────────────────────────────
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);

    const tenant = await Tenant.create({
      name:          businessName,
      slug:          cleanSlug,
      email:         ownerEmail,
      plan:          'trial',
      status:        'active',
      trial_ends_at: trialEnds,
      max_branches:  1,
      max_staff:     5,
    }, { transaction: t });

    // ── Create first Branch ───────────────────────────────────────────────
    const branch = await Branch.create({
      name:      businessName,
      phone:     phone || null,
      status:    'active',
      tenant_id: tenant.id,
    }, { transaction: t });

    // ── Create admin User ─────────────────────────────────────────────────
    const username      = ownerEmail.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'admin';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username:  `${username}_${tenant.id}`, // ensure uniqueness
      password:  hashedPassword,
      name:      ownerName,
      role:      'superadmin',
      branch_id: branch.id,
      tenant_id: tenant.id,
    }, { transaction: t });

    // ── Create default NotificationSettings ───────────────────────────────
    await NotificationSettings.create({
      branch_id: branch.id,
      tenant_id: tenant.id,
    }, { transaction: t });

    await t.commit();

    // ── Issue JWT ─────────────────────────────────────────────────────────
    const payload = {
      id:         user.id,
      username:   user.username,
      role:       user.role,
      branchId:   user.branch_id,
      name:       user.name,
      tenantId:   tenant.id,
      tenantSlug: tenant.slug,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'none', // cross-subdomain
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: 'Account created successfully!',
      tenant: {
        id:           tenant.id,
        slug:         tenant.slug,
        name:         tenant.name,
        plan:         tenant.plan,
        trial_ends_at: tenant.trial_ends_at,
      },
      user: {
        id:       user.id,
        name:     user.name,
        username: user.username,
        role:     user.role,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('onboarding.register error:', err);
    return res.status(500).json({ message: 'Failed to create account. Please try again.' });
  }
};

/**
 * GET /api/onboarding/check-slug?slug=abc
 *
 * Returns { available: true/false } — used for real-time slug availability check.
 */
const checkSlug = async (req, res) => {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ message: 'slug is required.' });

  const cleanSlug = slug.toLowerCase().trim();

  if (!SLUG_RE.test(cleanSlug) || FORBIDDEN_SLUGS.has(cleanSlug)) {
    return res.json({ available: false });
  }

  const existing = await Tenant.findOne({ where: { slug: cleanSlug } });
  return res.json({ available: !existing });
};

module.exports = { register, checkSlug };
