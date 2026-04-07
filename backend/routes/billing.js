const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const ctrl            = require('../controllers/billingController');

// POST /api/billing/webhook
// IMPORTANT: This route needs raw body — registered with express.raw() in server.js
// BEFORE express.json(). The route file handles both webhook and regular billing routes.
router.post('/webhook', ctrl.stripeWebhook);

// The routes below need parsed JSON (express.json() is already applied in server.js
// for non-webhook requests because the webhook uses a separate raw-body handler)
router.post('/checkout', verifyToken, ctrl.createCheckout);
router.get('/portal',    verifyToken, ctrl.billingPortal);
router.get('/status',    verifyToken, ctrl.billingStatus);

module.exports = router;
