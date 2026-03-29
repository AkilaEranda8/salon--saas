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
const { runAppointmentServicesMigration } = require('./services/appointmentServicesMigration');
const { ensureUsersStaffIdColumn } = require('./services/ensureUsersStaffIdColumn');
const { ensureWalkInTotalAmountColumn } = require('./services/ensureWalkInTotalAmountColumn');
const { runWalkInQueueServicesMigration } = require('./services/walkInQueueServicesMigration');
const { ensureCustomerPhoneUniqueIndex } = require('./services/ensureCustomerPhoneUniqueIndex');
const { ensureStaffBranchesBackfill } = require('./services/ensureStaffBranchesBackfill');
const { ensureStaffEmailColumn } = require('./services/ensureStaffEmailColumn');
const { startStaffMonthlyEarningsCron, isCronEnabled } = require('./services/staffMonthlyEarningsCron');

// Validate required env vars on startup
validateEnv();

// Import models so associations are registered
require('./models');

const app = express();
const server = http.createServer(app);

// Trust Nginx reverse proxy (fixes X-Forwarded-For for rate limiting)
app.set('trust proxy', 1);

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost',        // Docker nginx (port 80)
  'http://localhost:80',
  'http://zanesalon.com',
  'https://zanesalon.com',
  'http://www.zanesalon.com',
  'https://www.zanesalon.com',
  'http://main.zanesalon.com',
  'https://main.zanesalon.com',
  'http://api.zanesalon.com',
  'https://api.zanesalon.com',
  'http://157.180.113.249',
  'http://157.180.113.249:80',
];
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting — auth endpoints most restrictive
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many attempts, please try again after 15 minutes.' },
});

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
});

app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/',              apiLimiter);

// ── Socket.io ─────────────────────────────────────────────────────────────────
initSocket(server, { origin: allowedOrigins, credentials: true });

app.use(express.json());
app.use(cookieParser());

// Static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', message: 'Zane Salon API is running' })
);

// Public (no auth)
app.use('/api/public',       require('./routes/public'));

// Auth
app.use('/api/auth',         require('./routes/auth'));

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
    await ensureUsersStaffIdColumn();
    await ensureStaffEmailColumn();
    await ensureWalkInTotalAmountColumn();
    await runWalkInQueueServicesMigration();
    await sequelize.sync({ force: false });
    await ensureStaffBranchesBackfill();
    await ensureCustomerPhoneUniqueIndex();
    await runAppointmentServicesMigration();
  } catch (err) {
    console.warn('⚠  Table sync warning:', err.message);
  }
  server.listen(PORT, () => {
    console.log(`✓ Zane Salon server running on http://localhost:${PORT}`);
    if (isCronEnabled()) startStaffMonthlyEarningsCron();
    else console.log('○ Staff monthly earnings cron disabled (STAFF_MONTHLY_EARNINGS_CRON=false)');
  });
});

module.exports = app;
