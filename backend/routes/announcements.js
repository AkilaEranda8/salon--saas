const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const parity = require('../controllers/platformParityController');

router.use(verifyToken);

router.get('/', parity.listForTenant);
router.get('/active', parity.listActiveForTenant);
router.post('/:id/dismiss', parity.dismissForTenant);

module.exports = router;
