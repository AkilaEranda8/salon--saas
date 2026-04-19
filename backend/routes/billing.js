const express = require('express');
const router  = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth');
const { platformAdmin } = require('../middleware/platformAdmin');
const ctrl            = require('../controllers/billingController');
const bankSlipCtrl    = require('../controllers/bankSlipController');

// Multer setup for file uploads (max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
    cb(null, true);
  },
});

// POST /api/billing/webhook
// IMPORTANT: This route needs raw body — registered with express.raw() in server.js
// BEFORE express.json(). The route file handles both webhook and regular billing routes.
router.post('/webhook', ctrl.stripeWebhook);

// The routes below need parsed JSON (express.json() is already applied in server.js
// for non-webhook requests because the webhook uses a separate raw-body handler)
router.post('/checkout', verifyToken, ctrl.createCheckout);
router.get('/portal',    verifyToken, ctrl.billingPortal);
router.get('/status',    verifyToken, ctrl.billingStatus);
router.get('/invoices',  verifyToken, ctrl.billingInvoices);
router.get('/invoices/:id/pdf', verifyToken, ctrl.billingInvoicePdf);
router.post('/invoices/:id/email', verifyToken, ctrl.billingInvoiceEmail);

// Bank Slip routes
router.post('/bank-slip/upload', verifyToken, upload.single('file'), bankSlipCtrl.uploadBankSlip);
router.get('/bank-slip/status', verifyToken, bankSlipCtrl.getBankSlipStatus);
router.get('/bank-slip/list', verifyToken, platformAdmin, bankSlipCtrl.listBankSlips);
router.patch('/bank-slip/:id/approve', verifyToken, platformAdmin, bankSlipCtrl.approveBankSlip);
router.patch('/bank-slip/:id/reject', verifyToken, platformAdmin, bankSlipCtrl.rejectBankSlip);

module.exports = router;
