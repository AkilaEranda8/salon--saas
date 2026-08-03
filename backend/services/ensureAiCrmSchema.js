'use strict';

/**
 * AI CRM schema bootstrap — unique indexes MUST succeed or startup fails (C9).
 * Active appointment slot uniqueness via generated column (C17).
 */
const { sequelize } = require('../config/database');
const { AiModelRate } = require('../models');

const DEFAULT_RATES = [
  { provider: 'openai', model: 'gpt-4o-mini', input_per_1k: 0.00015, output_per_1k: 0.0006, currency: 'USD' },
  { provider: 'openai', model: 'gpt-4o', input_per_1k: 0.0025, output_per_1k: 0.01, currency: 'USD' },
  { provider: 'gemini', model: 'gemini-2.0-flash', input_per_1k: 0.0001, output_per_1k: 0.0004, currency: 'USD' },
  { provider: 'gemini', model: 'gemini-1.5-flash', input_per_1k: 0.000075, output_per_1k: 0.0003, currency: 'USD' },
];

async function indexExists(indexName, tableName) {
  const [rows] = await sequelize.query(
    `SELECT 1 AS ok FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND index_name = :indexName
     LIMIT 1`,
    { replacements: { tableName, indexName } }
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await sequelize.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND column_name = :columnName
     LIMIT 1`,
    { replacements: { tableName, columnName } }
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Create unique index or throw a clear migration error (C9).
 */
async function ensureUniqueIndex(indexName, tableName, createSql) {
  if (await indexExists(indexName, tableName)) return { created: false, name: indexName };
  try {
    await sequelize.query(createSql);
  } catch (err) {
    const e = new Error(
      `FATAL AI CRM migration: failed to create UNIQUE index ${indexName} on ${tableName}. ` +
      `Resolve duplicate rows then restart. Underlying: ${err.message}`
    );
    e.code = 'AI_CRM_UNIQUE_INDEX_FAILED';
    e.cause = err;
    throw e;
  }
  if (!(await indexExists(indexName, tableName))) {
    const e = new Error(
      `FATAL AI CRM migration: UNIQUE index ${indexName} was not present after CREATE on ${tableName}.`
    );
    e.code = 'AI_CRM_UNIQUE_INDEX_MISSING';
    throw e;
  }
  return { created: true, name: indexName };
}

async function ensureActiveSlotConstraint() {
  // Generated column: NULL for cancelled/completed → multiple history rows OK;
  // unique among active pending/confirmed/in_service (C17).
  if (!(await columnExists('appointments', 'active_slot_key'))) {
    try {
      await sequelize.query(`
        ALTER TABLE appointments
        ADD COLUMN active_slot_key VARCHAR(128)
        GENERATED ALWAYS AS (
          IF(
            status IN ('cancelled', 'completed') OR staff_id IS NULL OR tenant_id IS NULL,
            NULL,
            CONCAT(
              tenant_id, '|', staff_id, '|', \`date\`, '|',
              DATE_FORMAT(\`time\`, '%H:%i')
            )
          )
        ) STORED
      `);
    } catch (err) {
      const e = new Error(
        `FATAL AI CRM migration: failed to add appointments.active_slot_key. ${err.message}`
      );
      e.code = 'AI_CRM_SLOT_COLUMN_FAILED';
      e.cause = err;
      throw e;
    }
  }

  await ensureUniqueIndex(
    'appointments_active_slot_uq',
    'appointments',
    'CREATE UNIQUE INDEX appointments_active_slot_uq ON appointments (active_slot_key)'
  );
}

async function ensureAiCrmSchema() {
  for (const row of DEFAULT_RATES) {
    const [record] = await AiModelRate.findOrCreate({
      where: { provider: row.provider, model: row.model },
      defaults: { ...row, active: true },
    });
    if (record && !record.active) {
      await record.update({ active: true });
    }
  }

  await ensureUniqueIndex(
    'waba_phone_number_id_uq',
    'whatsapp_business_accounts',
    'CREATE UNIQUE INDEX waba_phone_number_id_uq ON whatsapp_business_accounts (phone_number_id)'
  );
  await ensureUniqueIndex(
    'waba_business_account_id_uq',
    'whatsapp_business_accounts',
    'CREATE UNIQUE INDEX waba_business_account_id_uq ON whatsapp_business_accounts (waba_id)'
  );
  await ensureUniqueIndex(
    'crm_messages_tenant_wa_id_uq',
    'crm_messages',
    'CREATE UNIQUE INDEX crm_messages_tenant_wa_id_uq ON crm_messages (tenant_id, wa_message_id)'
  );

  await ensureActiveSlotConstraint();

  // C4 resume columns
  if (!(await columnExists('crm_conversations', 'ai_turn_state'))) {
    await sequelize.query(
      `ALTER TABLE crm_conversations ADD COLUMN ai_turn_state VARCHAR(32) NULL`
    );
  }
  if (!(await columnExists('crm_conversations', 'ai_turn_wa_message_id'))) {
    await sequelize.query(
      `ALTER TABLE crm_conversations ADD COLUMN ai_turn_wa_message_id VARCHAR(128) NULL`
    );
  }
}

module.exports = ensureAiCrmSchema;
module.exports.ensureUniqueIndex = ensureUniqueIndex;
module.exports.ensureActiveSlotConstraint = ensureActiveSlotConstraint;
