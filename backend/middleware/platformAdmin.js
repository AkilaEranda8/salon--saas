/**
 * platformAdmin middleware
 *
 * Allows only users with role === 'platform_admin'.
 * Must be used AFTER verifyToken.
 */
const platformAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'platform_admin') {
    return res.status(403).json({ message: 'Platform admin access required.' });
  }
  next();
};

module.exports = { platformAdmin };
