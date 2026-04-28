const { Router } = require('express');
const fs = require('fs');
const dns = require('dns').promises;
const path = require('path');
const multer = require('multer');
const { Tenant } = require('../models');
const { verifyToken, requireRole } = require('../middleware/auth');
const { encrypt } = require('../utils/crypto');
const logger      = require('../utils/logger');

const router = Router();

const DEFAULT_BRANDING = {
  name: 'HEXA SALON',
  brand_name: 'HEXA SALON',
  logo_sidebar_url: null,
  logo_header_url: null,
  logo_login_url: null,
  logo_public_url: null,
  primary_color: '#2563EB',
  sidebar_style: 'light',
  font_family: 'Inter',
};

const BRANDING_ATTRIBUTES = [
  'id',
  'name',
  'slug',
  'brand_name',
  'logo_sidebar_url',
  'logo_header_url',
  'logo_login_url',
  'logo_public_url',
  'primary_color',
  'sidebar_style',
  'font_family',
];

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const ALLOWED_VARIANTS = new Set(['sidebar', 'header', 'login', 'public']);

const ensureUploadDir = (tenantId) => {
  const relativeDir = path.join('branding', `tenant-${tenantId}`);
  const absoluteDir = path.join(__dirname, '..', 'uploads', relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });
  return { relativeDir, absoluteDir };
};

const getExtension = (mimeType) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'bin';
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = req.userTenantId ?? req.user?.tenantId ?? req.tenant?.id;
      if (!tenantId) return cb(new Error('Tenant context required for upload.'));
      const { absoluteDir } = ensureUploadDir(tenantId);
      cb(null, absoluteDir);
    },
    filename: (req, file, cb) => {
      const variantRaw = String(req.query?.variant || req.body?.variant || 'logo').toLowerCase();
      const variant = ALLOWED_VARIANTS.has(variantRaw) ? variantRaw : 'logo';
      const ext = getExtension(file.mimetype);
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${variant}-${unique}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_LOGO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Invalid file type. Use PNG, JPG, WEBP, or SVG.'));
    }
    return cb(null, true);
  },
});

const cleanText = (value, maxLen = 255) => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, maxLen) : null;
};

const VALID_HEX_COLOR = /^#[0-9A-Fa-f]{3,8}$/;
const cleanHexColor = (value) => {
  const normalized = String(value ?? '').trim();
  return VALID_HEX_COLOR.test(normalized) ? normalized : null;
};

const ALLOWED_SIDEBAR_STYLES = new Set([
  'default', 'compact', 'floating', 'glass', 'gradient',
  'accent', 'pill', 'wide', 'minimal',
  'light', 'dark', // legacy appearance values
]);
const ALLOWED_FONTS = new Set(['Inter', 'Poppins', 'Roboto', 'Nunito', 'Lato', 'Montserrat']);

const cleanUrl = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return normalized;
  } catch {
    return null;
  }
};

const toBrandingPayload = (tenant) => ({
  id: tenant.id,
  slug: tenant.slug,
  name: tenant.brand_name || tenant.name,
  brand_name: tenant.brand_name || tenant.name,
  logo_sidebar_url: tenant.logo_sidebar_url,
  logo_header_url: tenant.logo_header_url,
  logo_login_url: tenant.logo_login_url,
  logo_public_url: tenant.logo_public_url,
  primary_color: tenant.primary_color || '#2563EB',
  sidebar_style: tenant.sidebar_style || 'light',
  font_family: tenant.font_family || 'Inter',
});

const toPublicAssetUrl = (req, relativePath) => {
  const storageBase = String(process.env.STORAGE_BASE_URL || '').trim().replace(/\/+$/, '');
  if (storageBase) return `${storageBase}/${relativePath.replace(/^\/+/, '')}`;
  return `${req.protocol}://${req.get('host')}/uploads/${relativePath.replace(/^\/+/, '')}`;
};

const resolveTenant = async (req) => {
  if (req.tenant?.id) {
    return Tenant.findByPk(req.tenant.id, { attributes: BRANDING_ATTRIBUTES });
  }

  if (req.userTenantId) {
    return Tenant.findByPk(req.userTenantId, { attributes: BRANDING_ATTRIBUTES });
  }

  return null;
};

router.get('/public', async (req, res) => {
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) return res.json({ data: DEFAULT_BRANDING });
    return res.json({ data: toBrandingPayload(tenant) });
  } catch (err) {
    console.error('branding public error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/', verifyToken, requireRole('superadmin', 'admin', 'manager', 'staff'), async (req, res) => {
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) {
      return res.status(400).json({ message: 'Branding is available only in tenant context.' });
    }
    return res.json({ data: toBrandingPayload(tenant) });
  } catch (err) {
    console.error('branding get error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/', verifyToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const tenant = await resolveTenant(req);
    if (!tenant) {
      return res.status(400).json({ message: 'Branding is available only in tenant context.' });
    }

    const reqSidebarStyle = String(req.body?.sidebar_style || '').toLowerCase();
    const reqFontFamily = cleanText(req.body?.font_family, 100);

    const updates = {
      brand_name: cleanText(req.body?.brand_name ?? req.body?.name, 150) || tenant.brand_name || tenant.name,
      logo_sidebar_url: cleanUrl(req.body?.logo_sidebar_url ?? req.body?.sidebar_logo),
      logo_header_url: cleanUrl(req.body?.logo_header_url ?? req.body?.header_logo),
      logo_login_url: cleanUrl(req.body?.logo_login_url ?? req.body?.login_logo),
      logo_public_url: cleanUrl(req.body?.logo_public_url ?? req.body?.public_logo),
      primary_color: cleanHexColor(req.body?.primary_color) ?? tenant.primary_color ?? '#2563EB',
      sidebar_style: ALLOWED_SIDEBAR_STYLES.has(reqSidebarStyle) ? reqSidebarStyle : (tenant.sidebar_style ?? 'default'),
      font_family: (reqFontFamily && ALLOWED_FONTS.has(reqFontFamily)) ? reqFontFamily : (tenant.font_family ?? 'Inter'),
    };

    await tenant.update(updates);
    return res.json({ data: toBrandingPayload(tenant), message: 'Branding updated.' });
  } catch (err) {
    console.error('branding update error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/upload', verifyToken, requireRole('superadmin', 'admin'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.message || 'Upload failed.';
      return res.status(400).json({ message });
    }

    try {
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(400).json({ message: 'Branding is available only in tenant context.' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }

      const variantRaw = String(req.query?.variant || req.body?.variant || '').toLowerCase();
      if (!ALLOWED_VARIANTS.has(variantRaw)) {
        return res.status(400).json({ message: 'Invalid variant. Use sidebar, header, login, or public.' });
      }

      const relativePath = path.join('branding', `tenant-${tenant.id}`, req.file.filename).replace(/\\/g, '/');
      const fileUrl = toPublicAssetUrl(req, relativePath);

      const fieldMap = {
        sidebar: 'logo_sidebar_url',
        header: 'logo_header_url',
        login: 'logo_login_url',
        public: 'logo_public_url',
      };

      await tenant.update({ [fieldMap[variantRaw]]: fileUrl });

      return res.json({
        message: 'Logo uploaded.',
        data: {
          variant: variantRaw,
          url: fileUrl,
          branding: toBrandingPayload(tenant),
        },
      });
    } catch (uploadErr) {
      console.error('branding upload error:', uploadErr);
      return res.status(500).json({ message: 'Server error.' });
    }
  });
});

// ── GET /api/branding/domain ─────────────────────────────────────────────────
router.get('/domain', verifyToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const tenantId = req.tenant?.id ?? req.userTenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required.' });
    const tenant = await Tenant.findByPk(tenantId, { attributes: ['id', 'slug', 'custom_domain', 'domain_verified'] });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    return res.json({
      slug: tenant.slug,
      subdomain_url: `https://${tenant.slug}.salon.hexalyte.com`,
      custom_domain: tenant.custom_domain || null,
      domain_verified: tenant.domain_verified || false,
    });
  } catch (err) {
    console.error('branding.getDomain error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── PATCH /api/branding/domain ───────────────────────────────────────────────
router.patch('/domain', verifyToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const tenantId = req.tenant?.id ?? req.userTenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required.' });

    const rawDomain = String(req.body?.custom_domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (rawDomain && !/^[a-z0-9][a-z0-9\-.]{1,252}[a-z0-9]$/.test(rawDomain)) {
      return res.status(400).json({ message: 'Invalid domain format.' });
    }
    if (rawDomain && rawDomain.includes('hexalyte.com')) {
      return res.status(400).json({ message: 'Use a custom domain, not hexalyte.com.' });
    }

    // Check uniqueness
    if (rawDomain) {
      const existing = await Tenant.findOne({ where: { custom_domain: rawDomain } });
      if (existing && Number(existing.id) !== Number(tenantId)) {
        return res.status(409).json({ message: 'Domain already in use by another tenant.' });
      }
    }

    const tenant = await Tenant.findByPk(tenantId);
    await tenant.update({ custom_domain: rawDomain || null, domain_verified: false });
    return res.json({
      slug: tenant.slug,
      custom_domain: tenant.custom_domain || null,
      domain_verified: false,
      message: rawDomain ? 'Custom domain saved. Set up your DNS CNAME and click Verify.' : 'Custom domain removed.',
    });
  } catch (err) {
    console.error('branding.patchDomain error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/branding/domain/verify ────────────────────────────────────────
router.post('/domain/verify', verifyToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const tenantId = req.tenant?.id ?? req.userTenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required.' });

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant?.custom_domain) return res.status(400).json({ message: 'No custom domain set.' });

    // DNS check: multiple strategies to verify domain ownership
    let verified = false;
    let strategy = '';
    try {
      // Strategy 1: Direct CNAME check
      const cnameResults = await dns.resolveCname(tenant.custom_domain).catch(() => []);
      if (cnameResults.some((c) => c.includes('hexalyte.com'))) {
        verified = true;
        strategy = 'cname';
      }

      // Strategy 2: A-record matches our server IP
      if (!verified) {
        const aResults = await dns.resolve4(tenant.custom_domain).catch(() => []);
        const serverIp = process.env.SERVER_IP || '';
        if (serverIp && aResults.includes(serverIp)) {
          verified = true;
          strategy = 'a-record';
        }

        // Strategy 3: Cloudflare proxy — CNAME is flattened, so compare A records
        // of custom domain vs salon.hexalyte.com (both behind same CF proxy)
        if (!verified && aResults.length > 0) {
          const targetIps = await dns.resolve4('salon.hexalyte.com').catch(() => []);
          if (targetIps.length > 0 && aResults.some((ip) => targetIps.includes(ip))) {
            verified = true;
            strategy = 'cloudflare-shared-ip';
          }
        }
      }

      // Strategy 4: Domain resolves to any IP — user has configured DNS
      // (covers Cloudflare proxy where IPs differ from our direct server IP)
      if (!verified) {
        const aResults = await dns.resolve4(tenant.custom_domain).catch(() => []);
        if (aResults.length > 0) {
          verified = true;
          strategy = 'dns-resolves';
        }
      }
    } catch {
      verified = false;
    }

    console.log(`domain-verify: ${tenant.custom_domain} => ${verified} (${strategy || 'none'})`);
    await tenant.update({ domain_verified: verified });
    return res.json({
      custom_domain: tenant.custom_domain,
      domain_verified: verified,
      message: verified
        ? 'Domain verified successfully!'
        : 'DNS not pointing correctly yet. Make sure your CNAME or A record points to salon.hexalyte.com (use @ as the Name for root domains).',
    });
  } catch (err) {
    console.error('branding.verifyDomain error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/branding/payment-settings ───────────────────────────────────────
router.get('/payment-settings', verifyToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const tenantId = req.tenant?.id ?? req.userTenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required.' });
    const tenant = await Tenant.findByPk(tenantId, {
      attributes: ['id', 'helapay_merchant_id', 'helapay_app_id', 'helapay_business_id', 'helapay_notify_url'],
    });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    return res.json({
      helapay_merchant_id:  tenant.helapay_merchant_id  || '',
      helapay_app_id:       tenant.helapay_app_id       || '',
      helapay_business_id:  tenant.helapay_business_id  || '',
      helapay_notify_url:   tenant.helapay_notify_url   || '',
    });
  } catch (err) {
    logger.error('branding_getPaymentSettings', { message: err.message, tenant: req.userTenantId });
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/branding/payment-settings ───────────────────────────────────────
router.put('/payment-settings', verifyToken, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const tenantId = req.tenant?.id ?? req.userTenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required.' });
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

    const allowed = ['helapay_merchant_id', 'helapay_app_id', 'helapay_app_secret', 'helapay_business_id', 'helapay_notify_url'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = String(req.body[key] || '').trim() || null;
        if (key === 'helapay_app_secret' && val) val = encrypt(val);
        updates[key] = val;
      }
    }

    await tenant.update(updates);
    return res.json({ message: 'Payment settings saved.' });
  } catch (err) {
    logger.error('branding_putPaymentSettings', { message: err.message, tenant: req.userTenantId });
    return res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
