'use strict';
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// ── PACKAGE TEMPLATES ─────────────────────────────────────────────────────────

const list = async (req, res) => {
  try {
    const { Package, Branch, Service } = require('../models');
    const where = {};
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
      ? await Service.findAll({ where: { id: allServiceIds }, attributes: ['id', 'name', 'price', 'duration_minutes'] })
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
    const pkg = await Package.findByPk(req.params.id, {
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });

    // Resolve service IDs to full service objects
    const serviceIds = pkg.services || [];
    const services = serviceIds.length
      ? await Service.findAll({ where: { id: serviceIds }, attributes: ['id', 'name', 'price', 'duration_minutes'] })
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
    } = req.body;

    if (!name || !type || !services?.length || !validity_days || !original_price || !package_price) {
      return res.status(400).json({ message: 'name, type, services, validity_days, original_price, and package_price are required.' });
    }

    const discount_percent = original_price > 0
      ? (((original_price - package_price) / original_price) * 100).toFixed(2)
      : 0;

    const pkg = await Package.create({
      name, description, type, services,
      sessions_count: sessions_count || null,
      validity_days,
      original_price, package_price, discount_percent,
      branch_id: branch_id || null,
      is_active: true,
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
    const pkg = await Package.findByPk(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });

    const {
      name, description, type, services, sessions_count,
      validity_days, original_price, package_price, branch_id, is_active,
    } = req.body;

    const origPrice = original_price ?? pkg.original_price;
    const pkgPrice  = package_price  ?? pkg.package_price;
    const discount_percent = origPrice > 0
      ? (((origPrice - pkgPrice) / origPrice) * 100).toFixed(2)
      : pkg.discount_percent;

    await pkg.update({
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
    });

    return res.json(pkg);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const remove = async (req, res) => {
  try {
    const { Package } = require('../models');
    const pkg = await Package.findByPk(req.params.id);
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
    const rows = await CustomerPackage.findAll({
      where: { customer_id: req.params.customerId },
      include: [
        { model: Package, as: 'package', attributes: ['id', 'name', 'type', 'services'] },
        { model: Branch,  as: 'branch',  attributes: ['id', 'name'] },
      ],
      order: [['purchase_date', 'DESC']],
    });

    // Auto-expire overdue packages (single bulk update instead of N+1)
    const today = new Date().toISOString().slice(0, 10);
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

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

const activePackages = async (req, res) => {
  try {
    const { CustomerPackage, Package, Branch } = require('../models');
    const today = new Date().toISOString().slice(0, 10);

    const rows = await CustomerPackage.findAll({
      where: {
        customer_id: req.params.customerId,
        status: 'active',
        expiry_date: { [Op.gte]: today },
      },
      include: [
        { model: Package, as: 'package', attributes: ['id', 'name', 'type', 'services', 'package_price', 'sessions_count'] },
        { model: Branch,  as: 'branch',  attributes: ['id', 'name'] },
      ],
      order: [['expiry_date', 'ASC']],
    });

    console.log(`[activePackages] customerId=${req.params.customerId} today=${today} rowsFound=${rows.length}`, rows.map(r=>({id:r.id,status:r.status,expiry:r.expiry_date,sessions_total:r.sessions_total,sessions_used:r.sessions_used})));
    // sessions_total null or 0 = unlimited (0 from old broken bulk-activate code)
    const active = rows.filter((cp) =>
      cp.sessions_total === null || cp.sessions_total === 0 || cp.sessions_remaining > 0
    );
    console.log(`[activePackages] after filter: ${active.length}`);
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

    const pkg = await Package.findByPk(packageId, { transaction: t });
    if (!pkg || !pkg.is_active) {
      await t.rollback();
      return res.status(404).json({ message: 'Package not found or inactive.' });
    }

    const effectiveBranchId = branchId || pkg.branch_id || req.userBranchId;

    const customer = await Customer.findByPk(customerId, { transaction: t });
    if (!customer) {
      await t.rollback();
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const today      = new Date().toISOString().slice(0, 10);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + pkg.validity_days);

    const cp = await CustomerPackage.create({
      customer_id:    customerId,
      package_id:     packageId,
      branch_id:      effectiveBranchId,
      purchase_date:  today,
      expiry_date:    expiryDate.toISOString().slice(0, 10),
      // null sessions_count means unlimited (membership) — keep null, not 0
      sessions_total: pkg.sessions_count ?? null,
      sessions_used:  0,
      status:         'active',
      amount_paid:    pkg.package_price,
      payment_method: paymentMethod || null,
      notes:          notes || null,
    }, { transaction: t });

    await t.commit();

    // Re-fetch with includes
    const result = await CustomerPackage.findByPk(cp.id, {
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

    const cp = await CustomerPackage.findByPk(customerPackageId, {
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
    const today = new Date().toISOString().slice(0, 10);
    if (cp.expiry_date < today) {
      await cp.update({ status: 'expired' }, { transaction: t });
      await t.commit();
      return res.status(400).json({ message: 'Package has expired.' });
    }

    // Validate sessions remaining
    if (cp.sessions_remaining <= 0) {
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
    }, { transaction: t });

    // Increment sessions_used
    const newUsed = (cp.sessions_used || 0) + 1;
    const updates = { sessions_used: newUsed };
    if (newUsed >= cp.sessions_total) updates.status = 'completed';
    await cp.update(updates, { transaction: t });

    await t.commit();

    // Re-fetch
    const result = await CustomerPackage.findByPk(customerPackageId, {
      include: [
        { model: Package, as: 'package', attributes: ['id', 'name', 'type', 'services'] },
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
    const packageId     = req.body.packageId     || req.body.package_id;
    const branchId      = req.body.branchId      || req.body.branch_id;
    const paymentMethod = req.body.paymentMethod || req.body.payment_method || 'Cash';
    const notes         = req.body.notes || null;

    if (!packageId) return res.status(400).json({ message: 'packageId is required.' });

    const pkg = await Package.findByPk(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found.' });

    const where = {};
    if (branchId)              where.branch_id = branchId;
    else if (req.userBranchId) where.branch_id = req.userBranchId;
    // superadmin with no branch: no where clause → all customers across all branches

    const customers = await Customer.findAll({ where, attributes: ['id', 'branch_id'] });
    if (!customers.length) return res.status(404).json({ message: 'No customers found.' });

    const today  = new Date().toISOString().slice(0, 10);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (pkg.validity_days || 90));
    const expiryStr = expiry.toISOString().slice(0, 10);

    let created = 0;
    for (const c of customers) {
      await CustomerPackage.create({
        customer_id:    c.id,
        package_id:     packageId,
        branch_id:      c.branch_id || branchId || req.userBranchId,
        purchase_date:  today,
        expiry_date:    expiryStr,
        sessions_total: pkg.sessions_count ?? null,
        sessions_used:  0,
        status:         'active',
        amount_paid:    pkg.package_price,
        payment_method: paymentMethod,
        notes,
      });
      created++;
    }

    return res.json({ message: `Package activated for ${created} customer${created !== 1 ? 's' : ''}.`, created });
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
    const where = {};

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
