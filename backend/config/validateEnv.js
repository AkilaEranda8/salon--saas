/**
 * validateEnv.js — Check all required environment variables on startup.
 * Throws with a clear message if any are missing.
 */

const DEFAULT_INSECURE_SECRETS = [
  'zanesalon_jwt_secret_key_change_in_production',
  'zanesalon_docker_jwt_secret_change_me',
];

function validateEnv() {
  const required = [
    'DB_HOST',
    'DB_USER',
    'DB_PASS',
    'DB_NAME',
    'JWT_SECRET',
    'NODE_ENV',
    'FRONTEND_BASE_URL',
    'PLATFORM_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
      missing.map((k) => `  - ${k}`).join('\n') +
      `\n\nCreate a .env file in the backend/ folder. See README.md for the template.`
    );
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // In production, block insecure default secrets
  if (isProduction && DEFAULT_INSECURE_SECRETS.includes(process.env.JWT_SECRET)) {
    throw new Error(
      '✗ FATAL: JWT_SECRET is set to a default/insecure value in production. ' +
      'Set a strong random secret (min 32 chars) in your .env file.'
    );
  }

  // Warn in non-production environments
  if (!isProduction && DEFAULT_INSECURE_SECRETS.includes(process.env.JWT_SECRET)) {
    console.warn('⚠  WARNING: Using default JWT_SECRET. Change it for production!');
  }

  // Enforce minimum JWT_SECRET length in production
  if (isProduction && process.env.JWT_SECRET.length < 32) {
    throw new Error(
      '✗ FATAL: JWT_SECRET must be at least 32 characters in production.'
    );
  }

  // Warn about optional but recommended env vars
  const recommended = [
    'EMAIL_USER',
    'EMAIL_PASS',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'ENCRYPTION_KEY',
    'PLATFORM_SECRET',
  ];
  const missingRecommended = recommended.filter((k) => !process.env[k]);
  if (missingRecommended.length > 0) {
    console.warn(
      `⚠  OPTIONAL env vars not set (some features will be disabled):\n` +
      missingRecommended.map((k) => `  - ${k}`).join('\n')
    );
  }
}

module.exports = validateEnv;
