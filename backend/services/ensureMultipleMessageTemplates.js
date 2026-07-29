'use strict';

const { sequelize } = require('../config/database');

async function ensureMultipleMessageTemplates() {
  const [tables] = await sequelize.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_templates'`
  );
  if (!tables.length) return;

  const [columns] = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_templates'`
  );
  const columnNames = new Set(columns.map((row) => row.COLUMN_NAME));

  if (!columnNames.has('name')) {
    await sequelize.query(
      `ALTER TABLE message_templates
       ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT 'Custom template' AFTER channel`
    );
  }
  if (!columnNames.has('is_default')) {
    await sequelize.query(
      `ALTER TABLE message_templates
       ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active`
    );
    // Every existing tenant had at most one row for a channel, so preserve it as selected.
    await sequelize.query(`UPDATE message_templates SET is_default = 1`);
  }

  const [indexes] = await sequelize.query(
    `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_templates'`
  );
  const indexNames = new Set(indexes.map((row) => row.INDEX_NAME));

  if (indexNames.has('uq_message_template')) {
    await sequelize.query(`ALTER TABLE message_templates DROP INDEX uq_message_template`);
  }
  if (!indexNames.has('idx_message_template_lookup')) {
    await sequelize.query(
      `CREATE INDEX idx_message_template_lookup
       ON message_templates (event_type, channel, tenant_id)`
    );
  }
}

module.exports = ensureMultipleMessageTemplates;
