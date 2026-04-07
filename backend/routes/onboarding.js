const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/onboardingController');

// POST /api/onboarding/register  — create new tenant (public)
router.post('/register', ctrl.register);

// GET  /api/onboarding/check-slug?slug=abc  — slug availability (public)
router.get('/check-slug', ctrl.checkSlug);

module.exports = router;
