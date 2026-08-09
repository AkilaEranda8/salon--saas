const { Op } = require('sequelize');
const MobileOffer = require('../models/MobileOffer');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const list = async (req, res) => {
  try {
    const where = tenantWhere(req);
    if (req.query.published === '1') where.is_published = true;
    if (req.query.published === '0') where.is_published = false;

    const rows = await MobileOffer.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 100, 200),
    });
    return res.json({ data: rows });
  } catch (err) {
    console.error('mobileOffers.list error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const row = await MobileOffer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Offer not found.' });
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant context required.' });

    const {
      title, body, image_url, category, badge_text,
      original_price, offer_price, starts_at, ends_at, is_published,
    } = req.body || {};
    if (!String(title || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ message: 'title and body are required.' });
    }

    const row = await MobileOffer.create({
      tenant_id: tenantId,
      title: String(title).trim(),
      body: String(body).trim(),
      image_url: image_url ? String(image_url).trim() : null,
      category: category ? String(category).trim() : null,
      badge_text: badge_text ? String(badge_text).trim() : null,
      original_price: original_price === '' || original_price == null ? null : Number(original_price),
      offer_price: offer_price === '' || offer_price == null ? null : Number(offer_price),
      starts_at: starts_at || null,
      ends_at: ends_at || null,
      is_published: !!is_published,
      created_by: req.user?.id || null,
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('mobileOffers.create error:', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const row = await MobileOffer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Offer not found.' });

    const allowed = [
      'title', 'body', 'image_url', 'category', 'badge_text',
      'original_price', 'offer_price', 'starts_at', 'ends_at', 'is_published',
    ];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (updates.title != null) updates.title = String(updates.title).trim();
    if (updates.body != null) updates.body = String(updates.body).trim();
    if (updates.image_url === '') updates.image_url = null;
    if (updates.category === '') updates.category = null;
    if (updates.badge_text === '') updates.badge_text = null;
    if (updates.original_price === '') updates.original_price = null;
    if (updates.offer_price === '') updates.offer_price = null;

    await row.update(updates);
    return res.json(row);
  } catch (err) {
    console.error('mobileOffers.update error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const row = await MobileOffer.findOne({ where: byIdWhere(req, req.params.id) });
    if (!row) return res.status(404).json({ message: 'Offer not found.' });
    await row.destroy();
    return res.json({ message: 'Offer deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error.' });
  }
};

/** Public catalog: published + within date window for tenant. */
const listPublic = async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? parseInt(req.query.tenantId, 10) : null;
    if (!tenantId) return res.status(400).json({ message: 'tenantId is required.' });

    const today = new Date().toISOString().slice(0, 10);
    const rows = await MobileOffer.findAll({
      where: {
        tenant_id: tenantId,
        is_published: true,
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: today } }] },
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: today } }] },
        ],
      },
      attributes: [
        'id', 'title', 'body', 'image_url', 'category', 'badge_text',
        'original_price', 'offer_price', 'starts_at', 'ends_at', 'createdAt',
      ],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    return res.json(rows);
  } catch (err) {
    console.error('mobileOffers.listPublic error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, listPublic };
