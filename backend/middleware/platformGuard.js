/**
 * platformGuard — extra protection layer for /api/platform/* routes.
 * When PLATFORM_SECRET env var is set, requests must carry
 * the matching X-Platform-Key header in addition to their JWT.
 *
 * The frontend platform panel reads this from VITE_PLATFORM_SECRET
 * and attaches it as a request header in its axios instance.
 *
 * If PLATFORM_SECRET is not set the guard is a no-op (backward-compatible).
 */
const platformGuard = (req, res, next) => {
  const secret = process.env.PLATFORM_SECRET;
  if (!secret) return next(); // not configured — allow (backwards compat)

  const provided = req.headers['x-platform-key'];
  if (!provided || provided !== secret) {
    return res.status(403).json({ message: 'Platform access denied.' });
  }
  next();
};

module.exports = platformGuard;
