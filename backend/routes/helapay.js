const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { generateQR, checkPaymentStatus, getTransactionHistory } = require('../services/helapayService');
const requirePlan = require('../middleware/requirePlan');
const logger      = require('../utils/logger');

const router = Router();

// ── POST /api/helapay/qr ─────────────────────────────────────────────────────
// Generate a LankaQR code for a payment
// Body: { reference, amount }
router.post('/qr', verifyToken, requirePlan('pro', 'enterprise'), async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });

    const { reference, amount } = req.body;
    if (!reference || !amount) {
      return res.status(400).json({ message: 'reference and amount are required.' });
    }

    const result = await generateQR(tenant, reference, amount);
    return res.json(result);
  } catch (err) {
    logger.error('helapay_generateQR', { message: err.message, tenant: req.tenant?.id });
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/helapay/status ──────────────────────────────────────────────────
// Check payment status
// Body: { reference?, qr_reference? }
router.post('/status', verifyToken, requirePlan('pro', 'enterprise'), async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });

    const { reference, qr_reference } = req.body;
    if (!reference && !qr_reference) {
      return res.status(400).json({ message: 'reference or qr_reference is required.' });
    }

    const result = await checkPaymentStatus(tenant, { reference, qr_reference });
    return res.json(result);
  } catch (err) {
    logger.error('helapay_checkStatus', { message: err.message, tenant: req.tenant?.id });
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/helapay/history ─────────────────────────────────────────────────
// Retrieve transaction history
// Body: { start, end } (YYYY-MM-DD)
router.post('/history', verifyToken, requirePlan('pro', 'enterprise'), async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(400).json({ message: 'Tenant context required.' });

    const { start, end } = req.body;
    if (!start || !end) {
      return res.status(400).json({ message: 'start and end dates are required.' });
    }

    const result = await getTransactionHistory(tenant, { start, end });
    return res.json(result);
  } catch (err) {
    logger.error('helapay_history', { message: err.message, tenant: req.tenant?.id });
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/helapay/callback ────────────────────────────────────────────────
// Webhook from HelaPay — payment status notification
// No auth (called by HelaPay servers)
router.post('/callback', async (req, res) => {
  try {
    const { statusCode, reference, sale } = req.body;
    logger.info('helapay_callback', { body: req.body });

    // payment_status: 2=Success, 0=Pending, -1=Failed
    const paymentStatus = sale?.payment_status;
    const saleId = sale?.sale_id;
    const amount = sale?.amount;

    // TODO: find the local payment record by reference and update status
    // Example: await Payment.update({ helapay_status: paymentStatus }, { where: { helapay_reference: reference } });

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('helapay_callback_error', { message: err.message });
    return res.status(200).json({ received: true }); // Always 200 to HelaPay
  }
});

module.exports = router;
