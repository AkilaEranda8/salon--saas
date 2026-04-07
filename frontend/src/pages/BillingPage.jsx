import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const PLAN_FEATURES = {
  trial:      { label: 'Free Trial', color: '#6b7280', branches: 1, staff: 5,   services: 20  },
  basic:      { label: 'Basic',      color: '#2563eb', branches: 1, staff: 10,  services: 50  },
  pro:        { label: 'Pro',        color: '#7c3aed', branches: 5, staff: 50,  services: 200 },
  enterprise: { label: 'Enterprise', color: '#059669', branches: '∞', staff: '∞', services: '∞' },
};

const BillingPage = () => {
  const { tenant } = useAuth();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState('');

  useEffect(() => {
    api.get('/billing/status')
      .then((r) => setStatus(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (plan) => {
    setUpgrading(plan);
    try {
      const res = await api.post('/billing/checkout', { plan });
      window.location.href = res.data.url;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to start checkout.');
    } finally {
      setUpgrading('');
    }
  };

  const handleManage = async () => {
    try {
      const res = await api.get('/billing/portal');
      window.location.href = res.data.url;
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to open billing portal.');
    }
  };

  if (loading) return <div style={s.page}><p>Loading billing information…</p></div>;

  const currentPlan = status?.plan ?? 'trial';
  const planInfo    = PLAN_FEATURES[currentPlan] ?? PLAN_FEATURES.trial;
  const trialEnds   = status?.trial_ends_at ? new Date(status.trial_ends_at) : null;
  const daysLeft    = trialEnds ? Math.max(0, Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div style={s.page}>
      <h1 style={s.title}>Billing & Subscription</h1>

      {/* Current Plan Card */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={s.planLabel}>Current Plan</div>
            <div style={{ ...s.planName, color: planInfo.color }}>{planInfo.label}</div>
            {currentPlan === 'trial' && daysLeft !== null && (
              <div style={s.trialNote}>
                {daysLeft > 0 ? `Trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Trial expired'}
              </div>
            )}
          </div>
          {status?.subscription?.status === 'active' && (
            <button style={s.manageBtn} onClick={handleManage}>
              Manage Billing
            </button>
          )}
        </div>

        <div style={s.limits}>
          <div style={s.limitItem}><span>Branches</span><strong>{planInfo.branches}</strong></div>
          <div style={s.limitItem}><span>Staff</span><strong>{planInfo.staff}</strong></div>
          <div style={s.limitItem}><span>Services</span><strong>{planInfo.services}</strong></div>
        </div>
      </div>

      {/* Upgrade Options */}
      {currentPlan !== 'enterprise' && (
        <>
          <h2 style={s.subtitle}>Upgrade your plan</h2>
          <div style={s.plans}>
            {[
              { key: 'basic',      price: 'LKR 2,900/mo',  features: ['1 branch', '10 staff', '50 services', 'Email & WhatsApp'] },
              { key: 'pro',        price: 'LKR 7,900/mo',  features: ['5 branches', '50 staff', '200 services', 'AI Chat', 'Advanced Reports'] },
              { key: 'enterprise', price: 'Custom pricing', features: ['Unlimited branches', 'Unlimited staff', 'Custom domain', 'API access', 'Priority support'] },
            ].map(({ key, price, features }) => {
              if (key === currentPlan && currentPlan !== 'trial') return null;
              const info = PLAN_FEATURES[key];
              return (
                <div key={key} style={s.planCard(key === 'pro')}>
                  {key === 'pro' && <div style={s.popular}>Most Popular</div>}
                  <div style={{ ...s.planCardName, color: info.color }}>{info.label}</div>
                  <div style={s.price}>{price}</div>
                  <ul style={s.featureList}>
                    {features.map((f) => <li key={f} style={s.featureItem}>✓ {f}</li>)}
                  </ul>
                  <button
                    style={{ ...s.upgradeBtn, background: info.color }}
                    onClick={() => handleUpgrade(key)}
                    disabled={!!upgrading}
                  >
                    {upgrading === key ? 'Redirecting…' : `Get ${info.label}`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const s = {
  page:       { padding: '24px 32px', maxWidth: 900 },
  title:      { fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#1e293b' },
  subtitle:   { fontSize: 18, fontWeight: 600, margin: '32px 0 16px', color: '#1e293b' },
  card:       { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, marginBottom: 16 },
  planLabel:  { fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 },
  planName:   { fontSize: 28, fontWeight: 700, marginTop: 4 },
  trialNote:  { fontSize: 13, color: '#d97706', marginTop: 4 },
  limits:     { display: 'flex', gap: 24, marginTop: 20 },
  limitItem:  { display: 'flex', flexDirection: 'column', gap: 2, '& span': { fontSize: 12, color: '#64748b' }, '& strong': { fontSize: 18, fontWeight: 700 } },
  manageBtn:  { padding: '8px 18px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  plans:      { display: 'flex', gap: 16, flexWrap: 'wrap' },
  planCard:   (highlight) => ({
    flex: 1,
    minWidth: 220,
    background: highlight ? '#f5f3ff' : '#fff',
    border: `2px solid ${highlight ? '#7c3aed' : '#e2e8f0'}`,
    borderRadius: 10,
    padding: 24,
    position: 'relative',
  }),
  popular:    { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 12px', borderRadius: 99, whiteSpace: 'nowrap' },
  planCardName: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  price:      { fontSize: 22, fontWeight: 700, color: '#1e293b', marginBottom: 16 },
  featureList: { paddingLeft: 0, listStyle: 'none', margin: '0 0 20px' },
  featureItem: { fontSize: 13, color: '#374151', padding: '3px 0' },
  upgradeBtn: { width: '100%', padding: '10px 0', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
};

export default BillingPage;
