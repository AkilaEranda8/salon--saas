const { Service } = require('../models');

const list = async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(parseInt(req.query.limit) || 100, 200);
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.active !== undefined) where.is_active = req.query.active !== 'false';

    const { count, rows } = await Service.findAndCountAll({
      where,
      limit,
      offset,
      order: [['category', 'ASC'], ['name', 'ASC']],
    });

    return res.json({ total: count, page, limit, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const svc = await Service.findByPk(req.params.id);
    if (!svc) return res.status(404).json({ message: 'Service not found.' });
    return res.json(svc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { name, category, duration_minutes, price, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Service name is required.' });

    const svc = await Service.create({ name, category, duration_minutes, price, description });
    return res.status(201).json(svc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const svc = await Service.findByPk(req.params.id);
    if (!svc) return res.status(404).json({ message: 'Service not found.' });

    await svc.update(req.body);
    return res.json(svc);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const svc = await Service.findByPk(req.params.id);
    if (!svc) return res.status(404).json({ message: 'Service not found.' });

    await svc.destroy();
    return res.json({ message: 'Service deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const categories = async (req, res) => {
  try {
    const { fn, col } = require('sequelize');
    const rows = await Service.findAll({
      attributes: [
        'category',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { category: { [require('sequelize').Op.ne]: null } },
      group: ['category'],
      order: [['category', 'ASC']],
      raw: true,
    });
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const renameCategory = async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ message: 'oldName and newName are required.' });
    const [affected] = await Service.update({ category: newName }, { where: { category: oldName } });
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
    const [affected] = await Service.update({ category: 'Other' }, { where: { category: name } });
    return res.json({ message: `${affected} service(s) moved to Other.`, affected });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, categories, renameCategory, deleteCategory };
