import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard } from '../components/ui/PageKit';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

/* ── Tier helpers ─────────────────────────────────────────────────────────── */
const TIERS = [
  { name: 'Bronze',   min: 0,    color: '#CD7F32', bg: '#FDF6EC', gradient: 'linear-gradient(135deg, #92400E 0%, #CD7F32 100%)' },
  { name: 'Silver',   min: 500,  color: '#94A3B8', bg: '#F8FAFC', gradient: 'linear-gradient(135deg, #475569 0%, #94A3B8 100%)' },
  { name: 'Gold',     min: 1500, color: '#D97706', bg: '#FFFBEB', gradient: 'linear-gradient(135deg, #92400E 0%, #F59E0B 100%)' },
  { name: 'Platinum', min: 5000, color: '#7C3AED', bg: '#FAF5FF', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)' },
];
const getTier = (pts) => [...TIERS].reverse().find(t => pts >= t.min) || TIERS[0];

const tierDistribution = (lb) => {
  const counts = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  lb.forEach(c => { counts[getTier(c.loyalty_points || 0).name]++; });
  return counts;
};

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

  const loadRules = useCallback(() => {
    api.get('/loyalty/rules').then((r) => {
      setRules(r.data);
      setRulesForm(r.data);
    }).catch(() => {});
  }, []);

  const loadLeaderboard = useCallback(() => {
    api.get('/loyalty/leaderboard').then((r) => setLeaderboard(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  useEffect(() => { loadRules(); loadLeaderboard(); }, [loadRules, loadLeaderboard]);

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

  /* ── Computed ── */
  const totalPts = leaderboard.reduce((s, c) => s + (c.loyalty_points || 0), 0);
  const topPts   = leaderboard[0]?.loyalty_points || 0;
  const tierCounts = tierDistribution(leaderboard);

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

      {/* ── Tier Distribution ── */}
      {leaderboard.length > 0 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.07 }}
              whileHover={{ translateY: -3 }}
              style={{
                flex: 1, minWidth: 140,
                background: tier.bg, border: `1.5px solid ${tier.color}30`,
                borderRadius: 14, padding: '18px 16px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(16,24,40,0.04)',
                transition: 'box-shadow 0.18s',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: tier.color, fontFamily: "'Sora', sans-serif" }}>
                {tierCounts[tier.name]}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: tier.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
                {tier.name}
              </div>
              <div style={{ fontSize: 11, color: '#98A2B3', marginTop: 4, fontFamily: "'Inter', sans-serif" }}>
                {tier.min.toLocaleString()}+ pts
              </div>
            </motion.div>
          ))}
        </div>
      )}

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
                        background: t.type === 'earn' ? '#D1FAE5' : '#FEE2E2',
                        color: t.type === 'earn' ? '#065F46' : '#991B1B',
                      }}>
                        {t.type === 'earn' ? '+' : ''}{t.points} pts
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
            Points Leaderboard
          </h3>
          <span style={{
            background: '#F9FAFB', border: '1px solid #EAECF0', borderRadius: 99,
            padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#667085',
            fontFamily: "'Inter', sans-serif",
          }}>Top 20</span>
        </div>

        {leaderboard.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, color: '#98A2B3',
            border: '2px dashed #E5E7EB', borderRadius: 12,
            fontFamily: "'Inter', sans-serif", fontSize: 14,
          }}>
            No loyalty members yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontFamily: "'Inter', sans-serif" }}>
              <thead>
                <tr>
                  {['#', 'Name', 'Phone', 'Tier', 'Points', 'Total Spent', 'Visits'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontWeight: 700,
                      color: '#667085', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: '2px solid #EAECF0',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((c, i) => {
                  const tier = getTier(c.loyalty_points || 0);
                  return (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      style={{ borderBottom: '1px solid #F2F4F7', background: i < 3 ? '#FFFBEB08' : 'transparent' }}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: 14, color: ['#FFD700', '#94A3B8', '#CD7F32'][i] || '#98A2B3' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#101828' }}>{c.name}</td>
                      <td style={{ padding: '10px 12px', color: '#667085' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                          fontSize: 11, fontWeight: 700,
                          background: `${tier.color}18`, color: tier.color,
                          border: `1px solid ${tier.color}30`,
                        }}>{tier.name}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#7C3AED' }}>{Number(c.loyalty_points).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', color: '#344054' }}>{Rs(c.total_spent)}</td>
                      <td style={{ padding: '10px 12px', color: '#344054' }}>{c.visits}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Customers earn points on every payment. Redeem points for discounts at checkout.
      </p>
    </PageWrapper>
  );
}
