require('dotenv').config();
const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path         = require('path');
const cron         = require('node-cron');
const { sequelize } = require('./config/database');
const validateEnv  = require('./config/validateEnv');
const { initSocket } = require('./socket');
const { startAppointmentReminderCron, startReminderDueCron } = require('./services/appointmentReminderCron');
const { startMarketingAutomationCron } = require('./services/marketingAutomationCron');
const { apiMonitorMiddleware } = require('./services/apiMonitoring');
const { tenantScope }          = require('./middleware/tenantScope');
const { checkSubscription }    = require('./middleware/checkSubscription');
const { enforceMaintenanceMode } = require('./middleware/maintenanceMode');
const { ensureCustomerProfileColumns } = require('./services/ensureCustomerProfileColumns');
const { ensureInventorySupplierColumns } = require('./services/ensureInventorySupplierColumns');
const platformGuard = require('./middleware/platformGuard');
const logger        = require('./utils/logger');

// Validate required env vars on startup
validateEnv();

// Import models so associations are registered
require('./models');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow any *.salon.hexalyte.com or *.hexalyte.com subdomain (covers all tenant subdomains dynamically)
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // server-to-server or same-origin
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?salon\.hexalyte\.com$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?hexalyte\.com$/.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'", 'wss:', 'https:'],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many attempts, please try again after 15 minutes.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
});

const onboardingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      3,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many registration attempts, please try again later.' },
});

const helapayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many QR requests, please slow down.' },
});

app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/helapay',       helapayLimiter);
app.use('/api/',              apiLimiter);

// ── Socket.io ─────────────────────────────────────────────────────────────────
initSocket(server, {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
});

// ── Stripe webhook (MUST be before express.json — needs raw body) ─────────────
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/billing'));

app.use(express.json());
app.use(cookieParser());
app.use(apiMonitorMiddleware);

// ── Tenant scope (MUST be before all route handlers) ─────────────────────────
app.use('/api/', tenantScope);

// Static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const health = { status: 'ok', uptime: Math.floor(process.uptime()), timestamp: Date.now() };
  try {
    await sequelize.authenticate();
    health.database = 'ok';
  } catch {
    health.database = 'error';
    health.status   = 'degraded';
  }
  return res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Public (no auth, no subscription check)
app.use('/api/public',       require('./routes/public'));
app.use('/api/branding',     require('./routes/branding'));

// Onboarding (public — new salon registration)
app.use('/api/onboarding', onboardingLimiter, require('./routes/onboarding'));

// Auth
app.use('/api/auth',         require('./routes/auth'));

// Platform-controlled maintenance lock for non-platform requests
app.use('/api/',             enforceMaintenanceMode);

// Subscription check applied to all protected routes below
app.use('/api/', checkSubscription);

// Protected resources
app.use('/api/branches',     require('./routes/branches'));
app.use('/api/services',     require('./routes/services'));
app.use('/api/staff',        require('./routes/staff'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/customers',    require('./routes/customers'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/inventory',    require('./routes/inventory'));
app.use('/api/attendance',   require('./routes/attendance'));
app.use('/api/reminders',    require('./routes/reminders'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/walkin',       require('./routes/walkin'));
app.use('/api/expenses',     require('./routes/expenses'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reviews',      require('./routes/reviews'));
app.use('/api/packages',     require('./routes/packages'));
app.use('/api/discounts',    require('./routes/discounts'));
app.use('/api/fcm-token',    require('./routes/fcmToken'));
app.use('/api/support',      require('./routes/support'));

// Billing (protected — Stripe portal, checkout)
app.use('/api/billing',      require('./routes/billing'));

// Platform admin (only platform_admin role) — extra secret header guard
app.use('/api/platform', platformGuard, require('./routes/platform'));

// ── NEW FEATURES: Analytics, Communication, Loyalty, Security ──────────────────
app.use('/api/features',     require('./routes/features'));

// ── NEW VERTICAL FEATURES ──────────────────────────────────────────────────────
app.use('/api/waitlist',     require('./routes/waitlist'));
app.use('/api/loyalty',      require('./routes/loyalty'));
app.use('/api/membership',   require('./routes/membership'));
app.use('/api/consent',      require('./routes/consent'));
app.use('/api/kpi',          require('./routes/kpi'));
app.use('/api/marketing',    require('./routes/marketing'));
app.use('/api/helapay',      require('./routes/helapay'));
app.use('/api/advances',            require('./routes/advances'));
app.use('/api/commission-payouts',  require('./routes/commissionPayouts'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('unhandled_error', { message: err.message, stack: err.stack, path: req.path });
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error',
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function connectWithRetry(retries = 10, delay = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await sequelize.authenticate();
      logger.info('database_connected');
      return;
    } catch (err) {
      logger.warn(`db_connect_attempt_${i}`, { message: err.message });
      if (i < retries) await new Promise((r) => setTimeout(r, delay));
    }
  }
  logger.error('db_connect_failed', { retries });
}

connectWithRetry().then(async () => {
  // Create any new tables (CREATE IF NOT EXISTS — never alters or drops existing)
  try {
    await sequelize.sync({ force: false });
  } catch (err) {
    logger.warn('sequelize_sync_warning', { message: err.message });
  }

  // ── Column migrations (idempotent — safe to run on every start) ──────────
  try {
    const [cols] = await sequelize.query(
      `SHOW COLUMNS FROM staff LIKE 'user_id'`
    );
    if (cols.length === 0) {
      await sequelize.query(
        `ALTER TABLE staff ADD COLUMN user_id INT NULL DEFAULT NULL`
      );
      logger.info('migration: staff.user_id column added');
    } else {
      logger.info('migration: staff.user_id already exists');
    }
  } catch (err) {
    logger.warn('migration_staff_user_id', { message: err.message });
  }

  try {
    const [cols] = await sequelize.query(
      `SHOW COLUMNS FROM payments LIKE 'promo_discount'`
    );
    if (cols.length === 0) {
      await sequelize.query(
        `ALTER TABLE payments ADD COLUMN promo_discount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER loyalty_discount`
      );
      logger.info('migration: payments.promo_discount column added');
    } else {
      logger.info('migration: payments.promo_discount already exists');
    }
  } catch (err) {
    logger.warn('migration_payments_promo_discount', { message: err.message });
  }

  try {
    const brandingColumns = [
      ['brand_name', "ALTER TABLE tenants ADD COLUMN brand_name VARCHAR(150) NULL AFTER email"],
      ['logo_sidebar_url', "ALTER TABLE tenants ADD COLUMN logo_sidebar_url TEXT NULL AFTER brand_name"],
      ['logo_header_url', "ALTER TABLE tenants ADD COLUMN logo_header_url TEXT NULL AFTER logo_sidebar_url"],
      ['logo_login_url', "ALTER TABLE tenants ADD COLUMN logo_login_url TEXT NULL AFTER logo_header_url"],
      ['logo_public_url', "ALTER TABLE tenants ADD COLUMN logo_public_url TEXT NULL AFTER logo_login_url"],
    ];

    for (const [column, alterSql] of brandingColumns) {
      const [cols] = await sequelize.query(`SHOW COLUMNS FROM tenants LIKE '${column}'`);
      if (cols.length === 0) {
        await sequelize.query(alterSql);
        logger.info(`migration: tenants.${column} column added`);
      }
    }
  } catch (err) {
    logger.warn('migration_tenants_branding', { message: err.message });
  }

  // ── DB Indexes (idempotent) ──────────────────────────────────────────────────
  try {
    const indexes = [
      { table: 'appointments', columns: '(tenant_id, date)',    name: 'idx_appt_tenant_date' },
      { table: 'appointments', columns: '(staff_id, date)',     name: 'idx_appt_staff_date'  },
      { table: 'payments',     columns: '(tenant_id, created_at)', name: 'idx_pay_tenant_date' },
      { table: 'payments',     columns: '(customer_id)',        name: 'idx_pay_customer'     },
      { table: 'walk_in_queue', columns: '(tenant_id, status)',  name: 'idx_walkin_tenant_status' },
      { table: 'tenants',      columns: '(slug)',               name: 'idx_tenant_slug', unique: true },
    ];
    const [existingIndexes] = await sequelize.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`);
    const existingNames = new Set(existingIndexes.map(r => r.INDEX_NAME));
    for (const idx of indexes) {
      if (existingNames.has(idx.name)) continue;
      const unique = idx.unique ? 'UNIQUE' : '';
      try {
        await sequelize.query(`CREATE ${unique} INDEX ${idx.name} ON ${idx.table} ${idx.columns}`);
        logger.info(`migration_index_added: ${idx.name}`);
      } catch (e) {
        logger.warn(`migration_index_skip: ${idx.name}`, { message: e.message });
      }
    }
  } catch (err) {
    logger.warn('migration_indexes_failed', { message: err.message });
  }

  // ── Revoked token cleanup cron (daily at 3am) ─────────────────────────────
  cron.schedule('0 3 * * *', async () => {
    try {
      const { RevokedToken } = require('./models');
      const deleted = await RevokedToken.destroy({ where: { expires_at: { [require('sequelize').Op.lt]: new Date() } } });
      if (deleted > 0) logger.info('revoked_token_cleanup', { deleted });
    } catch (e) { logger.warn('revoked_token_cleanup_failed', { message: e.message }); }
  });

  startAppointmentReminderCron();
  startReminderDueCron();
  startMarketingAutomationCron();

  // ── New column migrations ───────────────────────────────────────────────────
  await ensureCustomerProfileColumns();
  await ensureInventorySupplierColumns();

  server.listen(PORT, () =>
    logger.info('server_started', { port: PORT })
  );
});

module.exports = app;
