const { Op } = require('sequelize');
const { Service } = require('../models');
const { tenantWhere } = require('../utils/tenantScope');
const { hasTenantFeature, sanitizeServiceRecord } = require('../utils/tenantFeatures');

const mapService = (row, tenant) => sanitizeServiceRecord(row, tenant);

function parseServiceCommissionFields(body = {}, tenant) {
  if (!hasTenantFeature(tenant, 'service_wise_commission')) {
    return { commission_type: null, commission_value: null };
  }
  if (body.commission_value === '' || body.commission_value == null) {
    return { commission_type: null, commission_value: null };
  }
  const val = parseFloat(body.commission_value);
  if (Number.isNaN(val)) {
    return { commission_type: null, commission_value: null };
  }
  return {
    commission_type: ['percentage', 'fixed'].includes(body.commission_type)
      ? body.commission_type
      : 'percentage',
    commission_value: val,
  };
}

function buildServicePayload(body = {}, tenant) {
  const payload = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.category !== undefined) payload.category = body.category;
  if (body.subcategory !== undefined) {
    const raw = body.subcategory;
    payload.subcategory = raw == null || String(raw).trim() === ''
      ? null
      : String(raw).trim().slice(0, 100);
  }
  if (body.duration_minutes !== undefined) {
    const mins = parseInt(body.duration_minutes, 10);
    payload.duration_minutes = Number.isFinite(mins) && mins > 0 ? mins : 30;
  }
  if (body.price !== undefined) payload.price = body.price;
  if (body.description !== undefined) payload.description = body.description;
  if (body.is_active !== undefined) payload.is_active = body.is_active;
  if (body.available_online !== undefined) {
    payload.available_online = body.available_online === true
      || body.available_online === 'true'
      || body.available_online === 1
      || body.available_online === '1';
  }

  const commission = parseServiceCommissionFields(body, tenant);
  if (body.commission_type !== undefined || body.commission_value !== undefined) {
    payload.commission_type = commission.commission_type;
    payload.commission_value = commission.commission_value;
  }
  return payload;
}

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 100, 2000);
    const offset = (page - 1) * limit;

    const where = tenantWhere(req);
    if (req.query.category) where.category = req.query.category;
    if (req.query.subcategory) where.subcategory = req.query.subcategory;
    if (req.query.active !== undefined) where.is_active = req.query.active !== 'false';

    const q = String(req.query.search || req.query.q || '').trim();
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { category: { [Op.like]: `%${q}%` } },
        { subcategory: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }

    const { count, rows } = await Service.findAndCountAll({
      where,
      limit,
      offset,
      order: [['category', 'ASC'], ['subcategory', 'ASC'], ['name', 'ASC']],
    });

    return res.json({ total: count, page, limit, data: rows.map((row) => mapService(row, req.tenant)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const where = { ...tenantWhere(req), id: req.params.id };
    const svc = await Service.findOne({ where });
    if (!svc) return res.status(404).json({ message: 'Service not found.' });
    return res.json(mapService(svc, req.tenant));
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Service name is required.' });

    const tenantId = req.userTenantId ?? req.tenant?.id ?? null;
    const payload = buildServicePayload(req.body, req.tenant);
    if (payload.duration_minutes == null) {
      const mins = parseInt(req.body.duration_minutes, 10);
      payload.duration_minutes = Number.isFinite(mins) && mins > 0 ? mins : 30;
    }
    const svc = await Service.create({
      ...payload,
      name,
      tenant_id: tenantId,
    });
    return res.status(201).json(mapService(svc, req.tenant));
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const where = { ...tenantWhere(req), id: req.params.id };
    const svc = await Service.findOne({ where });
    if (!svc) return res.status(404).json({ message: 'Service not found.' });

    const payload = buildServicePayload(req.body, req.tenant);
    await svc.update(payload);
    await svc.reload();
    return res.json(mapService(svc, req.tenant));
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const where = { ...tenantWhere(req), id: req.params.id };
    const svc = await Service.findOne({ where });
    if (!svc) return res.status(404).json({ message: 'Service not found.' });

    await svc.destroy();
    return res.json({ message: 'Service deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const categories = async (req, res) => {
  try {
    const { fn, col, Op } = require('sequelize');
    const where = { ...tenantWhere(req), category: { [Op.ne]: null } };
    const rows = await Service.findAll({
      attributes: [
        'category',
        'subcategory',
        [fn('COUNT', col('id')), 'count'],
      ],
      where,
      group: ['category', 'subcategory'],
      order: [['category', 'ASC'], ['subcategory', 'ASC']],
      raw: true,
    });

    const byCat = new Map();
    for (const row of rows) {
      const cat = row.category;
      if (!cat) continue;
      if (!byCat.has(cat)) {
        byCat.set(cat, { category: cat, count: 0, subcategories: [] });
      }
      const entry = byCat.get(cat);
      const n = Number(row.count) || 0;
      entry.count += n;
      if (row.subcategory) {
        entry.subcategories.push({ name: row.subcategory, count: n });
      }
    }

    return res.json([...byCat.values()]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const renameCategory = async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ message: 'oldName and newName are required.' });
    const tenantFilter = tenantWhere(req);
    const [affected] = await Service.update({ category: newName }, { where: { ...tenantFilter, category: oldName } });
    return res.json({ message: `${affected} service(s) updated.`, affected });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required.' });
    const tenantFilter = tenantWhere(req);
    const [affected] = await Service.update({ category: 'Other' }, { where: { ...tenantFilter, category: name } });
    return res.json({ message: `${affected} service(s) moved to Other.`, affected });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, categories, renameCategory, deleteCategory };
