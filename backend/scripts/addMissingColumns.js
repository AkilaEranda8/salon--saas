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
    await addIfMissing('tenants', 'sidebar_style', { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'hexa' });
    await addIfMissing('tenants', 'font_family',   { type: DataTypes.STRING(100), allowNull: true,  defaultValue: 'Inter' });
    // Expand sidebar_style ENUM to include all layout options + hexa default
    await sequelize.query(`ALTER TABLE tenants MODIFY COLUMN sidebar_style ENUM('hexa','default','compact','floating','glass','gradient','accent','pill','wide','minimal','light','dark') NOT NULL DEFAULT 'hexa'`).catch(() => {});
    // Migrate old 'light'/'dark' values to hexa
    await sequelize.query(`UPDATE tenants SET sidebar_style='hexa' WHERE sidebar_style IN ('light','dark','default') OR sidebar_style IS NULL`).catch(() => {});

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

    // ── users auth columns ───────────────────────────────────────────────────
    await addIfMissing('users', 'email',                { type: DataTypes.STRING(255), allowNull: true });
    await addIfMissing('users', 'must_change_password', { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false });
    await addIfMissing('users', 'password_reset_token', { type: DataTypes.STRING(64),  allowNull: true });
    await addIfMissing('users', 'password_reset_expires', { type: DataTypes.DATE,     allowNull: true });

    // ── tenants HelaPay columns ───────────────────────────────────────────────
    await addIfMissing('tenants', 'helapay_merchant_id',  { type: DataTypes.STRING(100), allowNull: true });
    await addIfMissing('tenants', 'helapay_app_id',       { type: DataTypes.STRING(200), allowNull: true });
    await addIfMissing('tenants', 'helapay_app_secret',   { type: DataTypes.TEXT,        allowNull: true });
    await addIfMissing('tenants', 'helapay_business_id',  { type: DataTypes.STRING(100), allowNull: true });
    await addIfMissing('tenants', 'helapay_notify_url',   { type: DataTypes.STRING(500), allowNull: true });

    // ── notification_logs ENUM expansion ─────────────────────────────────────
    await sequelize.query(`ALTER TABLE notification_logs MODIFY COLUMN event_type ENUM('appointment_confirmed','payment_receipt','loyalty_points','test','review_request','password_reset','custom_marketing') NOT NULL`).catch(e => console.warn('  ! notification_logs.event_type ENUM:', e.message));
    await sequelize.query(`ALTER TABLE notification_logs MODIFY COLUMN channel ENUM('email','whatsapp','sms') NOT NULL`).catch(e => console.warn('  ! notification_logs.channel ENUM:', e.message));

    console.log('✓ Migration complete');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
