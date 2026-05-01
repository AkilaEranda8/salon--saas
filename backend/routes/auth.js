const { Router } = require('express');
const { register, login, logout, getMe, verifyLogin2FA, setup2FA, enable2FA, disable2FA, status2FA, changeOwnPassword, forgotPassword, resetPassword, forceChangePassword, impersonateSession, kcLogin, kcRefresh, kcLogout } = require('../controllers/authController');
const { verifyToken, optionalVerifyToken, requireRole } = require('../middleware/auth');

const router = Router();

// POST /api/auth/register — requires superadmin or admin (no self-registration)
router.post('/register', verifyToken, requireRole('superadmin', 'admin'), register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me  (soft-protected)
router.get('/me', optionalVerifyToken, getMe);

// ── 2FA ──────────────────────────────────────────────────────────────────────
// Step 2 of login when 2FA is active (uses tempToken, no auth cookie needed)
router.post('/2fa/verify-login', verifyLogin2FA);
// These require an active session
router.get('/2fa/status',  verifyToken, status2FA);
router.post('/2fa/setup',  verifyToken, setup2FA);
router.post('/2fa/enable', verifyToken, enable2FA);
router.post('/2fa/disable', verifyToken, disable2FA);

// POST /api/auth/change-password — authenticated user changes their own password
router.post('/change-password', verifyToken, changeOwnPassword);

// POST /api/auth/forgot-password — public, sends reset link to user's email
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password/:token — public, sets new password via token
router.post('/reset-password/:token', resetPassword);

// POST /api/auth/first-login-password — authenticated, for must_change_password=true users
router.post('/first-login-password', verifyToken, forceChangePassword);

// POST /api/auth/impersonate-session — platform admin exchanges impersonation token for a session cookie
router.post('/impersonate-session', impersonateSession);

// ── Keycloak credential proxy (no auth middleware — public) ──────────────────
router.post('/kc-login',   kcLogin);
router.post('/kc-refresh', kcRefresh);
router.post('/kc-logout',  kcLogout);

module.exports = router;
