'use strict';
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');
const { slToday } = require('../utils/dateUtils');
const { withSessionsRemaining, hasSessionsLeft, getSessionsRemaining } = require('../utils/customerPackageHelpers');

function packageHasDiscount(pkg) {
  if (!pkg) return false;
  const original = Number(pkg.original_price || 0);
  const price = Number(pkg.package_price || 0);
  const discPct = Number(pkg.discount_percent || 0);
  if (discPct > 0) return true;
  return original > 0 && price < original;
}

function packageIsBookable(pkg) {
  if (!pkg || pkg.is_active === false) return false;
  const price = Number(pkg.package_price || 0);
  if (!(price > 0)) return false;
  const svc = pkg.services || [];
  return Array.isArray(svc) && svc.length > 0;
}

/** Sold customer packages redeemable at payment — no price/discount requirement. */
function packageIsRedeemable(pkg) {
  if (!pkg) return false;
  const svc = normalizePackageServices(pkg.services);
  return svc.length > 0;
}

function normalizePackageServices(services) {
  if (Array.isArray(services)) return services.map(Number).filter(Boolean);
  if (typeof services === 'string') {
    try {
      const parsed = JSON.parse(services);
      return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function enrichCustomerPackageRow(cp) {
  const json = withSessionsRemaining(cp);
  if (json.package) {
    json.package.services = normalizePackageServices(json.package.services);
  } else if (json.package_id) {
    json.package = {
      id: json.package_id,
      name: `Package #${json.package_id}`,
      services: [],
      package_price: json.amount_paid,
    };
  }
  return json;
}

async function findCustomerForTenant(req, customerId) {
  const { Customer } = require('../models');
  const tenantId = resolveTenantId(req);
  const where = { id: customerId };
  if (tenantId) {
    where[Op.or] = [{ tenant_id: tenantId }, { tenant_id: null }];
  }
  return Customer.findOne({
    where,
    attributes: ['id'],
  });
}

async function resolveOriginalPriceFromServices(req, serviceIds, fallbackPrice, transaction) {
  const { Service } = require('../models');
  const ids = (serviceIds || []).map(Number).filter(Boolean);
  if (!ids.length) return Number(fallbackPrice || 0);
  const rows = await Service.findAll({
    where: { id: ids, ...tenantWhere(req) },
    attributes: ['id', 'price'],
    ...(transaction ? { transaction } : {}),
  });
  const sum = rows.reduce((total, row) => total + Number(row.price || 0), 0);
  return sum > 0 ? sum : Number(fallbackPrice || 0);
}

// ── PACKAGE TEMPLATES ─────────────────────────────────────────────────────────

const list = async (req, res) => {
  try {
    const { Package, Branch, Service } = require('../models');
    const where = tenantWhere(req);
    if (req.query.activeOnly !== 'false') where.is_active = true;
    if (req.userBranchId) {
      where[Op.or] = [{ branch_id: req.userBranchId }, { branch_id: null }];
    } else if (req.query.branchId) {
      where[Op.or] = [{ branch_id: req.query.branchId }, { branch_id: null }];
    }

    const packages = await Package.findAll({
      where,
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
      order: [['name', 'ASC']],
    });

    // Resolve service details for each package
    const allServiceIds = [...new Set(packages.flatMap((p) => p.services || []))];
    const services = allServiceIds.length
      ? await Service.findAll({ where: { id: allServiceIds, ...tenantWhere(req) }, attributes: ['id', 'name', 'price', 'duration_minutes'] })
      : [];
    const svcMap = Object.fromEntries(services.map((s) => [s.id, s]));

    const result = packages.map((p) => ({
      ...p.toJSON(),
      serviceDetails: (p.services || []).map((id) => svcMap[id]).filter(Boolean),
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const getOne = async (req, res) => {
  try {
    const { Package, Branch, Service } = require('../models');
    const pkg = await Package.findOne({
      where: byIdWhere(req, req.params.id),
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });

    // Resolve service IDs to full service objects
    const serviceIds = pkg.services || [];
    const services = serviceIds.length
      ? await Service.findAll({ where: { id: serviceIds, ...tenantWhere(req) }, attributes: ['id', 'name', 'price', 'duration_minutes'] })
      : [];

    return res.json({ ...pkg.toJSON(), serviceDetails: services });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const create = async (req, res) => {
  try {
    const { Package } = require('../models');
    const {
      name, description, type, services, sessions_count,
      validity_days, original_price, package_price, branch_id,
      show_as_offer, offer_title, offer_note,
    } = req.body;

    if (!name || !type || !services?.length || !validity_days || package_price == null || package_price === '') {
      return res.status(400).json({ message: 'name, type, services, validity_days, and package_price are required.' });
    }

    const packagePrice = Number(package_price);
    if (!Number.isFinite(packagePrice) || packagePrice < 0) {
      return res.status(400).json({ message: 'package_price must be a valid number.' });
    }

    const origPrice = Number(original_price) > 0
      ? Number(original_price)
      : await resolveOriginalPriceFromServices(req, services, packagePrice);

    const discount_percent = origPrice > 0
      ? (((origPrice - packagePrice) / origPrice) * 100).toFixed(2)
      : 0;

    const pkg = await Package.create({
      name, description, type, services,
      sessions_count: sessions_count || null,
      validity_days,
      original_price: origPrice, package_price: packagePrice, discount_percent,
      show_as_offer: show_as_offer !== false,
      offer_title: offer_title ? String(offer_title).slice(0, 160) : null,
      offer_note: offer_note ? String(offer_note).slice(0, 4000) : null,
      branch_id: branch_id || null,
      is_active: true,
      tenant_id: resolveTenantId(req),
    });

    return res.status(201).json(pkg);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const update = async (req, res) => {
  try {
    const { Package } = require('../models');
    const pkg = await Package.findOne({ where: byIdWhere(req, req.params.id) });
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });

    const {
      name, description, type, services, sessions_count,
      validity_days, original_price, package_price, branch_id, is_active,
      show_as_offer, offer_title, offer_note,
    } = req.body;

    const pkgPrice = package_price != null ? Number(package_price) : Number(pkg.package_price);
    const origPrice = original_price != null && Number(original_price) > 0
      ? Number(original_price)
      : await resolveOriginalPriceFromServices(req, services ?? pkg.services, pkgPrice);
    const discount_percent = origPrice > 0
      ? (((origPrice - pkgPrice) / origPrice) * 100).toFixed(2)
      : pkg.discount_percent;

    const patch = {
      name:             name           ?? pkg.name,
      description:      description    ?? pkg.description,
      type:             type           ?? pkg.type,
      services:         services       ?? pkg.services,
      sessions_count:   sessions_count ?? pkg.sessions_count,
      validity_days:    validity_days  ?? pkg.validity_days,
      original_price:   origPrice,
      package_price:    pkgPrice,
      discount_percent,
      branch_id:        branch_id !== undefined ? (branch_id || null) : pkg.branch_id,
      is_active:        is_active !== undefined ? is_active : pkg.is_active,
    };
    if (show_as_offer !== undefined) patch.show_as_offer = !!show_as_offer;
    if (offer_title !== undefined) {
      patch.offer_title = offer_title ? String(offer_title).slice(0, 160) : null;
    }
    if (offer_note !== undefined) {
      patch.offer_note = offer_note ? String(offer_note).slice(0, 4000) : null;
    }

    await pkg.update(patch);

    return res.json(pkg);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const { Package } = require('../models');
    const pkg = await Package.findOne({ where: byIdWhere(req, req.params.id) });
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });
    await pkg.update({ is_active: false });
    return res.json({ message: 'Package deactivated.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── CUSTOMER PACKAGES ─────────────────────────────────────────────────────────

const customerPackages = async (req, res) => {
  try {
    const { CustomerPackage, Package, Branch } = require('../models');
    const customerId = req.params.customerId;
    const customer = await findCustomerForTenant(req, customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });

    const rows = await CustomerPackage.findAll({
      where: { customer_id: customerId },
      include: [
        {
          model: Package,
          as: 'package',
          attributes: ['id', 'name', 'type', 'services', 'package_price', 'original_price', 'discount_percent', 'is_active'],
          required: false,
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
      order: [['purchase_date', 'DESC']],
    });

    // Auto-expire overdue packages + mark session-exhausted as completed
    const today = slToday();
    const expiredIds = rows
      .filter((cp) => cp.status === 'active' && cp.expiry_date < today)
      .map((cp) => cp.id);
    if (expiredIds.length) {
      const { CustomerPackage: CP } = require('../models');
      await CP.update({ status: 'expired' }, { where: { id: expiredIds } });
      expiredIds.forEach((id) => {
        const cp = rows.find((r) => r.id === id);
        if (cp) cp.status = 'expired';
      });
    }
    const exhaustedIds = rows
      .filter((cp) => cp.status === 'active' && !hasSessionsLeft(cp))
      .map((cp) => cp.id);
    if (exhaustedIds.length) {
      const { CustomerPackage: CP } = require('../models');
      await CP.update({ status: 'completed' }, { where: { id: exhaustedIds } });
      exhaustedIds.forEach((id) => {
        const cp = rows.find((r) => r.id === id);
        if (cp) cp.status = 'completed';
      });
    }

    return res.json(rows.map((cp) => enrichCustomerPackageRow(cp)));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const activePackages = async (req, res) => {
  try {
    const { CustomerPackage, Package, Branch } = require('../models');
    const customerId = req.params.customerId;
    const customer = await findCustomerForTenant(req, customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });

    const today = slToday();

    const rows = await CustomerPackage.findAll({
      where: {
        customer_id: customerId,
        status: 'active',
        expiry_date: { [Op.gte]: today },
      },
      include: [
        {
          model: Package,
          as: 'package',
          attributes: ['id', 'name', 'type', 'services', 'package_price', 'original_price', 'discount_percent', 'is_active'],
          required: false,
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
      ],
      order: [['expiry_date', 'ASC'], ['purchase_date', 'DESC']],
    });

    const exhaustedIds = rows.filter((cp) => !hasSessionsLeft(cp)).map((cp) => cp.id);
    if (exhaustedIds.length) {
      await CustomerPackage.update({ status: 'completed' }, { where: { id: exhaustedIds } });
    }

    const active = rows
      .filter((cp) => hasSessionsLeft(cp))
      .map((cp) => enrichCustomerPackageRow(cp));
    return res.json(active);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const purchase = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { Package, CustomerPackage, Customer } = require('../models');
    const customerId    = req.body.customerId    || req.body.customer_id;
    const packageId     = req.body.packageId     || req.body.package_id;
    const branchId      = req.body.branchId      || req.body.branch_id;
    const paymentMethod = req.body.paymentMethod || req.body.payment_method;
    const notes         = req.body.notes;

    if (!customerId || !packageId) {
      await t.rollback();
      return res.status(400).json({ message: 'customerId and packageId are required.' });
    }

    const pkg = await Package.findOne({ where: byIdWhere(req, packageId), transaction: t });
    if (!pkg || !pkg.is_active) {
      await t.rollback();
      return res.status(404).json({ message: 'Package not found or inactive.' });
    }

    const effectiveBranchId = branchId || pkg.branch_id || req.userBranchId;

    const customer = await Customer.findOne({ where: byIdWhere(req, customerId), transaction: t });
    if (!customer) {
      await t.rollback();
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const today      = slToday();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + pkg.validity_days);

    const cp = await CustomerPackage.create({
      customer_id:    customerId,
      package_id:     packageId,
      branch_id:      effectiveBranchId,
      purchase_date:  today,
      expiry_date:    expiryDate.toISOString().slice(0, 10),
      // 0 sessions means unlimited (membership).
      sessions_total: pkg.sessions_count || 0,
      sessions_used:  0,
      status:         'active',
      amount_paid:    pkg.package_price,
      payment_method: paymentMethod || null,
      notes:          notes || null,
      tenant_id:      resolveTenantId(req),
    }, { transaction: t });

    await t.commit();

    // Re-fetch with includes
    const result = await CustomerPackage.findOne({
      where: byIdWhere(req, cp.id),
      include: [
        { model: Package,  as: 'package', attributes: ['id', 'name', 'type', 'services', 'validity_days'] },
        {
          model: require('../models').Branch,
          as: 'branch',
          attributes: ['id', 'name'],
        },
      ],
    });

    return res.status(201).json(result);
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const redeem = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { CustomerPackage, PackageRedemption, Package } = require('../models');
    const { customerPackageId, serviceId, appointmentId, staffId, notes } = req.body;

    if (!customerPackageId || !serviceId) {
      await t.rollback();
      return res.status(400).json({ message: 'customerPackageId and serviceId are required.' });
    }

    const cp = await CustomerPackage.findOne({
      where: byIdWhere(req, customerPackageId),
      include: [{ model: Package, as: 'package' }],
      transaction: t,
    });

    if (!cp) {
      await t.rollback();
      return res.status(404).json({ message: 'Customer package not found.' });
    }

    // Validate active
    if (cp.status !== 'active') {
      await t.rollback();
      return res.status(400).json({ message: `Package is ${cp.status}. Cannot redeem.` });
    }

    // Validate not expired
    const today = slToday();
    if (cp.expiry_date < today) {
      await cp.update({ status: 'expired' }, { transaction: t });
      await t.commit();
      return res.status(400).json({ message: 'Package has expired.' });
    }

    // Validate sessions remaining (null = unlimited membership, skip check)
    const sessionsLeft = getSessionsRemaining(cp);
    if (sessionsLeft !== null && sessionsLeft <= 0) {
      await cp.update({ status: 'completed' }, { transaction: t });
      await t.commit();
      return res.status(400).json({ message: 'No sessions remaining.' });
    }

    // Validate service is part of package
    const allowedServices = cp.package?.services || [];
    if (!allowedServices.includes(serviceId) && !allowedServices.includes(String(serviceId))) {
      await t.rollback();
      return res.status(400).json({ message: 'This service is not included in the package.' });
    }

    // Create redemption
    await PackageRedemption.create({
      customer_package_id: customerPackageId,
      appointment_id:      appointmentId || null,
      payment_id:          null,
      service_id:          serviceId,
      redeemed_at:         new Date(),
      redeemed_by:         staffId || null,
      notes:               notes || null,
      tenant_id:           resolveTenantId(req),
    }, { transaction: t });

    // Increment sessions_used
    const newUsed = (cp.sessions_used || 0) + 1;
    const updates = { sessions_used: newUsed };
    // Only mark completed for bundles (sessions_total > 0); memberships (0) are unlimited
    if (cp.sessions_total > 0 && newUsed >= cp.sessions_total) updates.status = 'completed';
    await cp.update(updates, { transaction: t });

    await t.commit();

    // Re-fetch
    const result = await CustomerPackage.findOne({
      where: byIdWhere(req, customerPackageId),
      include: [
        { model: Package, as: 'package', attributes: ['id', 'name', 'type', 'services', 'package_price', 'original_price', 'discount_percent'] },
      ],
    });

    return res.json(result);
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── PURCHASE PACKAGE FOR ALL CUSTOMERS ──────────────────────────────────────

const purchaseForAllCustomers = async (req, res) => {
  try {
    const { Package, Customer, CustomerPackage } = require('../models');
    const packageId = req.body.packageId || req.body.package_id;
    const branchId = req.body.branchId || req.body.branch_id;
    const expiryMonths = req.body.expiryMonths ?? req.body.expiry_months ?? 12;
    const paymentMethod = req.body.paymentMethod || req.body.payment_method || null;
    const notes = req.body.notes || null;
    if (!packageId) return res.status(400).json({ message: 'packageId is required.' });

    const pkg = await Package.findOne({ where: byIdWhere(req, packageId) });
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });

    const where = tenantWhere(req);
    if (branchId) where.branch_id = branchId;
    else if (req.userBranchId) where.branch_id = req.userBranchId;

    const customers = await Customer.findAll({ where, attributes: ['id', 'branch_id'] });
    if (!customers.length) return res.status(404).json({ message: 'No customers found.' });

    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + parseInt(expiryMonths));
    const expiryStr = expiry.toISOString().slice(0, 10);
    const today = slToday();

    // Pre-fetch existing active assignments to avoid duplicates
    const existing = await CustomerPackage.findAll({
      where: { package_id: packageId, status: 'active', ...tenantWhere(req) },
      attributes: ['customer_id'],
    });
    const alreadyHas = new Set(existing.map((e) => e.customer_id));

    let created = 0;
    let skipped = 0;
    for (const c of customers) {
      if (alreadyHas.has(c.id)) { skipped++; continue; }
      await CustomerPackage.create({
        customer_id:    c.id,
        package_id:     packageId,
        branch_id:      c.branch_id || branchId || req.userBranchId,
        purchase_date:  today,
        expiry_date:    expiryStr,
        sessions_total: pkg.sessions_count || 0,
        sessions_used:  0,
        status:         'active',
        amount_paid:    pkg.package_price,
        payment_method: paymentMethod,
        notes:          notes,
        tenant_id:      resolveTenantId(req),
      });
      created++;
    }

    return res.json({ message: `Package assigned to ${created} customer(s). ${skipped} already had it.`, created, skipped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── LIST ALL CUSTOMER PACKAGES (admin view) ─────────────────────────────────

const listAllCustomerPackages = async (req, res) => {
  try {
    const { CustomerPackage, Package, Branch, Customer } = require('../models');
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const where = tenantWhere(req);

    if (req.query.status) where.status = req.query.status;
    if (req.query.branchId) where.branch_id = req.query.branchId;
    else if (req.userBranchId) where.branch_id = req.userBranchId;

    const { count, rows } = await CustomerPackage.findAndCountAll({
      where,
      include: [
        { model: Package,  as: 'package',  attributes: ['id', 'name', 'type'] },
        { model: Branch,   as: 'branch',   attributes: ['id', 'name'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
      ],
      order: [['purchase_date', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return res.json({ data: rows, total: count, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { list, getOne, create, update, remove, customerPackages, activePackages, purchase, purchaseForAllCustomers, redeem, listAllCustomerPackages };
