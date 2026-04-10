const { Router } = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = Router();

const RINGS = new Set(['internal', 'canary', 'beta', 'ga']);
const CATALOG = [
  {
    key: 'smart_waitlist',
    name: 'Smart Waitlist',
    category: 'Operations',
    description: 'Auto-fill cancelled appointment slots from waiting customers.',
  },
  {
    key: 'predictive_no_show',
    name: 'Predictive No-show',
    category: 'AI',
    description: 'Risk scoring for upcoming appointments using booking history.',
  },
  {
    key: 'dynamic_pricing_rules',
    name: 'Dynamic Pricing Rules',
    category: 'Revenue',
    description: 'Apply demand-based price multipliers during peak windows.',
  },
  {
    key: 'campaign_journeys',
    name: 'Campaign Journeys',
    category: 'Marketing',
    description: 'Automated customer journey campaigns based on visit activity.',
  },
  {
    key: 'staff_performance_feed',
    name: 'Staff Performance Feed',
    category: 'Team',
    description: 'Daily KPI feed for commissions, attendance, and quality score.',
  },
  {
    key: 'wallet_refunds',
    name: 'Wallet Refunds',
    category: 'Payments',
    description: 'Instant customer wallet refunds for cancellations and disputes.',
  },
  {
    key: 'review_guardrails',
    name: 'Review Guardrails',
    category: 'Reputation',
    description: 'Flag suspicious review patterns and hold risky submissions.',
  },
  {
    key: 'multibranch_inventory_sync',
    name: 'Multi-branch Inventory Sync',
    category: 'Inventory',
    description: 'Cross-branch stock balancing and transfer recommendations.',
  },
];

const buildDefaultState = () => {
  const out = {};
  for (const item of CATALOG) {
    out[item.key] = {
      enabled: false,
      rolloutPercentage: 0,
      ring: 'internal',
      killSwitch: false,
      notes: '',
    };
  }
  return out;
};

const state = {
  features: buildDefaultState(),
  updatedAt: new Date().toISOString(),
  updatedBy: null,
};

const normalizeFeature = (input = {}, prev = {}) => {
  const rollout = Math.max(0, Math.min(100, parseInt(input.rolloutPercentage, 10) || 0));
  const ring = RINGS.has(input.ring) ? input.ring : (prev.ring || 'internal');
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : !!prev.enabled,
    rolloutPercentage: rollout,
    ring,
    killSwitch: typeof input.killSwitch === 'boolean' ? input.killSwitch : !!prev.killSwitch,
    notes: typeof input.notes === 'string' ? input.notes.slice(0, 500).trim() : (prev.notes || ''),
  };
};

router.get('/health', verifyToken, requireRole('platform_admin'), async (_req, res) => {
  return res.json({ ok: true, message: 'Features route is available.' });
});

router.get('/', verifyToken, requireRole('platform_admin'), async (_req, res) => {
  return res.json({
    data: CATALOG,
    state,
    rings: Array.from(RINGS),
  });
});

router.put('/state', verifyToken, requireRole('platform_admin'), async (req, res) => {
  try {
    const input = req.body?.features;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return res.status(400).json({ message: 'features object is required.' });
    }

    for (const item of CATALOG) {
      const current = state.features[item.key] || {};
      const next = normalizeFeature(input[item.key] || {}, current);
      state.features[item.key] = next;
    }

    state.updatedAt = new Date().toISOString();
    state.updatedBy = req.user?.id || null;

    return res.json({
      message: 'Feature studio state updated.',
      state,
    });
  } catch (err) {
    console.error('features.updateState error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/reset', verifyToken, requireRole('platform_admin'), async (req, res) => {
  state.features = buildDefaultState();
  state.updatedAt = new Date().toISOString();
  state.updatedBy = req.user?.id || null;
  return res.json({ message: 'Feature state reset to defaults.', state });
});

module.exports = router;
