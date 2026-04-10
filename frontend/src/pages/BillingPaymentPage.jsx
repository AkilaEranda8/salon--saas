import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

/* ── Plan accent colours ──────────────────────────────────────────────────── */
const PLAN_ACCENT = {
  basic:      { color: '#2563EB', gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' },
  pro:        { color: '#7C3AED', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)' },
  enterprise: { color: '#059669', gradient: 'linear-gradient(135deg, #064E3B 0%, #059669 100%)' },
};
const DEFAULT_ACCENT = { color: '#2563EB', gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' };

/* ── SVG Icons ────────────────────────────────────────────────────────────── */
const IconCard = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2.5" ry="2.5"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
    <line x1="6" y1="15" x2="10" y2="15"/>
  </svg>
);
const IconBank = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3l9 7H3l9-7z"/>
    <line x1="5" y1="10" x2="5" y2="21"/><line x1="9" y1="10" x2="9" y2="21"/>
    <line x1="15" y1="10" x2="15" y2="21"/><line x1="19" y1="10" x2="19" y2="21"/>
  </svg>
);
const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IconShield = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export default function BillingPaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadingMethod, setLoadingMethod] = useState('');
  const [selected, setSelected] = useState(null);
  const [apiPlans, setApiPlans] = useState([]);

  const plan = (searchParams.get('plan') || '').toLowerCase();
  const accent = PLAN_ACCENT[plan] || DEFAULT_ACCENT;

  // Enterprise uses Contact Sales — redirect back to billing
  useEffect(() => {
    if (plan === 'enterprise') {
      navigate('/billing', { replace: true });
    }
  }, [plan, navigate]);

  useEffect(() => {
    api.get('/public/plans')
      .then((res) => setApiPlans(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const planMeta = useMemo(() => {
    const found = apiPlans.find((p) => p.key === plan);
    if (!found) return null;
    const price = [found.price_display, found.price_period].filter(Boolean).join(' ').trim();
    return {
      label: found.label,
      price: found.price_display || 'Custom',
      period: found.price_period || '',
      features: Array.isArray(found.features) ? found.features : [],
    };
  }, [plan, apiPlans]);

  const handleCardPayment = async () => {
    if (!planMeta) {
      toast.error('Invalid plan selected. Please choose a plan again.');
      navigate('/billing');
      return;
    }
    setLoadingMethod('card');
    try {
      const res = await api.post('/billing/checkout', { plan });
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start card checkout.');
      setLoadingMethod('');
    }
  };

  const handleBankTransfer = () => {
    if (!planMeta) {
      toast.error('Invalid plan selected. Please choose a plan again.');
      navigate('/billing');
      return;
    }
    navigate(`/bank-slip-upload?plan=${plan}`);
  };

  const handleContinue = () => {
    if (selected === 'card') handleCardPayment();
    else if (selected === 'bank') handleBankTransfer();
  };

  const methods = [
    {
      id: 'card',
      icon: <IconCard />,
      title: 'Credit / Debit Card',
      desc: 'Secure instant checkout via Stripe. Visa, Mastercard & more.',
      badges: ['Instant', 'Auto-renew'],
      accentBg: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
      accentBorder: '#BFDBFE',
      accentColor: '#1D4ED8',
    },
    {
      id: 'bank',
      icon: <IconBank />,
      title: 'Bank Transfer',
      desc: 'Upload your payment slip after transfer. Activation within 24h.',
      badges: ['Manual', 'Slip upload'],
      accentBg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
      accentBorder: '#A7F3D0',
      accentColor: '#047857',
    },
  ];

  return (
    <PageWrapper
      title=""
      subtitle=""
      actions={
        <button
          onClick={() => navigate('/billing')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: '#fff',
            border: '1.5px solid #E5E7EB', borderRadius: 10,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: '#667085', fontFamily: "'Inter', sans-serif",
            transition: 'all 0.15s',
          }}
        >
          <IconBack /> Back to Billing
        </button>
      }
    >
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Plan Summary Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            background: accent.gradient,
            borderRadius: 20, padding: '28px 30px',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Decorative */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 60, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

          <span style={{
            display: 'inline-block', background: 'rgba(255,255,255,0.18)',
            color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '3px 10px', borderRadius: 99,
            border: '1px solid rgba(255,255,255,0.25)', fontFamily: "'Inter', sans-serif",
          }}>
            Selected plan
          </span>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
            <span style={{
              fontSize: 26, fontWeight: 900, color: '#fff',
              fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.4px',
            }}>
              {planMeta?.label || 'Loading…'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: "'Sora', sans-serif" }}>
              {planMeta?.price || '—'}
            </span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
              {planMeta?.period || ''}
            </span>
          </div>

          {planMeta?.features?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {planMeta.features.slice(0, 4).map((f) => (
                <span key={f} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 99, padding: '4px 12px',
                  fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.9)',
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <IconCheck /> {f}
                </span>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Section title ── */}
        <div>
          <h2 style={{
            margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#101828',
            fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.3px',
          }}>
            How would you like to pay?
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
            Choose your preferred payment method below.
          </p>
        </div>

        {/* ── Payment Method Cards ── */}
        <div style={{ display: 'grid', gap: 14 }}>
          {methods.map((m, i) => {
            const isSelected = selected === m.id;
            return (
              <motion.button
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                whileHover={{ scale: 1.008 }}
                whileTap={{ scale: 0.995 }}
                onClick={() => setSelected(m.id)}
                disabled={loadingMethod !== ''}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '20px 22px', borderRadius: 16,
                  border: isSelected ? `2px solid ${m.accentColor}` : '2px solid #E5E7EB',
                  background: isSelected ? m.accentBg : '#fff',
                  cursor: loadingMethod ? 'not-allowed' : 'pointer',
                  opacity: loadingMethod && loadingMethod !== m.id ? 0.5 : 1,
                  boxShadow: isSelected
                    ? `0 4px 20px ${m.accentColor}20, 0 0 0 3px ${m.accentColor}12`
                    : '0 1px 4px rgba(16,24,40,0.05)',
                  transition: 'all 0.18s ease',
                  position: 'relative', overflow: 'hidden',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {/* Radio indicator */}
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  border: isSelected ? `2px solid ${m.accentColor}` : '2px solid #D0D5DD',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? m.accentColor : '#fff',
                  transition: 'all 0.15s',
                }}>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}
                    />
                  )}
                </div>

                {/* Icon */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  background: isSelected ? `${m.accentColor}15` : '#F2F4F7',
                  border: `1.5px solid ${isSelected ? `${m.accentColor}30` : '#E5E7EB'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isSelected ? m.accentColor : '#98A2B3',
                  transition: 'all 0.15s',
                }}>
                  {m.icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 800, color: isSelected ? m.accentColor : '#344054',
                    fontFamily: "'Sora', 'Manrope', sans-serif", marginBottom: 3,
                    transition: 'color 0.15s',
                  }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#667085', lineHeight: 1.45 }}>
                    {m.desc}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {m.badges.map((b) => (
                      <span key={b} style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 99,
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
                        background: isSelected ? `${m.accentColor}12` : '#F2F4F7',
                        color: isSelected ? m.accentColor : '#98A2B3',
                        border: `1px solid ${isSelected ? `${m.accentColor}25` : '#E5E7EB'}`,
                        transition: 'all 0.15s',
                      }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* ── Continue Button ── */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={handleContinue}
          disabled={!selected || loadingMethod !== ''}
          style={{
            width: '100%', padding: '15px 0',
            background: selected
              ? (methods.find(m => m.id === selected)?.accentColor || accent.color)
              : '#D0D5DD',
            color: '#fff', border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: selected ? `0 6px 24px ${methods.find(m => m.id === selected)?.accentColor}40` : 'none',
            transition: 'all 0.2s ease',
            fontFamily: "'Sora', 'Manrope', sans-serif",
            letterSpacing: '0.01em',
            opacity: loadingMethod ? 0.7 : 1,
          }}
        >
          {loadingMethod === 'card' ? 'Redirecting to Stripe…' : 'Continue'} <IconArrow />
        </motion.button>

        {/* ── Security footer ── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 0', color: '#98A2B3', fontSize: 12, fontFamily: "'Inter', sans-serif",
          }}
        >
          <IconShield />
          <span>All payments are encrypted and secure. Cancel anytime.</span>
        </motion.div>
      </div>
    </PageWrapper>
  );
}
