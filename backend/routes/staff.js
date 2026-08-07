const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ctrl = require('../controllers/staffController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { checkLimit } = require('../middleware/planLimits');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = req.userTenantId ?? req.user?.tenantId ?? req.tenant?.id ?? 'shared';
      const dir = path.join(__dirname, '..', 'uploads', 'staff', String(tenantId));
      try {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      const ext = file.mimetype === 'image/png' ? 'png'
        : file.mimetype === 'image/webp' ? 'webp'
          : 'jpg';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `staff-${req.params.id}-${unique}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Invalid file type. Use JPG, PNG, or WEBP.'));
    }
    return cb(null, true);
  },
});

const STAFF_APP_VERSION = '1.3.16';
const STAFF_APP_FILENAME = 'hexaone-staff-app.apk';

function resolveStaffAppPath() {
  const candidates = [
    path.join(__dirname, '..', 'uploads', 'apps', STAFF_APP_FILENAME),
    path.join(__dirname, '..', 'assets', STAFF_APP_FILENAME),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/',                         ctrl.list);
router.get('/roles',                    ctrl.listRoles);
router.post('/roles',                   requireRole('superadmin', 'admin', 'manager'), ctrl.addRole);
router.delete('/roles/:title',          requireRole('superadmin', 'admin', 'manager'), ctrl.removeRole);
router.get('/commission',               ctrl.commissionSummary);
router.get('/me/commission',            ctrl.myCommission);

/** Staff Android APK info (must be before /:id). */
router.get('/app-info', (_req, res) => {
  const appPath = resolveStaffAppPath();
  let size = null;
  if (appPath) {
    try { size = fs.statSync(appPath).size; } catch { /* ignore */ }
  }
  return res.json({
    available: Boolean(appPath),
    version: STAFF_APP_VERSION,
    filename: `hexaone-staff-app-${STAFF_APP_VERSION}.apk`,
    size_bytes: size,
    platform: 'android',
  });
});

/** Download Staff Android APK (must be before /:id). */
router.get('/app-download', (req, res) => {
  const appPath = resolveStaffAppPath();
  if (!appPath) {
    return res.status(503).json({ message: 'Staff app package is temporarily unavailable.' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Staff-App-Version', STAFF_APP_VERSION);
  return res.download(appPath, `hexaone-staff-app-${STAFF_APP_VERSION}.apk`, (err) => {
    if (err && !res.headersSent) {
      console.error('staff app download error:', err);
      res.status(500).json({ message: 'Staff app download failed.' });
    }
  });
});

router.get('/:id',                      ctrl.getOne);
router.post('/',                        requireRole('superadmin', 'admin', 'manager'), checkLimit('staff'), ctrl.create);
router.put('/:id',                      requireRole('superadmin', 'admin', 'manager'), ctrl.update);
router.delete('/:id',                   requireRole('superadmin', 'admin'), ctrl.remove);
router.get('/:id/commission',           ctrl.commissionReport);
router.post('/:id/specializations',     requireRole('superadmin', 'admin', 'manager'), ctrl.setSpecializations);

router.post('/:id/photo', requireRole('superadmin', 'admin', 'manager'), (req, res) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) {
      const status = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
      return res.status(status).json({ message: err.message || 'Photo upload failed.' });
    }
    return ctrl.uploadPhoto(req, res);
  });
});
router.delete('/:id/photo', requireRole('superadmin', 'admin', 'manager'), ctrl.deletePhoto);

module.exports = router;
