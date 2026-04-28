const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { Op }  = require('sequelize');
const speakeasy = require('speakeasy');
const qrcode    = require('qrcode');
const { User, Branch, Tenant, RevokedToken, Staff } = require('../models');
const { getMaintenanceMode } = require('../services/systemSettings');

const isLocalRequest = (req) => {
  const host = String(req.get('host') || '').toLowerCase();
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
};

const getCookieOptions = (req) => {
  const host = String(req.get('host') || '').toLowerCase();
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const isSecureRequest = req.secure || forwardedProto === 'https';

  return {
    httpOnly: true,
    secure:   isSecureRequest && !isLocalhost,
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  };
};

// ─── POST /api/auth/register ─────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, password, name, role, branch_id, color } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Username, password, and name are required.' });
    }

    // Scope username uniqueness to this tenant
    const tenantId = req.tenant?.id ?? req.user?.tenantId ?? null;
    const existing = await User.findOne({ where: { username, tenant_id: tenantId } });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Only allow valid roles; prevent privilege escalation
    const ALLOWED_ROLES = ['staff', 'manager', 'admin'];
    // Only superadmin can create other superadmins
    if (role === 'superadmin' && req.user?.role !== 'superadmin' && req.user?.role !== 'platform_admin') {
      return res.status(403).json({ message: 'Only superadmins can create superadmin accounts.' });
    }
    const assignedRole = ALLOWED_ROLES.includes(role) || role === 'superadmin' ? role : 'staff';

    const user = await User.create({
      username,
      password:  hashedPassword,
      name,
      role:      assignedRole,
      branch_id: branch_id || null,
      color:     color || '#6366f1',
      tenant_id: tenantId,
    });

    const payload = {
      id:         user.id,
      username:   user.username,
      role:       user.role,
      branchId:   user.branch_id,
      name:       user.name,
      tenantId:   user.tenant_id,
      tenantSlug: req.tenant?.slug ?? null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, getCookieOptions(req));

    return res.status(201).json({
      user: {
        id:       user.id,
        name:     user.name,
        username: user.username,
        role:     user.role,
        branchId: user.branch_id,
        avatar:   user.avatar,
        color:    user.color,
        tenantId: user.tenant_id,
      },
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/login ────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const maintenance = await getMaintenanceMode();
    if (maintenance.enabled) {
      return res.status(503).json({
        message: maintenance.message,
        code: 'MAINTENANCE_MODE',
        maintenance,
      });
    }

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const whereClause = { username, is_active: true };

    if (req.tenant) {
      // Normal tenant login — scope to this tenant
      whereClause.tenant_id = req.tenant.id;
    } else if (!isLocalRequest(req) && process.env.NODE_ENV === 'production') {
      // In production without tenant context, only platform admins can log in.
      whereClause.role = 'platform_admin';
    }

    const user = await User.findOne({
      where:   whereClause,
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name', 'brand_name', 'logo_sidebar_url', 'logo_header_url', 'logo_login_url', 'logo_public_url', 'primary_color', 'sidebar_style', 'font_family', 'plan', 'status', 'trial_ends_at'] },
      ],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    /* ── 2FA gate ─────────────────────────────────────────────────────── */
    if (user.totp_enabled && user.totp_secret) {
      // Issue a short-lived "pre-auth" token (5 min) — no session cookie yet
      const tempToken = jwt.sign(
        { pre2fa: true, userId: user.id, tenantId: user.tenant_id },
        process.env.JWT_SECRET,
        { expiresIn: '5m' },
      );
      return res.json({ requires2fa: true, tempToken });
    }

    const payload = {
      id:         user.id,
      username:   user.username,
      role:       user.role,
      branchId:   user.branch_id,
      name:       user.name,
      tenantId:   user.tenant_id,
      tenantSlug: user.tenant?.slug ?? null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, getCookieOptions(req));

    return res.json({
      user: {
        id:       user.id,
        name:     user.name,
        username: user.username,
        role:     user.role,
        branchId: user.branch_id,
        avatar:   user.avatar,
        color:    user.color,
        branch:               user.branch,
        tenant:               user.tenant,
        tenantId:             user.tenant_id,
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
const logout = async (req, res) => {
  const rawToken =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null);

  if (rawToken) {
    try {
      const decoded = jwt.decode(rawToken);
      if (decoded?.exp) {
        const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
        await RevokedToken.upsert({
          token_hash: hash,
          expires_at: new Date(decoded.exp * 1000),
        });
      }
    } catch (_) { /* non-fatal */ }
  }

  const opts = getCookieOptions(req);
  res.clearCookie('token', {
    httpOnly: true,
    secure:   opts.secure,
    sameSite: opts.sameSite,
    path:     opts.path,
  });
  return res.json({ message: 'Logged out.' });
};

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name', 'brand_name', 'logo_sidebar_url', 'logo_header_url', 'logo_login_url', 'logo_public_url', 'primary_color', 'sidebar_style', 'font_family', 'plan', 'status', 'trial_ends_at'] },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/2fa/verify-login ─────────────────────────────────────────
// Second step of login when 2FA is enabled. Consumes the temp token returned
// by /api/auth/login and validates the user's TOTP code, then issues the
// real session cookie.
const verifyLogin2FA = async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ message: 'tempToken and code are required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
    }

    if (!decoded.pre2fa) {
      return res.status(401).json({ message: 'Invalid token type.' });
    }

    const user = await User.findOne({
      where: { id: decoded.userId, is_active: true },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name', 'brand_name', 'logo_sidebar_url', 'logo_header_url', 'logo_login_url', 'logo_public_url', 'primary_color', 'sidebar_style', 'font_family', 'plan', 'status', 'trial_ends_at'] },
      ],
    });

    if (!user || !user.totp_secret) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: String(code).replace(/\s/g, ''),
      window: 1,
    });

    if (!valid) {
      return res.status(401).json({ message: 'Invalid authenticator code.' });
    }

    const payload = {
      id:         user.id,
      username:   user.username,
      role:       user.role,
      branchId:   user.branch_id,
      name:       user.name,
      tenantId:   user.tenant_id,
      tenantSlug: user.tenant?.slug ?? null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, getCookieOptions(req));

    return res.json({
      user: {
        id:       user.id,
        name:     user.name,
        username: user.username,
        role:     user.role,
        branchId: user.branch_id,
        avatar:   user.avatar,
        color:    user.color,
        branch:               user.branch,
        tenant:               user.tenant,
        tenantId:             user.tenant_id,
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (err) {
    console.error('verifyLogin2FA error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/2fa/setup ─────────────────────────────────────────────────
// Generates a TOTP secret for the logged-in user and returns a QR code data URL.
// The secret is NOT saved to DB yet — user must call /enable to confirm.
const setup2FA = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `SalonSuite (${req.user.username})`,
      length: 20,
    });

    // Store secret temporarily in DB (not yet "enabled")
    await User.update(
      { totp_secret: secret.base32, totp_enabled: false },
      { where: { id: req.user.id } },
    );

    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    return res.json({
      secret: secret.base32,
      qr: qrDataUrl,
    });
  } catch (err) {
    console.error('setup2FA error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/2fa/enable ────────────────────────────────────────────────
// Verifies the TOTP code and marks 2FA as enabled for the logged-in user.
const enable2FA = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'code is required.' });

    const user = await User.findByPk(req.user.id);
    if (!user || !user.totp_secret) {
      return res.status(400).json({ message: 'Please call /setup first.' });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: String(code).replace(/\s/g, ''),
      window: 1,
    });

    if (!valid) {
      return res.status(401).json({ message: 'Invalid code. Please try again.' });
    }

    await user.update({ totp_enabled: true });

    return res.json({ message: '2FA enabled successfully.' });
  } catch (err) {
    console.error('enable2FA error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/2fa/disable ───────────────────────────────────────────────
// Verifies the TOTP code and disables 2FA, clearing the secret.
const disable2FA = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'code is required.' });

    const user = await User.findByPk(req.user.id);
    if (!user || !user.totp_enabled) {
      return res.status(400).json({ message: '2FA is not enabled.' });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: String(code).replace(/\s/g, ''),
      window: 1,
    });

    if (!valid) {
      return res.status(401).json({ message: 'Invalid code.' });
    }

    await user.update({ totp_secret: null, totp_enabled: false });

    return res.json({ message: '2FA disabled.' });
  } catch (err) {
    console.error('disable2FA error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── GET /api/auth/2fa/status ─────────────────────────────────────────────────
const status2FA = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['totp_enabled'] });
    return res.json({ enabled: !!user?.totp_enabled });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/change-password ─────────────────────────────────────────
const changeOwnPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one.' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password: hash, must_change_password: false });
    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('changeOwnPassword error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: 'Username is required.' });
    const tenantId = req.tenant?.id ?? null;
    const whereClause = { username };
    if (tenantId) whereClause.tenant_id = tenantId;
    const user = await User.findOne({ where: whereClause });
    if (user) {
      const staffRecord = await Staff.findOne({ where: { user_id: user.id } }).catch(() => null);
      const phone = staffRecord?.phone;

      if (user.email || phone) {
        const token   = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await user.update({ password_reset_token: token, password_reset_expires: expires });
        const origin   = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost';
        const resetUrl = `${origin}/reset-password/${token}`;
        const { sendEmail, sendSMS } = require('../services/notificationService');

        // Send email (via Platform Admin SMTP)
        if (user.email) {
          await sendEmail({
            to:      user.email,
            subject: 'Password Reset Request',
            html:    `<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;color:#111827;padding:24px"><h2 style="color:#2563EB;margin-top:0">Password Reset</h2><p>Hi <strong>${user.name}</strong>,</p><p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p><p style="text-align:center;margin:32px 0"><a href="${resetUrl}" style="background:#2563EB;color:#fff;padding:13px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Reset Password</a></p><p style="font-size:12px;color:#6B7280">If you did not request this, ignore this email.</p></div>`,
          }).catch(e => console.warn('[forgotPassword] email failed:', e.message));
        }

        // Send SMS via Platform Admin Notify.lk credentials
        if (phone) {
          await sendSMS({
            to:      phone,
            message: `Password reset for ${user.name}. Reset link (valid 1hr): ${resetUrl}`,
            meta:    { customer_name: user.name, event_type: 'password_reset' },
          }).catch(e => console.warn('[forgotPassword] SMS failed:', e.message));
        }
      }
    }
    return res.json({ message: 'If an account with that username and an email on file was found, a reset link has been sent.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/reset-password/:token ────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token }       = req.params;
    const { newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required.' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    const user = await User.findOne({
      where: { password_reset_token: token, password_reset_expires: { [Op.gt]: new Date() } },
    });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link. Please request a new one.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password: hash, password_reset_token: null, password_reset_expires: null, must_change_password: false });
    return res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/first-login-password ─────────────────────────────────────
const forceChangePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password: hash, must_change_password: false });
    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('forceChangePassword error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ─── POST /api/auth/impersonate-session ──────────────────────────────────────
// Exchanges a short-lived impersonation token (issued by platformController)
// for a real session cookie so the platform admin can browse as that tenant.
const impersonateSession = async (req, res) => {
  try {
    const { token: impToken } = req.body;
    if (!impToken) return res.status(400).json({ message: 'token is required.' });

    let decoded;
    try {
      decoded = jwt.verify(impToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired impersonation token.' });
    }

    if (!decoded.impersonated) {
      return res.status(401).json({ message: 'Token is not an impersonation token.' });
    }

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'color'] },
        { model: Tenant, as: 'tenant', attributes: ['id', 'slug', 'name', 'brand_name', 'logo_sidebar_url', 'logo_header_url', 'logo_login_url', 'logo_public_url', 'primary_color', 'sidebar_style', 'font_family', 'plan', 'status', 'trial_ends_at'] },
      ],
    });

    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Re-issue the impersonation token as the session cookie (same expiry: 2h)
    res.cookie('token', impToken, getCookieOptions(req));

    return res.json({ user });
  } catch (err) {
    console.error('impersonateSession error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { register, login, logout, getMe, verifyLogin2FA, setup2FA, enable2FA, disable2FA, status2FA, changeOwnPassword, forgotPassword, resetPassword, forceChangePassword, impersonateSession };
