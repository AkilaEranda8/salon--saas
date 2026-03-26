const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Appointment, AppointmentService, Service } = require('../models');

const EXTRA_PREFIX_REGEX = /^\s*additional\s+services?\s*[:\-]?\s*/i;

function parseAdditionalServiceNames(notes = '') {
  const line = String(notes).split('\n').find((l) => EXTRA_PREFIX_REGEX.test(l));
  if (!line) return [];
  return line
    .replace(EXTRA_PREFIX_REGEX, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureAppointmentServicesTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS appointment_services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id INT NOT NULL,
      service_id INT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_appt_service (appointment_id, service_id),
      KEY idx_appointment_id (appointment_id),
      KEY idx_service_id (service_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  `);
}

async function backfillMissingMappings() {
  const mappedRows = await AppointmentService.findAll({
    attributes: ['appointment_id'],
    raw: true,
  });
  const mappedIds = new Set(mappedRows.map((r) => Number(r.appointment_id)).filter(Boolean));

  const appts = await Appointment.findAll({
    where: mappedIds.size ? { id: { [Op.notIn]: Array.from(mappedIds) } } : {},
    attributes: ['id', 'service_id', 'notes'],
    raw: true,
  });
  if (!appts.length) return 0;

  const allNames = Array.from(new Set(
    appts.flatMap((a) => parseAdditionalServiceNames(a.notes || '')),
  ));
  const services = allNames.length
    ? await Service.findAll({ where: { name: { [Op.in]: allNames } }, attributes: ['id', 'name'], raw: true })
    : [];
  const nameToId = new Map(services.map((s) => [String(s.name), Number(s.id)]));

  const inserts = [];
  for (const appt of appts) {
    const primaryId = Number(appt.service_id || 0);
    const ids = [];
    if (primaryId) ids.push(primaryId);
    for (const n of parseAdditionalServiceNames(appt.notes || '')) {
      const sid = nameToId.get(n);
      if (sid && !ids.includes(sid)) ids.push(sid);
    }
    ids.forEach((sid, idx) => {
      inserts.push({ appointment_id: appt.id, service_id: sid, sort_order: idx });
    });
  }

  if (!inserts.length) return 0;
  await AppointmentService.bulkCreate(inserts, { ignoreDuplicates: true });
  return inserts.length;
}

async function runAppointmentServicesMigration() {
  await ensureAppointmentServicesTable();
  const created = await backfillMissingMappings();
  console.log(`✓ appointment_services migration ready (backfilled rows: ${created})`);
}

module.exports = { runAppointmentServicesMigration };
