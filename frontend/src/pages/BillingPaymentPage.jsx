import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

/* ── Inline SVG Icons ──────────────────────────────────────────────────────── */
const IconCard = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);
const IconBank = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v4"/><path d="M12 14v4"/><path d="M16 14v4"/>
  </svg>
);
const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IconShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconLock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

/* ── Plan accent styles ────────────────────────────────────────────────────── */
const PLAN_ACCENTS = {
  basic:      { color: '#2563EB', gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)', light: '#EFF6FF', border: '#BFDBFE' },
  pro:        { color: '#7C3AED', gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)', light: '#FAF5FF', border: '#DDD6FE' },
  enterprise: { color: '#059669', gradient: 'linear-gradient(135deg, #064E3B 0%, #059669 100%)', light: '#ECFDF5', border: '#A7F3D0' },
};
const DEFAULT_ACCENT = PLAN_ACCENTS.basic;

export default function BillingPaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadingMethod, setLoadingMethod] = useState('');
  const [selected, setSelected] = useState(null);
  const [apiPlans, setApiPlans] = useState([]);

  const plan = (searchParams.get('plan') || '').toLowerCase();
  const accent = PLAN_ACCENTS[plan] || DEFAULT_ACCENT;

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

  const backBtn = (
    <button
      onClick={() => navigate('/billing')}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 16px', background: '#fff',
        border: '1.5px solid #EAECF0', borderRadius: 10,
        cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#344054',
        boxShadow: '0 1px 4px rgba(16,24,40,0.06)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <IconBack /> Back
    </button>
  );

  return (
    <PageWrapper
      title="Complete Your Upgrade"
      subtitle="You're one step away from unlocking more features"
      actions={backBtn}
    >
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 20 }}>

        {/* ── Selected Plan Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: accent.gradient,
            borderRadius: 18, padding: '24px 28px',
            position: 'relative', overflow: 'hidden',
            boxShadow: `0 8px 32px ${accent.color}30`,
          }}
        >
          {/* Decorative orbs */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, right: 60, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative' }}>
            <span style={{
              display: 'inline-block', background: 'rgba(255,255,255,0.18)',
              color: '#fff', fontSize: 11, fontWeight: 800,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '4px 12px', borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.25)',
              fontFamily: "'Inter', sans-serif", marginBottom: 12,
            }}>
              Selected Plan
            </span>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{
                margin: 0, fontSize: 26, fontWeight: 900, color: '#fff',
                fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
              }}>
                {planMeta?.label || 'Loading…'}
              </h2>
              <div>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Sora', sans-serif" }}>
                  {planMeta?.price || '—'}
                </span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontFamily: "'Inter', sans-serif", marginLeft: 4 }}>
                  {planMeta?.period || ''}
                </span>
              </div>
            </div>

            {/* Feature pills */}
            {planMeta?.features?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                {planMeta.features.slice(0, 4).map((f) => (
                  <span
                    key={f}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'rgba(255,255,255,0.14)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      borderRadius: 99, padding: '4px 12px',
                      fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    <IconCheck /> {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Payment Methods ── */}
        <div>
          <h3 style={{
            margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#101828',
            fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.2px',
          }}>
            Payment Method
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
            Choose your preferred way to pay
          </p>

          <div style={{ display: 'grid', gap: 12 }}>
            {/* Card Payment Option */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.995 }}
              onClick={() => setSelected('card')}
              style={{
                width: '100%', padding: '18px 20px',
                borderRadius: 14,
                border: selected === 'card' ? `2px solid ${accent.color}` : '1.5px solid #E5E7EB',
                background: selected === 'card' ? `${accent.light}` : '#fff',
                cursor: 'pointer', textAlign: 'left',
                boxShadow: selected === 'card' ? `0 4px 16px ${accent.color}20` : '0 1px 4px rgba(16,24,40,0.04)',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 16,
                position: 'relative',
              }}
            >
              {/* Radio indicator */}
              <div style={{
                width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                border: selected === 'card' ? `2px solid ${accent.color}` : '2px solid #D0D5DD',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: selected === 'card' ? accent.color : '#fff',
                transition: 'all 0.15s',
              }}>
                {selected === 'card' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>

              {/* Icon */}
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: selected === 'card' ? accent.gradient : 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: selected === 'card' ? '#fff' : '#6B7280',
                transition: 'all 0.15s',
              }}>
                <IconCard />
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: 800, color: '#111827',
                  fontFamily: "'Sora', 'Manrope', sans-serif",
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  Card Payment
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: accent.color,
                    background: `${accent.color}14`, border: `1px solid ${accent.color}25`,
                    borderRadius: 99, padding: '2px 8px',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    Instant
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#667085', marginTop: 3, fontFamily: "'Inter', sans-serif", lineHeight: 1.4 }}>
                  Pay securely with Visa, Mastercard or other cards via Stripe
                </div>
              </div>
            </motion.button>

            {/* Bank Transfer Option */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.995 }}
              onClick={() => setSelected('bank')}
              style={{
                width: '100%', padding: '18px 20px',
                borderRadius: 14,
                border: selected === 'bank' ? '2px solid #059669' : '1.5px solid #E5E7EB',
                background: selected === 'bank' ? '#ECFDF5' : '#fff',
                cursor: 'pointer', textAlign: 'left',
                boxShadow: selected === 'bank' ? '0 4px 16px rgba(5,150,105,0.15)' : '0 1px 4px rgba(16,24,40,0.04)',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 16,
                position: 'relative',
              }}
            >
              {/* Radio indicator */}
              <div style={{
                width: 22, height: 22, borderRadius: 99, flexShrink: 0,
                border: selected === 'bank' ? '2px solid #059669' : '2px solid #D0D5DD',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: selected === 'bank' ? '#059669' : '#fff',
                transition: 'all 0.15s',
              }}>
                {selected === 'bank' && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>

              {/* Icon */}
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: selected === 'bank' ? 'linear-gradient(135deg, #064E3B, #059669)' : 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: selected === 'bank' ? '#fff' : '#6B7280',
                transition: 'all 0.15s',
              }}>
                <IconBank />
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: 800, color: '#111827',
                  fontFamily: "'Sora', 'Manrope', sans-serif",
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  Bank Transfer
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#6B7280',
                    background: '#F3F4F6', border: '1px solid #E5E7EB',
                    borderRadius: 99, padding: '2px 8px',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    Manual
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#667085', marginTop: 3, fontFamily: "'Inter', sans-serif", lineHeight: 1.4 }}>
                  Transfer to our bank account and upload the payment slip
                </div>
              </div>
            </motion.button>
          </div>
        </div>

        {/* ── Continue Button ── */}
        <motion.button
          whileHover={selected ? { scale: 1.015 } : {}}
          whileTap={selected ? { scale: 0.985 } : {}}
          onClick={handleContinue}
          disabled={!selected || !!loadingMethod}
          style={{
            width: '100%', padding: '15px 0',
            background: selected
              ? (selected === 'card' ? accent.gradient : 'linear-gradient(135deg, #064E3B, #059669)')
              : '#E5E7EB',
            color: selected ? '#fff' : '#9CA3AF',
            border: 'none', borderRadius: 12,
            fontSize: 15, fontWeight: 800,
            cursor: selected && !loadingMethod ? 'pointer' : 'not-allowed',
            opacity: loadingMethod ? 0.7 : 1,
            boxShadow: selected ? `0 4px 16px ${selected === 'card' ? accent.color : '#059669'}40` : 'none',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.2px',
          }}
        >
          {loadingMethod === 'card' ? (
            'Redirecting to Stripe…'
          ) : (
            <>
              {selected === 'card' ? 'Continue to Payment' : selected === 'bank' ? 'Continue to Bank Transfer' : 'Select a payment method'}
              {selected && <IconArrowRight />}
            </>
          )}
        </motion.button>

        {/* ── Trust Badges ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 20, flexWrap: 'wrap', padding: '8px 0',
          }}
        >
          {[
            { icon: <IconShield />, text: 'SSL Secured' },
            { icon: <IconLock />, text: '256-bit Encryption' },
            { icon: <IconCheck />, text: 'Cancel Anytime' },
          ].map(({ icon, text }) => (
            <span
              key={text}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, color: '#98A2B3',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {icon} {text}
            </span>
          ))}
        </motion.div>

        {/* ── Info Note ── */}
        <div style={{
          background: '#F9FAFB', border: '1px solid #F2F4F7',
          borderRadius: 12, padding: '14px 18px',
          fontSize: 12.5, color: '#667085', lineHeight: 1.7,
          fontFamily: "'Inter', sans-serif",
        }}>
          <strong style={{ color: '#344054' }}>How it works:</strong>{' '}
          Card payments are processed instantly through Stripe. Bank transfer payments require you to upload
          a payment slip, which will be verified by our admin team. Your plan will be activated once the payment is confirmed.
        </div>
      </div>
    </PageWrapper>
  );
}
