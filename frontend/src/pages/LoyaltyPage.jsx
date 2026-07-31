import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard, DataTable } from '../components/ui/PageKit';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

import { LOYALTY_TIERS, getTier, loyaltyTierCounts } from '../utils/loyaltyTiers';

const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

const TIERS = LOYALTY_TIERS;
const tierDistribution = loyaltyTierCounts;

/* ── Points bar (hero) ────────────────────────────────────────────────────── */
const PointsBar = ({ total, top }) => {
  const pct = top > 0 ? Math.min(100, Math.round((total / top) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
          Program health
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
          {total.toLocaleString()} total points in play
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ height: '100%', background: 'rgba(255,255,255,0.85)', borderRadius: 99 }}
        />
      </div>
    </div>
  );
};

export default function LoyaltyPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canAdmin = ['superadmin', 'admin'].includes(user?.role);
  const canAdjust = ['superadmin', 'admin', 'manager'].includes(user?.role);

  const [rules, setRules]             = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [txCustId, setTxCustId]       = useState('');
  const [txData, setTxData]           = useState(null);
  const [txLoading, setTxLoading]     = useState(false);
  const [rulesEdit, setRulesEdit]     = useState(false);
  const [rulesForm, setRulesForm]     = useState({});
  const [saving, setSaving]           = useState(false);
  const [redeemForm, setRedeemForm]   = useState({ customer_id: '', points_to_redeem: '' });
  const [redeemResult, setRedeemResult] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    customer_id: '',
    direction: 'subtract',
    amount: '50',
    description: '',
  });
  const [adjustResult, setAdjustResult] = useState(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustCustomers, setAdjustCustomers] = useState([]);
  const [adjustSearch, setAdjustSearch] = useState('');
  const [adjustCustLoading, setAdjustCustLoading] = useState(false);
  const [reduced50Ids, setReduced50Ids] = useState(() => new Set());
  const [reduced50Count, setReduced50Count] = useState(0);
  const [lbTier, setLbTier] = useState('All'); // All | Bronze | Silver | Gold | Platinum | Reduced50
  const REDUCED_50 = 'Reduced50';

  const loadRules = useCallback(() => {
    api.get('/loyalty/rules').then((r) => {
      setRules(r.data);
      setRulesForm(r.data);
    }).catch(() => {});
  }, []);

  const loadLeaderboard = useCallback(() => {
    api.get('/loyalty/leaderboard', { params: { limit: 500 } })
      .then((r) => setLeaderboard(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadRules(); loadLeaderboard(); }, [loadRules, loadLeaderboard]);

  const loadReduced50 = useCallback(async () => {
    try {
      const { data } = await api.get('/loyalty/marked', { params: { mark: 'reduced_50' } });
      const rows = Array.isArray(data?.data) ? data.data : [];
      setReduced50Ids(new Set(rows.map((r) => Number(r.id))));
      setReduced50Count(typeof data?.total === 'number' ? data.total : rows.length);
    } catch {
      setReduced50Ids(new Set());
      setReduced50Count(0);
    }
  }, []);

  const loadAdjustCustomers = useCallback(async () => {
    if (!canAdjust) return;
    setAdjustCustLoading(true);
    try {
      const pageLimit = 500;
      let page = 1;
      let all = [];
      let total = Infinity;
      while (all.length < total) {
        const { data } = await api.get('/customers', { params: { limit: pageLimit, page } });
        const rows = Array.isArray(data) ? data : (data?.data || []);
        total = typeof data?.total === 'number' ? data.total : rows.length;
        all = all.concat(rows);
        if (!rows.length || rows.length < pageLimit) break;
        page += 1;
      }
      setAdjustCustomers(all);
    } catch {
      setAdjustCustomers([]);
    } finally {
      setAdjustCustLoading(false);
    }
  }, [canAdjust]);

  useEffect(() => {
    loadAdjustCustomers();
    loadReduced50();
  }, [loadAdjustCustomers, loadReduced50]);

  const adjustVisibleCustomers = useMemo(() => {
    const q = adjustSearch.trim().toLowerCase();
    if (!q) return adjustCustomers;
    return adjustCustomers.filter((c) => (
      String(c.name || '').toLowerCase().includes(q)
      || String(c.phone || '').includes(q)
      || String(c.id || '').includes(q)
    ));
  }, [adjustCustomers, adjustSearch]);

  const selectedAdjustCustomer = useMemo(
    () => adjustCustomers.find((c) => String(c.id) === String(adjustForm.customer_id)) || null,
    [adjustCustomers, adjustForm.customer_id],
  );

  const saveRules = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/loyalty/rules', rulesForm);
      addToast('Rules saved', 'success');
      setRulesEdit(false);
      loadRules();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const loadTx = async () => {
    if (!txCustId.trim()) return;
    setTxLoading(true);
    try {
      const r = await api.get(`/loyalty/transactions/${txCustId.trim()}`);
      setTxData(r.data);
    } catch { addToast('Customer not found', 'error'); setTxData(null); }
    setTxLoading(false);
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/loyalty/redeem', {
        customer_id: Number(redeemForm.customer_id),
        points_to_redeem: Number(redeemForm.points_to_redeem),
      });
      setRedeemResult(r.data);
      addToast(`Redeemed! Discount: ${Rs(r.data.discount_amount)}`, 'success');
      loadLeaderboard();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    const amount = Number(adjustForm.amount);
    if (!(amount > 0)) {
      addToast('Enter points greater than 0', 'error');
      return;
    }
    setAdjustSaving(true);
    setAdjustResult(null);
    try {
      const desc = String(adjustForm.description || '').trim()
        || (adjustForm.direction === 'subtract'
          ? `Loyalty points reduced by ${amount}`
          : `Loyalty points increased by ${amount}`);
      const r = await api.post('/loyalty/adjust', {
        customer_id: Number(adjustForm.customer_id),
        direction: adjustForm.direction,
        amount,
        description: desc,
      });
      setAdjustResult(r.data);
      addToast(
        adjustForm.direction === 'subtract'
          ? `Reduced ${amount} pts — balance ${r.data.balance}`
          : `Added ${amount} pts — balance ${r.data.balance}`,
        'success',
      );
      loadLeaderboard();
      loadAdjustCustomers();
      loadReduced50();
      if (String(txCustId) === String(adjustForm.customer_id)) loadTx();
    } catch (err) {
      addToast(err.response?.data?.message || 'Adjust failed', 'error');
    }
    setAdjustSaving(false);
  };

  /* ── Computed ── */
  const totalPts = leaderboard.reduce((s, c) => s + (c.loyalty_points || 0), 0);
  const topPts   = leaderboard[0]?.loyalty_points || 0;
  const tierCounts = tierDistribution(leaderboard);

  const isReduced50Customer = useCallback(
    (c) => reduced50Ids.has(Number(c.id)) || c.loyalty_mark === 'reduced_50',
    [reduced50Ids],
  );

  const filteredLeaderboard = useMemo(() => {
    if (lbTier === REDUCED_50) {
      return leaderboard.filter(isReduced50Customer);
    }
    if (lbTier !== 'All') {
      return leaderboard.filter((c) => getTier(c.loyalty_points || 0).name === lbTier);
    }
    return leaderboard;
  }, [leaderboard, lbTier, isReduced50Customer]);

  const leaderboardRows = useMemo(
    () => filteredLeaderboard.map((c, i) => ({ ...c, _rank: i + 1 })),
    [filteredLeaderboard],
  );

  const leaderboardColumns = useMemo(() => [
    {
      id: 'rank',
      header: '#',
      enableSorting: false,
      meta: { width: '56px', align: 'center' },
      cell: ({ row: { original: c } }) => {
        const i = c._rank - 1;
        return (
          <span style={{ fontWeight: 800, fontSize: 14, color: ['#FFD700', '#94A3B8', '#CD7F32'][i] || '#98A2B3' }}>
            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : c._rank}
          </span>
        );
      },
    },
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => row.name || '',
      meta: { width: '22%' },
      cell: ({ row: { original: c } }) => (
        <span style={{ fontWeight: 600, color: '#101828', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {c.name}
          {(reduced50Ids.has(Number(c.id)) || c.loyalty_mark === 'reduced_50') && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA',
            }}>−50</span>
          )}
        </span>
      ),
    },
    {
      id: 'phone',
      header: 'Phone',
      accessorFn: (row) => row.phone || '',
      meta: { width: '14%' },
      cell: ({ row: { original: c } }) => (
        <span style={{ color: '#667085' }}>{c.phone || '—'}</span>
      ),
    },
    {
      id: 'tier',
      header: 'Tier',
      accessorFn: (row) => getTier(row.loyalty_points || 0).name,
      meta: { width: '12%' },
      cell: ({ row: { original: c } }) => {
        const tier = getTier(c.loyalty_points || 0);
        return (
          <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 99,
            fontSize: 11, fontWeight: 700,
            background: `${tier.color}18`, color: tier.color,
            border: `1px solid ${tier.color}30`,
          }}>{tier.name}</span>
        );
      },
    },
    {
      id: 'points',
      header: 'Points',
      accessorFn: (row) => row.loyalty_points,
      meta: { width: '12%', align: 'right' },
      cell: ({ row: { original: c } }) => (
        <span style={{ fontWeight: 700, color: '#7C3AED' }}>{Number(c.loyalty_points).toLocaleString()}</span>
      ),
    },
    {
      id: 'total_spent',
      header: 'Total Spent',
      accessorFn: (row) => row.total_spent,
      meta: { width: '14%', align: 'right' },
      cell: ({ row: { original: c } }) => (
        <span style={{ color: '#344054' }}>{Rs(c.total_spent)}</span>
      ),
    },
    {
      id: 'visits',
      header: 'Visits',
      accessorFn: (row) => row.visits,
      meta: { width: '10%', align: 'center' },
      cell: ({ row: { original: c } }) => (
        <span style={{ color: '#344054' }}>{c.visits}</span>
      ),
    },
  ], [reduced50Ids]);

  const inp = {
    padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13.5,
    width: '100%', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
    outline: 'none', transition: 'border-color 0.15s',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 6, display: 'block', fontFamily: "'Inter', sans-serif" };

  return (
    <PageWrapper title="Loyalty Program" subtitle="Manage points, rules and customer rewards">

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Members with Points" value={leaderboard.length} color="#6366F1" />
        <StatCard label="Top Points" value={topPts.toLocaleString()} color="#F59E0B" />
        {rules && <StatCard label="Earn Rate" value={`${rules.earn_points} pts`} color="#10B981" />}
        {rules && <StatCard label="Redeem Value" value={`Rs.${rules.redeem_value}`} color="#EF4444" />}
      </div>

      {/* ── Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 50%, #A855F7 100%)',
          borderRadius: 18, padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(124,58,237,0.22)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, right: 80, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.07em',
              textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.25)',
              fontFamily: "'Inter', sans-serif",
            }}>
              Loyalty Program
            </span>
            <h2 style={{
              margin: '12px 0 2px', fontSize: 28, fontWeight: 900, color: '#fff',
              lineHeight: 1.1, fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
            }}>
              {totalPts.toLocaleString()} Points Active
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif" }}>
              {leaderboard.length} members earning rewards across your salon.
            </p>
            <PointsBar total={totalPts} top={topPts * leaderboard.length} />
          </div>
          <div style={{
            background: rules?.is_active ? 'rgba(255,255,255,0.15)' : 'rgba(239,68,68,0.2)',
            border: rules?.is_active ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(239,68,68,0.5)',
            borderRadius: 99, padding: '6px 16px',
            fontSize: 12, fontWeight: 700, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Inter', sans-serif",
          }}>
            {rules?.is_active ? 'Active' : 'Inactive'}
          </div>
        </div>
      </motion.div>

      {/* ── Tier Distribution (also filters leaderboard) ── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
            whileHover={{ translateY: -3 }}
            onClick={() => setLbTier('All')}
            style={{
              flex: 1, minWidth: 120, cursor: 'pointer',
              background: lbTier === 'All' ? '#EFF6FF' : '#F8FAFC',
              border: `1.5px solid ${lbTier === 'All' ? '#2563EB' : '#E4E7EC'}`,
              borderRadius: 14, padding: '18px 16px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
            }}
            title="Show all members on leaderboard"
          >
            <div style={{ fontSize: 28, fontWeight: 900, color: '#2563EB', fontFamily: "'Sora', sans-serif" }}>
              {leaderboard.length}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
              All
            </div>
            <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 4, fontFamily: "'Inter', sans-serif" }}>
              with points
            </div>
          </motion.div>
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.07 }}
              whileHover={{ translateY: -3 }}
              onClick={() => setLbTier(tier.name)}
              style={{
                flex: 1, minWidth: 120, cursor: 'pointer',
                background: lbTier === tier.name ? tier.bg : '#fff',
                border: `1.5px solid ${lbTier === tier.name ? tier.color : `${tier.color}30`}`,
                borderRadius: 14, padding: '18px 16px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
                transition: 'box-shadow 0.18s',
              }}
              title={`Filter leaderboard: ${tier.name}`}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: tier.color, fontFamily: "'Sora', sans-serif" }}>
                {tierCounts[tier.name] || 0}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: tier.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
                {tier.name}
              </div>
              <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 4, fontFamily: "'Inter', sans-serif" }}>
                {tier.range}
              </div>
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            whileHover={{ translateY: -3 }}
            onClick={() => setLbTier(REDUCED_50)}
            style={{
              flex: 1, minWidth: 120, cursor: 'pointer',
              background: lbTier === REDUCED_50 ? '#FEF2F2' : '#fff',
              border: `1.5px solid ${lbTier === REDUCED_50 ? '#DC2626' : '#FECACA'}`,
              borderRadius: 14, padding: '18px 16px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
            }}
            title="Filter leaderboard: −50 pts group"
          >
            <div style={{ fontSize: 28, fontWeight: 900, color: '#DC2626', fontFamily: "'Sora', sans-serif" }}>
              {reduced50Count}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
              −50 pts
            </div>
            <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 4, fontFamily: "'Inter', sans-serif" }}>
              reduced group
            </div>
          </motion.div>
      </div>

      {/* ── Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

        {/* Earn/Redeem Rules */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>Loyalty Rules</h3>
            {canAdmin && !rulesEdit && (
              <button onClick={() => setRulesEdit(true)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px solid #EAECF0', background: '#F9FAFB',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#344054', fontFamily: "'Inter', sans-serif",
                transition: 'all 0.15s',
              }}>
                Edit Rules
              </button>
            )}
          </div>

          {!rulesEdit && rules ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Earn Rate', `Every Rs.${rules.earn_per_amount} spent = ${rules.earn_points} point(s)`, '#10B981'],
                ['Redeem Rate', `${rules.redeem_points} points = Rs.${rules.redeem_value} discount`, '#7C3AED'],
                ['Min. to Redeem', `${rules.min_points_redeem} points`, '#D97706'],
                ['Points Expiry', rules.expiry_days ? `${rules.expiry_days} days` : 'Never expire', '#6366F1'],
                ['Status', rules.is_active ? 'Active' : 'Disabled', rules.is_active ? '#059669' : '#EF4444'],
              ].map(([k, v, color], idx) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 13.5, padding: '10px 0',
                  borderBottom: idx < 4 ? '1px solid #F2F4F7' : 'none',
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <span style={{ color: '#667085' }}>{k}</span>
                  <span style={{ fontWeight: 700, color }}>{v}</span>
                </div>
              ))}
            </div>
          ) : rulesEdit ? (
            <form onSubmit={saveRules} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Rs. per earn unit</label>
                  <input type="number" style={inp} value={rulesForm.earn_per_amount || ''} onChange={(e) => setRulesForm((p) => ({ ...p, earn_per_amount: e.target.value }))} min="1" step="0.01" required />
                </div>
                <div>
                  <label style={lbl}>Points earned</label>
                  <input type="number" style={inp} value={rulesForm.earn_points || ''} onChange={(e) => setRulesForm((p) => ({ ...p, earn_points: e.target.value }))} min="1" required />
                </div>
                <div>
                  <label style={lbl}>Points to redeem</label>
                  <input type="number" style={inp} value={rulesForm.redeem_points || ''} onChange={(e) => setRulesForm((p) => ({ ...p, redeem_points: e.target.value }))} min="1" required />
                </div>
                <div>
                  <label style={lbl}>Redeem value (Rs.)</label>
                  <input type="number" style={inp} value={rulesForm.redeem_value || ''} onChange={(e) => setRulesForm((p) => ({ ...p, redeem_value: e.target.value }))} min="1" step="0.01" required />
                </div>
                <div>
                  <label style={lbl}>Min points to redeem</label>
                  <input type="number" style={inp} value={rulesForm.min_points_redeem || ''} onChange={(e) => setRulesForm((p) => ({ ...p, min_points_redeem: e.target.value }))} min="0" />
                </div>
                <div>
                  <label style={lbl}>Expiry (days, 0=never)</label>
                  <input type="number" style={inp} value={rulesForm.expiry_days || ''} onChange={(e) => setRulesForm((p) => ({ ...p, expiry_days: e.target.value || null }))} min="0" />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="loyaltyActive" checked={!!rulesForm.is_active} onChange={(e) => setRulesForm((p) => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="loyaltyActive" style={{ fontSize: 13, fontFamily: "'Inter', sans-serif" }}>Program Active</label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Rules'}</Button>
                <button type="button" onClick={() => setRulesEdit(false)} style={{
                  padding: '9px 18px', borderRadius: 10, border: '1.5px solid #EAECF0', background: '#fff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#344054', fontFamily: "'Inter', sans-serif",
                }}>Cancel</button>
              </div>
            </form>
          ) : <div style={{ color: '#98A2B3', fontSize: 13, fontFamily: "'Inter', sans-serif" }}>Loading rules…</div>}
        </motion.div>

        {/* Quick Redeem */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}
        >
          <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>Quick Redeem Points</h3>
          <form onSubmit={handleRedeem} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Customer ID</label>
              <input type="number" style={inp} value={redeemForm.customer_id} onChange={(e) => setRedeemForm((p) => ({ ...p, customer_id: e.target.value }))} required placeholder="Enter customer ID" />
            </div>
            <div>
              <label style={lbl}>Points to Redeem</label>
              <input type="number" style={inp} value={redeemForm.points_to_redeem} onChange={(e) => setRedeemForm((p) => ({ ...p, points_to_redeem: e.target.value }))} required min="1" />
            </div>
            {redeemResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                style={{
                  background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                  border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', fontSize: 13.5,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Discount: <strong style={{ color: '#065F46' }}>{Rs(redeemResult.discount_amount)}</strong> &nbsp;|&nbsp; Remaining: <strong style={{ color: '#065F46' }}>{redeemResult.balance} pts</strong>
              </motion.div>
            )}
            <Button type="submit">Redeem</Button>
          </form>
        </motion.div>

        {/* Manual Adjust */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          style={{ background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}
        >
          <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
            Adjust Points
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
            Search and select a customer, then create a points entry (e.g. reduce 50).
          </p>

          <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Search customer</label>
              <input
                type="search"
                style={inp}
                value={adjustSearch}
                onChange={(e) => setAdjustSearch(e.target.value)}
                placeholder="Name, phone, or ID…"
              />
            </div>

            <div style={{
              maxHeight: 200, overflowY: 'auto', border: '1.5px solid #E5E7EB', borderRadius: 12,
              background: '#F9FAFB',
            }}>
              {adjustCustLoading ? (
                <div style={{ padding: 14, fontSize: 13, color: '#98A2B3' }}>Loading customers…</div>
              ) : adjustVisibleCustomers.length === 0 ? (
                <div style={{ padding: 14, fontSize: 13, color: '#98A2B3' }}>No customers found</div>
              ) : (
                adjustVisibleCustomers.slice(0, 80).map((c) => {
                  const tier = getTier(c.loyalty_points || 0);
                  const selected = String(c.id) === String(adjustForm.customer_id);
                  const isReduced50 = reduced50Ids.has(Number(c.id)) || c.loyalty_mark === 'reduced_50';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAdjustForm((p) => ({ ...p, customer_id: String(c.id) }))}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', border: 'none', borderBottom: '1px solid #EEF2F6',
                        background: selected ? '#EEF2FF' : 'transparent',
                        cursor: 'pointer', textAlign: 'left', fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#98A2B3' }}>
                          ID {c.id}{c.phone ? ` · ${c.phone}` : ''}
                        </div>
                      </div>
                      {isReduced50 && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: '#FEE2E2', color: '#DC2626', flexShrink: 0,
                        }}>−50</span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: tier.bg, color: tier.color, flexShrink: 0,
                      }}>{tier.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>
                        {Number(c.loyalty_points || 0).toLocaleString()} pts
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {selectedAdjustCustomer && (
              <div style={{
                padding: '10px 12px', borderRadius: 10, background: '#F5F3FF',
                border: '1px solid #DDD6FE', fontSize: 13, fontFamily: "'Inter', sans-serif",
              }}>
                Selected: <strong>{selectedAdjustCustomer.name}</strong>
                {' · '}
                <span style={{ color: getTier(selectedAdjustCustomer.loyalty_points || 0).color, fontWeight: 700 }}>
                  {getTier(selectedAdjustCustomer.loyalty_points || 0).name}
                </span>
                {' · '}
                {Number(selectedAdjustCustomer.loyalty_points || 0).toLocaleString()} pts
              </div>
            )}

            <input type="hidden" value={adjustForm.customer_id} required readOnly />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Action</label>
                <select
                  style={{ ...inp, cursor: 'pointer' }}
                  value={adjustForm.direction}
                  onChange={(e) => setAdjustForm((p) => ({ ...p, direction: e.target.value }))}
                >
                  <option value="subtract">Reduce (−)</option>
                  <option value="add">Add (+)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Points</label>
                <input
                  type="number"
                  style={inp}
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                  min="1"
                  step="1"
                  placeholder="50"
                />
              </div>
            </div>
            <div>
              <label style={lbl}>Entry note (optional)</label>
              <input
                type="text"
                style={inp}
                value={adjustForm.description}
                onChange={(e) => setAdjustForm((p) => ({ ...p, description: e.target.value }))}
                placeholder={
                  adjustForm.direction === 'subtract'
                    ? `Loyalty points reduced by ${adjustForm.amount || 50}`
                    : `Loyalty points increased by ${adjustForm.amount || 50}`
                }
              />
            </div>
            {adjustResult && (
              <div style={{
                background: adjustResult.points_adjusted < 0 ? '#FEF2F2' : '#ECFDF5',
                border: `1px solid ${adjustResult.points_adjusted < 0 ? '#FECACA' : '#A7F3D0'}`,
                borderRadius: 10, padding: '12px 16px', fontSize: 13.5,
                fontFamily: "'Inter', sans-serif",
                color: adjustResult.points_adjusted < 0 ? '#991B1B' : '#065F46',
              }}>
                Entry: <strong>{adjustResult.points_adjusted > 0 ? '+' : ''}{adjustResult.points_adjusted} pts</strong>
                {' '}· Balance: <strong>{adjustResult.balance} pts</strong>
                {adjustResult.transaction?.description ? (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                    {adjustResult.transaction.description}
                  </div>
                ) : null}
              </div>
            )}
            <Button
              type="submit"
              disabled={adjustSaving || !canAdjust || !adjustForm.customer_id}
              onClick={(e) => {
                if (!adjustForm.customer_id) {
                  e.preventDefault();
                  addToast('Select a customer from a tier category', 'error');
                }
              }}
            >
              {adjustSaving ? 'Saving…' : 'Create entry'}
            </Button>
          </form>
        </motion.div>

        {/* Transaction Lookup */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}
        >
          <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>Transaction History</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input type="number" style={{ ...inp, flex: 1 }} value={txCustId} onChange={(e) => setTxCustId(e.target.value)} placeholder="Enter customer ID" />
            <Button onClick={loadTx} disabled={txLoading}>{txLoading ? '…' : 'Lookup'}</Button>
          </div>
          {txData && (
            <div>
              <div style={{
                fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#101828', fontFamily: "'Inter', sans-serif",
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{txData.customer?.name}</span>
                <span style={{
                  background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 99,
                  padding: '3px 12px', fontSize: 12, fontWeight: 700, color: '#6366F1',
                }}>
                  {txData.customer?.loyalty_points} pts
                </span>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {txData.transactions.map((t, idx) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 13, padding: '9px 0',
                      borderBottom: idx < txData.transactions.length - 1 ? '1px solid #F2F4F7' : 'none',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    <div>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                        fontSize: 12, fontWeight: 700,
                        background: t.points > 0 ? '#D1FAE5' : '#FEE2E2',
                        color: t.points > 0 ? '#065F46' : '#991B1B',
                      }}>
                        {t.points > 0 ? '+' : ''}{t.points} pts
                      </span>
                      <span style={{
                        marginLeft: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        color: t.type === 'adjust' ? '#B45309' : '#98A2B3',
                      }}>
                        {t.type}
                      </span>
                      <span style={{ color: '#98A2B3', marginLeft: 8, fontSize: 12 }}>{t.description}</span>
                    </div>
                    <span style={{ color: '#98A2B3', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Leaderboard ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{ background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(16,24,40,0.06)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
            Points Leaderboard
          </h3>
          <span style={{
            background: '#F9FAFB', border: '1px solid #EAECF0', borderRadius: 99,
            padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#667085',
            fontFamily: "'Inter', sans-serif",
          }}>
            {filteredLeaderboard.length}
            {lbTier !== 'All' ? ` · ${lbTier === REDUCED_50 ? '−50 pts' : lbTier}` : ' members'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setLbTier('All')}
            style={{
              padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              fontFamily: "'Inter', sans-serif",
              border: `1.5px solid ${lbTier === 'All' ? '#2563EB' : '#E4E7EC'}`,
              background: lbTier === 'All' ? '#EFF6FF' : '#fff',
              color: lbTier === 'All' ? '#2563EB' : '#667085',
            }}
          >
            All ({leaderboard.length})
          </button>
          {TIERS.map((t) => {
            const active = lbTier === t.name;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => setLbTier(t.name)}
                style={{
                  padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  fontFamily: "'Inter', sans-serif",
                  border: `1.5px solid ${active ? t.color : '#E4E7EC'}`,
                  background: active ? t.bg : '#fff',
                  color: active ? t.color : '#667085',
                }}
              >
                {t.name} ({tierCounts[t.name] || 0})
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setLbTier(REDUCED_50)}
            style={{
              padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              fontFamily: "'Inter', sans-serif",
              border: `1.5px solid ${lbTier === REDUCED_50 ? '#DC2626' : '#E4E7EC'}`,
              background: lbTier === REDUCED_50 ? '#FEF2F2' : '#fff',
              color: lbTier === REDUCED_50 ? '#DC2626' : '#667085',
            }}
          >
            −50 pts ({reduced50Count})
          </button>
        </div>

        {leaderboard.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, color: '#98A2B3',
            border: '2px dashed #E5E7EB', borderRadius: 12,
            fontFamily: "'Inter', sans-serif", fontSize: 14,
          }}>
            No loyalty members yet
          </div>
        ) : filteredLeaderboard.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, color: '#98A2B3',
            border: '2px dashed #E5E7EB', borderRadius: 12,
            fontFamily: "'Inter', sans-serif", fontSize: 14,
          }}>
            No members in this filter
          </div>
        ) : (
          <DataTable
            columns={leaderboardColumns}
            data={leaderboardRows}
            showRowNumbers={false}
            searchableColumns={[
              { id: 'name', title: 'Name' },
              { id: 'phone', title: 'Phone' },
            ]}
            filterableColumns={[
              {
                id: 'tier',
                title: 'Tier',
                options: TIERS.map((t) => ({ label: t.name, value: t.name })),
              },
            ]}
            emptyMessage="No loyalty members yet"
            pageSize={20}
          />
        )}
      </motion.div>

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Customers earn points on every payment. Redeem points for discounts at checkout.
      </p>
    </PageWrapper>
  );
}
