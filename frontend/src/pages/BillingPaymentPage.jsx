import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */
const IconCard = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);
const IconBank = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3l9 7H3l9-7z"/>
    <path d="M5 10v8"/><path d="M9 10v8"/><path d="M15 10v8"/><path d="M19 10v8"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconLock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

/* ── Plan colors ───────────────────────────────────────────────────────────── */
const PLAN_COLORS = {
  basic: { color: '#2563EB', gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)', bg: '#EFF6FF', border: '#BFDBFE' },
  pro:   { color: '#7C3AED', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)', bg: '#FAF5FF', border: '#DDD6FE' },
};

export default function BillingPaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadingMethod, setLoadingMethod] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [apiPlans, setApiPlans] = useState([]);

  const plan = (searchParams.get('plan') || '').toLowerCase();
  const colors = PLAN_COLORS[plan] || PLAN_COLORS.basic;

  // Enterprise uses Contact Sales — redirect back
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
    const price = found.price_display || 'Custom';
    const period = found.price_period || '';
    return {
      label: found.label,
      price,
      period,
      features: Array.isArray(found.features) ? found.features : [],
      tagline: found.tagline || '',
    };
  }, [plan, apiPlans]);

  const handleContinue = async () => {
    if (!planMeta) {
      toast.error('Invalid plan selected. Please choose a plan again.');
      navigate('/billing');
      return;
    }
    if (!selectedMethod) {
      toast.error('Please select a payment method.');
      return;
    }

    if (selectedMethod === 'card') {
      setLoadingMethod('card');
      try {
        const res = await api.post('/billing/checkout', { plan });
        window.location.href = res.data.url;
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to start card checkout.');
        setLoadingMethod('');
      }
    } else {
      navigate(`/bank-slip-upload?plan=${plan}`);
    }
  };

  const methods = [
    {
      key: 'card',
      icon: <IconCard />,
      title: 'Credit / Debit Card',
      desc: 'Secure checkout via Stripe. Visa, Mastercard & more.',
      iconBg: 'linear-gradient(135deg, #1E3A5F, #2563EB)',
      badge: 'Instant',
      badgeColor: '#2563EB',
      badgeBg: '#EFF6FF',
    },
    {
      key: 'bank',
      icon: <IconBank />,
      title: 'Bank Transfer',
      desc: 'Upload your bank slip. Activated after admin approval.',
      iconBg: 'linear-gradient(135deg, #064E3B, #059669)',
      badge: '1–2 days',
      badgeColor: '#059669',
      badgeBg: '#ECFDF5',
    },
  ];

  return (
    <PageWrapper
      title="Complete Your Upgrade"
      subtitle="You're one step away from unlocking more power for your salon"
      actions={
        <button
          onClick={() => navigate('/billing')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', background: '#fff',
            border: '1.5px solid #EAECF0', borderRadius: 10,
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
            color: '#344054', boxShadow: '0 1px 4px rgba(16,24,40,0.06)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <IconArrowLeft /> Back
        </button>
      }
    >
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 24 }}>

        {/* ── Selected Plan Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: colors.gradient,
            borderRadius: 20, padding: '28px 32px',
            boxShadow: '0 8px 32px rgba(37,99,235,0.18)',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -25, right: 80, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span style={{
                display: 'inline-block', background: 'rgba(255,255,255,0.18)',
                color: '#fff', fontSize: 11, fontWeight: 800,
                letterSpacing: '0.07em', textTransform: 'uppercase',
                padding: '4px 12px', borderRadius: 99,
                border: '1px solid rgba(255,255,255,0.25)',
                fontFamily: "'Inter', sans-serif",
              }}>
                Selected Plan
              </span>
              <h2 style={{
                margin: '10px 0 4px', fontSize: 26, fontWeight: 900,
                color: '#fff', fontFamily: "'Sora', 'Manrope', sans-serif",
                letterSpacing: '-0.4px',
              }}>
                {planMeta?.label || 'Loading...'}
              </h2>
              <p style={{
                margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)',
                fontFamily: "'Inter', sans-serif",
              }}>
                {planMeta?.tagline || 'Upgrade your salon management'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: "'Sora', sans-serif" }}>
                {planMeta?.price || '—'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontFamily: "'Inter', sans-serif" }}>
                {planMeta?.period || ''}
              </div>
            </div>
          </div>

          {/* Plan features strip */}
          {planMeta?.features?.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
              marginTop: 18, paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.15)',
            }}>
              {planMeta.features.slice(0, 5).map((f) => (
                <span key={f} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12.5, color: 'rgba(255,255,255,0.85)',
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 99,
                    background: 'rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconCheck />
                  </span>
                  {f}
                </span>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Payment Methods ── */}
        <div>
          <h3 style={{
            margin: '0 0 4px', fontSize: 18, fontWeight: 800,
            color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif",
            letterSpacing: '-0.2px',
          }}>
            How would you like to pay?
          </h3>
          <p style={{
            margin: '0 0 16px', fontSize: 13, color: '#667085',
            fontFamily: "'Inter', sans-serif",
          }}>
            Choose your preferred payment method below.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {methods.map((m, i) => {
              const isSelected = selectedMethod === m.key;
              return (
                <motion.div
                  key={m.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  whileHover={{ translateY: -2 }}
                  onClick={() => !loadingMethod && setSelectedMethod(m.key)}
                  style={{
                    background: isSelected ? `${m.badgeBg}` : '#fff',
                    border: `2px solid ${isSelected ? m.badgeColor : '#EAECF0'}`,
                    borderRadius: 16, padding: '22px 20px',
                    cursor: loadingMethod ? 'not-allowed' : 'pointer',
                    position: 'relative',
                    boxShadow: isSelected
                      ? `0 4px 20px ${m.badgeColor}25`
                      : '0 2px 8px rgba(16,24,40,0.05)',
                    transition: 'all 0.2s ease',
                    opacity: loadingMethod && loadingMethod !== m.key ? 0.5 : 1,
                  }}
                >
                  {/* Selection radio */}
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    width: 22, height: 22, borderRadius: 99,
                    border: `2px solid ${isSelected ? m.badgeColor : '#D0D5DD'}`,
                    background: isSelected ? m.badgeColor : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {isSelected && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </motion.div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      background: m.iconBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff',
                    }}>
                      {m.icon}
                    </div>
                    <div style={{ flex: 1, paddingRight: 20 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                      }}>
                        <span style={{
                          fontSize: 15, fontWeight: 800, color: '#101828',
                          fontFamily: "'Sora', 'Manrope', sans-serif",
                        }}>
                          {m.title}
                        </span>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, color: m.badgeColor,
                          background: m.badgeBg, padding: '2px 8px',
                          borderRadius: 99, border: `1px solid ${m.badgeColor}30`,
                          fontFamily: "'Inter', sans-serif",
                          letterSpacing: '0.03em',
                        }}>
                          {m.badge}
                        </span>
                      </div>
                      <p style={{
                        margin: 0, fontSize: 13, color: '#667085',
                        lineHeight: 1.5, fontFamily: "'Inter', sans-serif",
                      }}>
                        {m.desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Continue Button ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
        >
          <button
            onClick={handleContinue}
            disabled={!selectedMethod || !!loadingMethod}
            style={{
              width: '100%', maxWidth: 400, padding: '14px 24px',
              background: selectedMethod
                ? colors.gradient
                : 'linear-gradient(135deg, #D0D5DD, #E4E7EC)',
              color: '#fff', border: 'none',
              borderRadius: 12, fontSize: 15, fontWeight: 800,
              cursor: selectedMethod && !loadingMethod ? 'pointer' : 'not-allowed',
              boxShadow: selectedMethod ? `0 4px 16px ${colors.color}40` : 'none',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: "'Sora', 'Manrope', sans-serif",
              letterSpacing: '0.02em',
              opacity: loadingMethod ? 0.7 : 1,
            }}
          >
            {loadingMethod === 'card' ? 'Redirecting to Stripe...' : (
              <>
                {selectedMethod === 'bank' ? 'Continue to Bank Transfer' : selectedMethod === 'card' ? 'Proceed to Checkout' : 'Select a Method'}
                {selectedMethod && <IconArrowRight />}
              </>
            )}
          </button>

          {/* Security badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            fontSize: 12, color: '#98A2B3',
            fontFamily: "'Inter', sans-serif",
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconLock /> SSL Encrypted
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconShield /> Secure Payment
            </span>
          </div>
        </motion.div>
      </div>
    </PageWrapper>
  );
}
