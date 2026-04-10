const { Router } = require('express');
const jwt = require('jsonwebtoken');
const { register, login, logout, getMe, verifyLogin2FA, setup2FA, enable2FA, disable2FA, status2FA, changeOwnPassword, impersonateSession } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = Router();

// Soft auth check for /auth/me so initial app load does not raise 401 noise
// when there is no session yet.
const optionalVerifyToken = (req, res, next) => {
	const token =
		req.cookies?.token ||
		(req.headers.authorization?.startsWith('Bearer ')
			? req.headers.authorization.split(' ')[1]
			: null);

	if (!token) {
		return res.json({ user: null });
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		req.user = decoded;
		req.userTenantId = decoded.role === 'platform_admin' ? null : (decoded.tenantId ?? null);
		return next();
	} catch (_err) {
		return res.json({ user: null });
	}
};

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

// POST /api/auth/impersonate-session — platform admin exchanges impersonation token for a session cookie
router.post('/impersonate-session', impersonateSession);

module.exports = router;
