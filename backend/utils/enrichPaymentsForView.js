const { Op } = require('sequelize');
const { AppointmentService, Service, Staff } = require('../models');
const { parseJsonField } = require('./paymentCommissionTotals');

function collectPaymentServiceIds(json) {
  const ids = new Set();
  const add = (raw) => {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  };
  add(json.service_id);
  add(json.service?.id);
  const bd = parseJsonField(json.commission_breakdown);
  for (const line of bd?.lines || []) add(line.serviceId ?? line.service_id);
  for (const row of bd?.perStaff || []) {
    for (const sid of row.service_ids || []) add(sid);
  }
  return ids;
}

/** Attach booked services + per-service staff from appointment_services / breakdown. */
async function enrichPaymentsForView(payments) {
  const list = (Array.isArray(payments) ? payments : [payments]).filter(Boolean);
  if (!list.length) return list;

  const apptIds = [...new Set(list.map((p) => Number(p.appointment_id)).filter((id) => id > 0))];
  const linkRows = apptIds.length
    ? await AppointmentService.findAll({
      where: { appointment_id: { [Op.in]: apptIds } },
      attributes: ['appointment_id', 'service_id', 'staff_id', 'date', 'time', 'sort_order', 'id'],
      order: [['appointment_id', 'ASC'], ['sort_order', 'ASC'], ['id', 'ASC']],
      raw: true,
    })
    : [];

  const linksByAppt = new Map();
  const serviceIds = new Set();
  const staffIds = new Set();
  for (const p of list) {
    for (const id of collectPaymentServiceIds(p)) serviceIds.add(id);
    if (p.staff_id) staffIds.add(Number(p.staff_id));
  }
  for (const row of linkRows) {
    const key = Number(row.appointment_id);
    if (!linksByAppt.has(key)) linksByAppt.set(key, []);
    linksByAppt.get(key).push(row);
    if (Number(row.service_id) > 0) serviceIds.add(Number(row.service_id));
    if (Number(row.staff_id) > 0) staffIds.add(Number(row.staff_id));
  }
  for (const p of list) {
    for (const line of p.commission_per_staff || []) {
      if (Number(line.staff_id) > 0) staffIds.add(Number(line.staff_id));
    }
  }

  const [svcRows, staffRows] = await Promise.all([
    serviceIds.size
      ? Service.findAll({ where: { id: [...serviceIds] }, attributes: ['id', 'name', 'price'], raw: true })
      : [],
    staffIds.size
      ? Staff.findAll({ where: { id: [...staffIds] }, attributes: ['id', 'name'], raw: true })
      : [],
  ]);
  const svcById = new Map(svcRows.map((s) => [Number(s.id), s]));
  const staffNameById = new Map(staffRows.map((s) => [Number(s.id), s.name]));

  for (const p of list) {
    const apptLinks = linksByAppt.get(Number(p.appointment_id)) || [];
    const bd = parseJsonField(p.commission_breakdown);
    const fromBreakdown = (bd?.lines || [])
      .map((line) => ({
        service_id: Number(line.serviceId ?? line.service_id) || null,
        service_name: line.serviceName || line.service_name || null,
        staff_id: Number(line.staffId ?? line.staff_id) || null,
        staff_name: line.staffName || line.staff_name || null,
      }))
      .filter((l) => l.service_id || l.service_name);

    const serviceStaff = (apptLinks.length ? apptLinks : fromBreakdown).map((row) => {
      const sid = Number(row.service_id) || null;
      const stid = row.staff_id != null ? Number(row.staff_id) : null;
      return {
        service_id: sid,
        service_name: row.service_name || (sid ? svcById.get(sid)?.name : null) || null,
        staff_id: stid,
        staff_name: row.staff_name || (stid ? staffNameById.get(stid) : null) || p.staff?.name || null,
        date: row.date ? String(row.date).slice(0, 10) : null,
        time: row.time ? String(row.time).slice(0, 8) : null,
      };
    });

    const seenSvc = new Set();
    const services = [];
    const pushSvc = (id, name, price) => {
      const key = id || name;
      if (!key || seenSvc.has(String(key))) return;
      seenSvc.add(String(key));
      services.push({
        id: id || null,
        name: name || (id ? svcById.get(id)?.name : null) || null,
        price: price != null ? Number(price) : (id ? Number(svcById.get(id)?.price || 0) : null),
      });
    };
    for (const line of serviceStaff) pushSvc(line.service_id, line.service_name, svcById.get(line.service_id)?.price);
    if (!services.length && p.service) pushSvc(p.service.id, p.service.name, p.service.price);

    p.services = services.filter((s) => s.name);
    p.service_staff = serviceStaff;
    p.commission_per_staff = (p.commission_per_staff || []).map((line) => ({
      ...line,
      staff_name: line.staff_name || staffNameById.get(Number(line.staff_id)) || p.staff?.name || null,
    }));
  }
  return list;
}

module.exports = { enrichPaymentsForView, collectPaymentServiceIds };
