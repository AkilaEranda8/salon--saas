import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

function StatCard({ label, value, color = '#2563EB', icon }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 160 }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#101828' }}>{value}</div>
      </div>
    </div>
  );
}

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

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };

  return (
    <PageWrapper title="Loyalty Program" subtitle="Manage points, rules and customer rewards">
      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatCard label="Total Members with Points" value={leaderboard.length} color="#6366f1" icon="🏆" />
        {leaderboard[0] && <StatCard label="Top Customer Points" value={leaderboard[0].loyalty_points?.toLocaleString()} color="#F59E0B" icon="⭐" />}
        {rules && <StatCard label="Points per Rs.100 spent" value={rules.earn_points} color="#10B981" icon="💰" />}
        {rules && <StatCard label={`${rules.redeem_points} pts = Rs.`} value={rules.redeem_value} color="#EF4444" icon="🎁" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Earn/Redeem Rules */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Loyalty Rules</h3>
            {canAdmin && !rulesEdit && <button onClick={() => setRulesEdit(true)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit Rules</button>}
          </div>

          {!rulesEdit && rules ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Earn Rate', `Every Rs. ${rules.earn_per_amount} spent → ${rules.earn_points} point(s)`],
                ['Redeem Rate', `${rules.redeem_points} points → Rs. ${rules.redeem_value} discount`],
                ['Minimum to Redeem', `${rules.min_points_redeem} points`],
                ['Points Expiry', rules.expiry_days ? `${rules.expiry_days} days` : 'Never expire'],
                ['Status', rules.is_active ? '✅ Active' : '❌ Disabled'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #F3F4F6', paddingBottom: 8 }}>
                  <span style={{ color: '#6B7280' }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          ) : rulesEdit ? (
            <form onSubmit={saveRules} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                <label htmlFor="loyaltyActive" style={{ fontSize: 13 }}>Program Active</label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Rules'}</Button>
                <button type="button" onClick={() => setRulesEdit(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            </form>
          ) : <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading rules…</div>}
        </div>

        {/* Quick Redeem */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Quick Redeem Points</h3>
          <form onSubmit={handleRedeem} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={lbl}>Customer ID</label>
              <input type="number" style={inp} value={redeemForm.customer_id} onChange={(e) => setRedeemForm((p) => ({ ...p, customer_id: e.target.value }))} required placeholder="Enter customer ID" />
            </div>
            <div>
              <label style={lbl}>Points to Redeem</label>
              <input type="number" style={inp} value={redeemForm.points_to_redeem} onChange={(e) => setRedeemForm((p) => ({ ...p, points_to_redeem: e.target.value }))} required min="1" />
            </div>
            {redeemResult && (
              <div style={{ background: '#D1FAE5', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                ✅ Discount: <strong>{Rs(redeemResult.discount_amount)}</strong> | Remaining balance: <strong>{redeemResult.balance} pts</strong>
              </div>
            )}
            <Button type="submit">Redeem</Button>
          </form>
        </div>

        {/* Transaction Lookup */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Customer Transaction History</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input type="number" style={{ ...inp, flex: 1 }} value={txCustId} onChange={(e) => setTxCustId(e.target.value)} placeholder="Enter customer ID" />
            <Button onClick={loadTx} disabled={txLoading}>{txLoading ? '…' : 'Lookup'}</Button>
          </div>
          {txData && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{txData.customer?.name} — <span style={{ color: '#6366f1' }}>{txData.customer?.loyalty_points} pts</span></div>
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {txData.transactions.map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: t.type === 'earn' ? '#10B981' : '#EF4444' }}>{t.type === 'earn' ? '+' : ''}{t.points} pts</span>
                      <span style={{ color: '#9CA3AF', marginLeft: 6 }}>{t.description}</span>
                    </div>
                    <span style={{ color: '#6B7280' }}>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>🏆 Points Leaderboard (Top 20)</h3>
        {leaderboard.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#9CA3AF' }}>No loyalty members yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                  {['#', 'Name', 'Phone', 'Points', 'Total Spent', 'Visits'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#6B7280', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6', background: i < 3 ? '#FFFBEB' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: ['#FFD700', '#C0C0C0', '#CD7F32'][i] || '#374151' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '8px 10px', color: '#6B7280' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#6366f1' }}>{Number(c.loyalty_points).toLocaleString()}</td>
                    <td style={{ padding: '8px 10px' }}>{Rs(c.total_spent)}</td>
                    <td style={{ padding: '8px 10px' }}>{c.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
