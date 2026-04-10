const { Router } = require('express');
const ctrl = require('../controllers/inventoryController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { branchAccess } = require('../middleware/branchAccess');
const { tenantWhere, byIdWhere, resolveTenantId } = require('../utils/tenantScope');

const router = Router();
router.use(verifyToken, branchAccess);

router.get('/low-stock',      ctrl.lowStock);

// Reorder management
router.get('/reorders', async (req, res) => {
  try {
    const { InventoryReorder, Inventory, Branch } = require('../models');
    const where = tenantWhere(req);
    if (req.userBranchId) where.branch_id = req.userBranchId;
    else if (req.query.branchId) where.branch_id = parseInt(req.query.branchId, 10);
    if (req.query.status) where.status = req.query.status;

    const rows = await InventoryReorder.findAll({
      where,
      include: [
        { model: Inventory, as: 'item',   attributes: ['id', 'name', 'category', 'unit', 'quantity', 'min_quantity'] },
        { model: Branch,    as: 'branch', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return res.json(rows);
  } catch (err) { return res.status(500).json({ message: 'Server error.' }); }
});

router.post('/reorders', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { InventoryReorder, Inventory } = require('../models');
    const { inventory_id, quantity_requested, supplier_name, supplier_contact, unit_cost, notes, branch_id } = req.body;
    if (!inventory_id || !quantity_requested) return res.status(400).json({ message: 'inventory_id and quantity_requested required.' });

    const effectiveBranchId = req.userBranchId || branch_id;
    const item = await Inventory.findByPk(inventory_id);
    if (!item) return res.status(404).json({ message: 'Inventory item not found.' });

    const total_cost = unit_cost ? Number(unit_cost) * Number(quantity_requested) : 0;
    const reorder = await InventoryReorder.create({
      tenant_id: resolveTenantId(req),
      inventory_id,
      branch_id: effectiveBranchId,
      quantity_requested,
      supplier_name,
      supplier_contact: supplier_contact || item.supplier_contact || null,
      unit_cost: unit_cost || item.cost_price || 0,
      total_cost,
      notes,
      created_by: req.user?.id,
    });
    return res.status(201).json(reorder);
  } catch (err) { return res.status(500).json({ message: 'Server error.' }); }
});

router.patch('/reorders/:id', requireRole('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { InventoryReorder, Inventory } = require('../models');
    const tenantId = resolveTenantId(req);
    const where = { id: req.params.id };
    if (tenantId) where.tenant_id = tenantId;

    const reorder = await InventoryReorder.findOne({ where });
    if (!reorder) return res.status(404).json({ message: 'Reorder not found.' });

    const allowed = ['status', 'supplier_name', 'supplier_contact', 'quantity_received', 'notes'];
    for (const f of allowed) { if (req.body[f] !== undefined) reorder[f] = req.body[f]; }

    if (req.body.status === 'ordered')  reorder.ordered_at  = new Date();
    if (req.body.status === 'received') {
      reorder.received_at = new Date();
      // Auto-adjust inventory quantity
      const item = await Inventory.findByPk(reorder.inventory_id);
      if (item && reorder.quantity_received > 0) {
        await item.update({ quantity: parseFloat(item.quantity) + parseFloat(reorder.quantity_received) });
      }
    }
    await reorder.save();
    return res.json(reorder);
  } catch (err) { return res.status(500).json({ message: 'Server error.' }); }
});

router.get('/',               ctrl.list);
router.post('/',              ctrl.create);
router.put('/:id',            ctrl.update);
router.delete('/:id',         requireRole('superadmin', 'admin', 'manager'), ctrl.remove);
router.patch('/:id/adjust',   ctrl.adjust);

module.exports = router;
