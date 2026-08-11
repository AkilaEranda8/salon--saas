'use strict';

const { Op, fn, col, where: sqlWhere } = require('sequelize');
const { tenantWhere } = require('./tenantScope');

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function phoneCore(phone) {
  let digits = phoneDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('94') && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length >= 9) digits = digits.slice(1);
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

async function findCustomerByPhone(req, phone, { transaction } = {}) {
  const core = phoneCore(phone);
  if (!core || core.length < 9) return null;
  const { Customer } = require('../models');
  const phoneNorm = fn(
    'REPLACE',
    fn('REPLACE', fn('REPLACE', col('phone'), ' ', ''), '-', ''),
    '+',
    '',
  );
  return Customer.findOne({
    where: {
      ...tenantWhere(req),
      [Op.or]: [
        sqlWhere(phoneNorm, { [Op.like]: `%${core}` }),
        { phone: { [Op.like]: `%${core}` } },
      ],
    },
    order: [['id', 'DESC']],
    transaction,
  });
}

async function resolveCustomerId(req, { customerId, phone, appointment } = {}, opts = {}) {
  const explicit = Number(customerId);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const fromAppt = Number(appointment?.customer_id);
  if (Number.isInteger(fromAppt) && fromAppt > 0) return fromAppt;
  const found = await findCustomerByPhone(req, phone || appointment?.phone, opts);
  return found?.id ? Number(found.id) : null;
}

module.exports = {
  phoneCore,
  findCustomerByPhone,
  resolveCustomerId,
};
