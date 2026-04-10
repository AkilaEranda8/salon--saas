require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/database');

const qi = sequelize.getQueryInterface();

async function addIfMissing(table, column, definition) {
  try {
    await qi.addColumn(table, column, definition);
    console.log(`  + ${table}.${column}`);
  } catch (e) {
    if (/duplicate column/i.test(e.message) || e.original?.code === 'ER_DUP_FIELDNAME') {
      // already exists — skip
    } else {
      console.warn(`  ! ${table}.${column}: ${e.message}`);
    }
  }
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ DB connected');

    const { DataTypes } = require('sequelize');

    // ── notification_settings missing columns ────────────────────────────────
    await addIfMissing('notification_settings', 'appt_confirmed_sms',      { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false });
    await addIfMissing('notification_settings', 'payment_receipt_sms',     { type: DataTypes.BOOLEAN, defaultValue: true,  allowNull: false });
    await addIfMissing('notification_settings', 'loyalty_points_sms',      { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false });
    await addIfMissing('notification_settings', 'customer_registered_sms', { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false });
    await addIfMissing('notification_settings', 'customer_registered_email',{ type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false });
    await addIfMissing('notification_settings', 'sms_sender_id',           { type: DataTypes.STRING(50), allowNull: true });
    await addIfMissing('notification_settings', 'sms_user_id',             { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('notification_settings', 'sms_api_key',             { type: DataTypes.TEXT, allowNull: true });
    await addIfMissing('notification_settings', 'twilio_account_sid',      { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('notification_settings', 'twilio_auth_token',       { type: DataTypes.TEXT, allowNull: true });
    await addIfMissing('notification_settings', 'twilio_whatsapp_from',    { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('notification_settings', 'smtp_host',               { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('notification_settings', 'smtp_port',               { type: DataTypes.INTEGER, allowNull: true });
    await addIfMissing('notification_settings', 'smtp_user',               { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('notification_settings', 'smtp_from',               { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('notification_settings', 'smtp_pass',               { type: DataTypes.TEXT, allowNull: true });

    // ── appointments status ENUM — add in_service ────────────────────────────
    await sequelize.query(`ALTER TABLE appointments MODIFY COLUMN status ENUM('pending','confirmed','in_service','completed','cancelled') NOT NULL DEFAULT 'pending'`).catch(e => console.warn('  ! appointments.status ENUM:', e.message));

    // ── payments missing columns ──────────────────────────────────────────────
    await addIfMissing('payments', 'promo_discount', { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: true });

    // ── staff missing columns ────────────────────────────────────────────────
    await addIfMissing('staff', 'email', { type: DataTypes.STRING, allowNull: true });

    // ── users missing columns ────────────────────────────────────────────────
    await addIfMissing('users', 'staff_id', { type: DataTypes.INTEGER, allowNull: true });

    // ── tenants theme columns ────────────────────────────────────────────────
    await addIfMissing('tenants', 'primary_color', { type: DataTypes.STRING(20),  allowNull: true,  defaultValue: '#2563EB' });
    await addIfMissing('tenants', 'sidebar_style', { type: DataTypes.STRING(10),  allowNull: false, defaultValue: 'light' });
    await addIfMissing('tenants', 'font_family',   { type: DataTypes.STRING(100), allowNull: true,  defaultValue: 'Inter' });

    // ── message_templates table ──────────────────────────────────────────────
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        channel ENUM('email','whatsapp','sms') NOT NULL,
        subject VARCHAR(255) NULL,
        body TEXT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        tenant_id INT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_message_template (event_type, channel, tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch(e => console.warn('  ! message_templates:', e.message));

    // ── users 2FA columns ────────────────────────────────────────────────────
    await addIfMissing('users', 'totp_secret',  { type: DataTypes.STRING(64),  allowNull: true });
    await addIfMissing('users', 'totp_enabled', { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false });

    console.log('✓ Migration complete');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
