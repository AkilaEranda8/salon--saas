/**
 * Platform parity controllers — announcements, releases, feature suggestions, master catalog.
 * Mirrors Hexalyte Enterprise admin capabilities for Salon.
 */
const { Op } = require('sequelize');
const PlatformAnnouncement = require('../models/PlatformAnnouncement');
const { PlatformRelease, PlatformReleaseItem } = require('../models/PlatformRelease');
const { FeatureSuggestion, FeatureSuggestionHistory } = require('../models/FeatureSuggestion');
const { MasterCatalogCategory, MasterCatalogItem } = require('../models/MasterCatalog');

async function ensureTables() {
  await Promise.all([
    PlatformAnnouncement.sync({ alter: true }),
    PlatformRelease.sync({ alter: true }),
    PlatformReleaseItem.sync({ alter: true }),
    FeatureSuggestion.sync({ alter: true }),
    FeatureSuggestionHistory.sync({ alter: true }),
    MasterCatalogCategory.sync({ alter: true }),
    MasterCatalogItem.sync({ alter: true }),
  ]);
}

// ── Announcements ────────────────────────────────────────────────────────────
const listAnnouncements = async (_req, res) => {
  try {
    await ensureTables();
    const rows = await PlatformAnnouncement.findAll({ order: [['createdAt', 'DESC']] });
    return res.json(rows);
  } catch (err) {
    console.error('parity.listAnnouncements', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createAnnouncement = async (req, res) => {
  try {
    await ensureTables();
    const {
      title, body, type = 'INFO', target = 'ALL', target_tenants = [],
      dismissible = true, scheduled_at, sendNow = false,
    } = req.body || {};
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ message: 'title and body are required.' });
    }
    const row = await PlatformAnnouncement.create({
      title: title.trim(),
      body: body.trim(),
      type,
      target,
      target_tenants,
      dismissible,
      scheduled_at: scheduled_at || null,
      status: sendNow ? 'SENT' : 'DRAFT',
      sent_at: sendNow ? new Date() : null,
      created_by: req.user?.email || req.user?.username || 'Admin',
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('parity.createAnnouncement', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    await ensureTables();
    const row = await PlatformAnnouncement.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const allowed = ['title', 'body', 'type', 'target', 'target_tenants', 'dismissible', 'status', 'scheduled_at'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) row[key] = req.body[key];
    }
    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('parity.updateAnnouncement', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const sendAnnouncement = async (req, res) => {
  try {
    await ensureTables();
    const row = await PlatformAnnouncement.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found.' });
    row.status = 'SENT';
    row.sent_at = new Date();
    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('parity.sendAnnouncement', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    await ensureTables();
    const n = await PlatformAnnouncement.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ message: 'Not found.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('parity.deleteAnnouncement', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Releases ─────────────────────────────────────────────────────────────────
const listReleases = async (req, res) => {
  try {
    await ensureTables();
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const rows = await PlatformRelease.findAll({
      where,
      include: [{ model: PlatformReleaseItem, as: 'items' }],
      order: [['release_date', 'DESC']],
    });
    return res.json(rows);
  } catch (err) {
    console.error('parity.listReleases', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getRelease = async (req, res) => {
  try {
    await ensureTables();
    const row = await PlatformRelease.findByPk(req.params.id, {
      include: [{ model: PlatformReleaseItem, as: 'items' }],
    });
    if (!row) return res.status(404).json({ message: 'Not found.' });
    return res.json(row);
  } catch (err) {
    console.error('parity.getRelease', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createRelease = async (req, res) => {
  try {
    await ensureTables();
    const b = req.body || {};
    if (!b.version?.trim() || !b.title?.trim() || !b.summary?.trim()) {
      return res.status(400).json({ message: 'version, title, summary required.' });
    }
    const release = await PlatformRelease.create({
      version: b.version.trim(),
      title: b.title.trim(),
      summary: b.summary.trim(),
      release_date: b.release_date || b.releaseDate || new Date(),
      status: 'DRAFT',
      popup_enabled: b.popup_enabled ?? b.popupEnabled ?? true,
      active: b.active ?? true,
      target_type: b.target_type || b.targetType || 'ALL',
      target_plans: b.target_plans || b.targetPlans || [],
      target_tenants: b.target_tenants || b.targetTenants || [],
      image_url: b.image_url || b.imageUrl || null,
      video_url: b.video_url || b.videoUrl || null,
      doc_url: b.doc_url || b.docUrl || null,
      created_by: req.user?.email || req.user?.username || 'Admin',
    });
    const items = Array.isArray(b.items) ? b.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await PlatformReleaseItem.create({
        release_id: release.id,
        category: it.category || 'FEATURE',
        module: it.module || null,
        feature_name: it.feature_name || it.featureName || '',
        description: it.description || '',
        badge: it.badge || null,
        display_order: it.display_order ?? it.displayOrder ?? i,
      });
    }
    const full = await PlatformRelease.findByPk(release.id, {
      include: [{ model: PlatformReleaseItem, as: 'items' }],
    });
    return res.status(201).json(full);
  } catch (err) {
    console.error('parity.createRelease', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateRelease = async (req, res) => {
  try {
    await ensureTables();
    const release = await PlatformRelease.findByPk(req.params.id);
    if (!release) return res.status(404).json({ message: 'Not found.' });
    const b = req.body || {};
    const map = {
      version: b.version,
      title: b.title,
      summary: b.summary,
      release_date: b.release_date || b.releaseDate,
      status: b.status,
      popup_enabled: b.popup_enabled ?? b.popupEnabled,
      active: b.active,
      target_type: b.target_type || b.targetType,
      target_plans: b.target_plans || b.targetPlans,
      target_tenants: b.target_tenants || b.targetTenants,
      image_url: b.image_url ?? b.imageUrl,
      video_url: b.video_url ?? b.videoUrl,
      doc_url: b.doc_url ?? b.docUrl,
    };
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined) release[k] = v;
    }
    await release.save();

    if (Array.isArray(b.items)) {
      await PlatformReleaseItem.destroy({ where: { release_id: release.id } });
      for (let i = 0; i < b.items.length; i++) {
        const it = b.items[i];
        await PlatformReleaseItem.create({
          release_id: release.id,
          category: it.category || 'FEATURE',
          module: it.module || null,
          feature_name: it.feature_name || it.featureName || '',
          description: it.description || '',
          badge: it.badge || null,
          display_order: it.display_order ?? it.displayOrder ?? i,
        });
      }
    }

    const full = await PlatformRelease.findByPk(release.id, {
      include: [{ model: PlatformReleaseItem, as: 'items' }],
    });
    return res.json(full);
  } catch (err) {
    console.error('parity.updateRelease', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const publishRelease = async (req, res) => {
  try {
    await ensureTables();
    const release = await PlatformRelease.findByPk(req.params.id, {
      include: [{ model: PlatformReleaseItem, as: 'items' }],
    });
    if (!release) return res.status(404).json({ message: 'Not found.' });
    release.status = 'PUBLISHED';
    release.active = true;
    await release.save();
    return res.json(release);
  } catch (err) {
    console.error('parity.publishRelease', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteRelease = async (req, res) => {
  try {
    await ensureTables();
    const n = await PlatformRelease.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ message: 'Not found.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('parity.deleteRelease', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Feature suggestions ──────────────────────────────────────────────────────
const suggestionsSummary = async (_req, res) => {
  try {
    await ensureTables();
    const statuses = ['NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'];
    const counts = {};
    let total = 0;
    for (const s of statuses) {
      counts[s] = await FeatureSuggestion.count({ where: { status: s } });
      total += counts[s];
    }
    return res.json({
      total,
      new: counts.NEW,
      underReview: counts.UNDER_REVIEW,
      planned: counts.PLANNED,
      inProgress: counts.IN_PROGRESS,
      done: counts.DONE,
      declined: counts.DECLINED,
    });
  } catch (err) {
    console.error('parity.suggestionsSummary', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const listSuggestions = async (req, res) => {
  try {
    await ensureTables();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.priority) where.priority = req.query.priority;
    if (req.query.search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${req.query.search}%` } },
        { description: { [Op.like]: `%${req.query.search}%` } },
        { category: { [Op.like]: `%${req.query.search}%` } },
      ];
    }
    const { count, rows } = await FeatureSuggestion.findAndCountAll({
      where,
      include: [{ model: FeatureSuggestionHistory, as: 'history', limit: 10, separate: true, order: [['createdAt', 'DESC']] }],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit,
      limit,
    });
    return res.json({ data: rows, total: count, page, limit });
  } catch (err) {
    console.error('parity.listSuggestions', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getSuggestion = async (req, res) => {
  try {
    await ensureTables();
    const row = await FeatureSuggestion.findByPk(req.params.id, {
      include: [{ model: FeatureSuggestionHistory, as: 'history' }],
    });
    if (!row) return res.status(404).json({ message: 'Not found.' });
    return res.json(row);
  } catch (err) {
    console.error('parity.getSuggestion', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateSuggestion = async (req, res) => {
  try {
    await ensureTables();
    const row = await FeatureSuggestion.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const actor = req.user?.email || req.user?.username || 'Admin';
    const { status, priority, public_response, publicResponse, internal_note, internalNote } = req.body || {};
    const nextPublic = public_response ?? publicResponse;
    const nextNote = internal_note ?? internalNote;

    if (status && status !== row.status) {
      await FeatureSuggestionHistory.create({
        suggestion_id: row.id,
        action: 'STATUS_CHANGED',
        old_status: row.status,
        new_status: status,
        performed_by_email: actor,
      });
      row.status = status;
    }
    if (priority && priority !== row.priority) {
      await FeatureSuggestionHistory.create({
        suggestion_id: row.id,
        action: 'PRIORITY_CHANGED',
        old_priority: row.priority,
        new_priority: priority,
        performed_by_email: actor,
      });
      row.priority = priority;
    }
    if (nextPublic !== undefined && nextPublic !== row.public_response) {
      await FeatureSuggestionHistory.create({
        suggestion_id: row.id,
        action: 'RESPONSE_UPDATED',
        public_response: nextPublic,
        performed_by_email: actor,
      });
      row.public_response = nextPublic;
      row.responded_by_email = actor;
      row.responded_at = new Date();
    }
    if (nextNote !== undefined && nextNote !== row.internal_note) {
      await FeatureSuggestionHistory.create({
        suggestion_id: row.id,
        action: 'NOTE_UPDATED',
        performed_by_email: actor,
      });
      row.internal_note = nextNote;
    }
    await row.save();
    const full = await FeatureSuggestion.findByPk(row.id, {
      include: [{ model: FeatureSuggestionHistory, as: 'history' }],
    });
    return res.json(full);
  } catch (err) {
    console.error('parity.updateSuggestion', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createSuggestion = async (req, res) => {
  try {
    await ensureTables();
    const { category, title, description, priority = 'MEDIUM', tenant_id } = req.body || {};
    if (!category?.trim() || !title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'category, title, description required.' });
    }
    const tenantId = tenant_id || req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ message: 'tenant_id required.' });
    const actor = req.user?.email || req.user?.username || 'Admin';
    const row = await FeatureSuggestion.create({
      tenant_id: tenantId,
      submitted_by: req.user?.id || null,
      category: category.trim(),
      title: title.trim(),
      description: description.trim(),
      priority,
    });
    await FeatureSuggestionHistory.create({
      suggestion_id: row.id,
      action: 'CREATED',
      new_status: 'NEW',
      new_priority: priority,
      performed_by_email: actor,
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('parity.createSuggestion', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Master catalog ───────────────────────────────────────────────────────────
const listCatalogCategories = async (_req, res) => {
  try {
    await ensureTables();
    const rows = await MasterCatalogCategory.findAll({
      include: [{ model: MasterCatalogItem, as: 'items' }],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });
    return res.json(rows);
  } catch (err) {
    console.error('parity.listCatalogCategories', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createCatalogCategory = async (req, res) => {
  try {
    await ensureTables();
    const { name, slug, kind = 'SERVICE', is_active = true, sort_order = 0 } = req.body || {};
    if (!name?.trim() || !slug?.trim()) {
      return res.status(400).json({ message: 'name and slug required.' });
    }
    const row = await MasterCatalogCategory.create({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      kind,
      is_active,
      sort_order,
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('parity.createCatalogCategory', err);
    return res.status(500).json({ message: err.message || 'Server error.' });
  }
};

const updateCatalogCategory = async (req, res) => {
  try {
    await ensureTables();
    const row = await MasterCatalogCategory.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found.' });
    for (const key of ['name', 'slug', 'kind', 'is_active', 'sort_order']) {
      if (req.body[key] !== undefined) row[key] = req.body[key];
    }
    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('parity.updateCatalogCategory', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteCatalogCategory = async (req, res) => {
  try {
    await ensureTables();
    const n = await MasterCatalogCategory.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ message: 'Not found.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('parity.deleteCatalogCategory', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const createCatalogItem = async (req, res) => {
  try {
    await ensureTables();
    const b = req.body || {};
    if (!b.category_id || !b.name?.trim()) {
      return res.status(400).json({ message: 'category_id and name required.' });
    }
    const row = await MasterCatalogItem.create({
      category_id: b.category_id,
      name: b.name.trim(),
      description: b.description || null,
      duration_minutes: b.duration_minutes ?? b.durationMinutes ?? null,
      default_price: b.default_price ?? b.defaultPrice ?? null,
      currency: b.currency || 'LKR',
      is_active: b.is_active ?? true,
      metadata: b.metadata || {},
    });
    return res.status(201).json(row);
  } catch (err) {
    console.error('parity.createCatalogItem', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const updateCatalogItem = async (req, res) => {
  try {
    await ensureTables();
    const row = await MasterCatalogItem.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const b = req.body || {};
    const map = {
      name: b.name,
      description: b.description,
      duration_minutes: b.duration_minutes ?? b.durationMinutes,
      default_price: b.default_price ?? b.defaultPrice,
      currency: b.currency,
      is_active: b.is_active ?? b.isActive,
      metadata: b.metadata,
      category_id: b.category_id,
    };
    for (const [k, v] of Object.entries(map)) {
      if (v !== undefined) row[k] = v;
    }
    await row.save();
    return res.json(row);
  } catch (err) {
    console.error('parity.updateCatalogItem', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const deleteCatalogItem = async (req, res) => {
  try {
    await ensureTables();
    const n = await MasterCatalogItem.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ message: 'Not found.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('parity.deleteCatalogItem', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  sendAnnouncement,
  deleteAnnouncement,
  listReleases,
  getRelease,
  createRelease,
  updateRelease,
  publishRelease,
  deleteRelease,
  suggestionsSummary,
  listSuggestions,
  getSuggestion,
  updateSuggestion,
  createSuggestion,
  listCatalogCategories,
  createCatalogCategory,
  updateCatalogCategory,
  deleteCatalogCategory,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
};
