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

  // AI CRM secrets — never reuse JWT_SECRET (C6)
  const aiSecret = (process.env.AI_ENGINE_SERVICE_SECRET || '').trim();
  const aiSecretsKey = (process.env.AI_SECRETS_KEY || '').trim();
  if (isProduction) {
    if (!aiSecret || aiSecret.length < 16) {
      throw new Error(
        '✗ FATAL: AI_ENGINE_SERVICE_SECRET is required in production (min 16 chars).'
      );
    }
    if (!aiSecretsKey || aiSecretsKey.length < 16) {
      throw new Error(
        '✗ FATAL: AI_SECRETS_KEY is required in production (min 16 chars). Do not reuse JWT_SECRET.'
      );
    }
    if (aiSecret === process.env.JWT_SECRET || aiSecretsKey === process.env.JWT_SECRET) {
      throw new Error(
        '✗ FATAL: AI_ENGINE_SERVICE_SECRET / AI_SECRETS_KEY must not equal JWT_SECRET.'
      );
    }
    if (!process.env.REDIS_URL) {
      throw new Error('✗ FATAL: REDIS_URL is required in production for AI CRM queues.');
    }
  } else {
    if (!aiSecret) {
      console.warn('⚠  AI_ENGINE_SERVICE_SECRET not set — CRM AI service auth will fail closed.');
    }
    if (!aiSecretsKey) {
      console.warn('⚠  AI_SECRETS_KEY not set — encrypting AI/Meta secrets will fail.');
    }
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
