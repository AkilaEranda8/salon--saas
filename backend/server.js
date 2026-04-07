require('dotenv').config();
const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { sequelize } = require('./config/database');
const validateEnv  = require('./config/validateEnv');
const { initSocket } = require('./socket');
const { startAppointmentReminderCron, startReminderDueCron } = require('./services/appointmentReminderCron');
const { tenantScope }       = require('./middleware/tenantScope');
const { checkSubscription } = require('./middleware/checkSubscription');

// Validate required env vars on startup
validateEnv();

// Import models so associations are registered
require('./models');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow any *.zanesalon.com subdomain (covers all tenant subdomains dynamically)
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // server-to-server or same-origin
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?zanesalon\.com$/.test(origin)) return true;
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
app.use(helmet({ contentSecurityPolicy: false }));

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

app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
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

// ── Tenant scope (MUST be before all route handlers) ─────────────────────────
app.use('/api/', tenantScope);

// Static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', message: 'Zane Salon API is running' })
);

// Public (no auth, no subscription check)
app.use('/api/public',       require('./routes/public'));

// Onboarding (public — new salon registration)
app.use('/api/onboarding', onboardingLimiter, require('./routes/onboarding'));

// Auth
app.use('/api/auth',         require('./routes/auth'));

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

// Billing (protected — Stripe portal, checkout)
app.use('/api/billing',      require('./routes/billing'));

// Platform admin (only platform_admin role)
app.use('/api/platform',     require('./routes/platform'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
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
      console.log('✓ Database connection established.');
      return;
    } catch (err) {
      console.error(`✗ DB connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.error('✗ Could not connect to database after all retries.');
}

connectWithRetry().then(async () => {
  // Create any new tables (CREATE IF NOT EXISTS — never alters or drops existing)
  try {
    await sequelize.sync({ force: false });
  } catch (err) {
    console.warn('⚠  Table sync warning:', err.message);
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
      console.log('✓ Migration: staff.user_id column added.');
    } else {
      console.log('✓ Migration: staff.user_id already exists.');
    }
  } catch (err) {
    console.warn('⚠  Migration staff.user_id:', err.message);
  }

  startAppointmentReminderCron();
  startReminderDueCron();
  server.listen(PORT, () =>
    console.log(`✓ Zane Salon server running on http://localhost:${PORT}`)
  );
});

module.exports = app;
