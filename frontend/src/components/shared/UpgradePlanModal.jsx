import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

/**
 * UpgradePlanModal
 *
 * A global modal that listens for 'plan-upgrade-needed' events
 * (dispatched by the axios 402/403 interceptor) and displays a
 * branded upgrade prompt with plan comparison.
 *
 * Mount once inside AppShell (App.jsx).
 */

const PLAN_DISPLAY = {
  basic:      { label: 'Basic',      price: 'LKR 2,900', color: '#2563EB', gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)' },
  pro:        { label: 'Pro',        price: 'LKR 7,900', color: '#7C3AED', gradient: 'linear-gradient(135deg, #5B21B6 0%, #8B5CF6 100%)' },
  enterprise: { label: 'Enterprise', price: 'Custom',     color: '#059669', gradient: 'linear-gradient(135deg, #064E3B 0%, #10B981 100%)' },
};

const PLAN_FEATURES_SHORT = {
  basic: ['1 branch', '10 staff', '50 services', 'SMS offers', 'Discounts & packages'],
  pro:   ['5 branches', '50 staff', '200 services', 'AI Chat', 'KPI Dashboard', 'Marketing Automation', 'Loyalty & Membership'],
  enterprise: ['Unlimited everything', 'Custom domain', 'API access', 'Priority support'],
};

export default function UpgradePlanModal() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const currentPlan = (tenant?.plan || 'trial').toLowerCase();

  const handleEvent = useCallback((e) => {
    setDetail(e.detail || {});
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener('plan-upgrade-needed', handleEvent);
    return () => window.removeEventListener('plan-upgrade-needed', handleEvent);
  }, [handleEvent]);

  // Also expose globally so pages can trigger it directly
  useEffect(() => {
    window.__showUpgradeModal = (info) => {
      setDetail(info || {});
      setOpen(true);
    };
    return () => { delete window.__showUpgradeModal; };
  }, []);

  const close = () => { setOpen(false); setDetail(null); };

  const code    = detail?.code || '';
  const message = detail?.message || '';
  const minPlan = detail?.requiredPlan || detail?.minPlan || '';
  const feature = detail?.feature || '';

  const isLimitHit  = code?.startsWith('PLAN_LIMIT_');
  const isFeatureGated = code === 'FEATURE_GATED';

  const title = isLimitHit
    ? 'Plan Limit Reached'
    : isFeatureGated
      ? 'Feature Not Available'
      : 'Upgrade Your Plan';

  const subtitle = isLimitHit
    ? (message || `You've reached the maximum for your ${currentPlan} plan.`)
    : isFeatureGated
      ? (message || `This feature requires the ${PLAN_DISPLAY[minPlan]?.label || 'Pro'} plan.`)
      : 'Unlock more features by upgrading your subscription.';

  // Plans to show (only those above current plan)
  const planOrder = ['basic', 'pro', 'enterprise'];
  const currentIdx = planOrder.indexOf(currentPlan);
  const upgradePlans = planOrder.filter((_, i) => i > currentIdx);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{
              background: '#fff',
              borderRadius: 20,
              width: '100%',
              maxWidth: upgradePlans.length > 1 ? 680 : 440,
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
          >
            {/* Header */}
            <div style={{
              background: isLimitHit
                ? 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)'
                : isFeatureGated
                  ? 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)'
                  : 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
              padding: '28px 32px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Decorative orbs */}
              <div style={{ position:'absolute', top:-40, right:-40, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }} />
              <div style={{ position:'absolute', bottom:-20, left:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: 'rgba(255,255,255,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {isLimitHit
                          ? <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" />
                          : <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        }
                      </svg>
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, fontFamily: "'Sora','Inter',sans-serif", letterSpacing: '-0.02em' }}>
                        {title}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, marginTop: 2, fontFamily: "'Inter',sans-serif" }}>
                        {subtitle}
                      </div>
                    </div>
                  </div>
                  <button onClick={close} style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
                    width: 32, height: 32, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                  >
                    &times;
                  </button>
                </div>

                {/* Current plan pill */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginTop: 14, padding: '4px 14px', borderRadius: 99,
                  background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: "'Inter',sans-serif",
                }}>
                  Current: {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                  {detail?.current != null && detail?.limit != null && (
                    <span style={{ opacity: 0.8 }}>&middot; {detail.current}/{detail.limit} used</span>
                  )}
                </div>
              </div>
            </div>

            {/* Plan cards */}
            <div style={{ padding: '24px 28px 28px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {upgradePlans.map(planKey => {
                const p = PLAN_DISPLAY[planKey];
                const features = PLAN_FEATURES_SHORT[planKey] || [];
                const isRecommended = planKey === (minPlan || 'pro');
                return (
                  <div key={planKey} style={{
                    flex: '1 1 180px', minWidth: 180,
                    border: isRecommended ? `2px solid ${p.color}` : '1.5px solid #EAECF0',
                    borderRadius: 16,
                    padding: 20,
                    position: 'relative',
                    transition: 'transform 0.18s, box-shadow 0.18s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${p.color}18`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  onClick={() => { close(); navigate(`/billing/payment?plan=${planKey}`); }}
                  >
                    {isRecommended && (
                      <div style={{
                        position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                        background: p.gradient, color: '#fff', fontSize: 10, fontWeight: 800,
                        padding: '3px 14px', borderRadius: 99, textTransform: 'uppercase',
                        letterSpacing: '0.08em', fontFamily: "'Inter',sans-serif",
                        boxShadow: `0 2px 8px ${p.color}30`,
                      }}>
                        Recommended
                      </div>
                    )}

                    <div style={{ fontSize: 15, fontWeight: 800, color: p.color, fontFamily: "'Sora','Inter',sans-serif" }}>
                      {p.label}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: '#101828', fontFamily: "'Inter',sans-serif" }}>
                        {p.price}
                      </span>
                      {planKey !== 'enterprise' && (
                        <span style={{ fontSize: 13, color: '#667085', fontWeight: 500 }}>/mo</span>
                      )}
                    </div>

                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {features.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475467', fontFamily: "'Inter',sans-serif" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {f}
                        </div>
                      ))}
                    </div>

                    <button style={{
                      marginTop: 18, width: '100%', padding: '10px 0',
                      background: isRecommended ? p.gradient : '#F4F5F7',
                      color: isRecommended ? '#fff' : '#344054',
                      border: 'none', borderRadius: 10, cursor: 'pointer',
                      fontWeight: 700, fontSize: 13, fontFamily: "'Inter',sans-serif",
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    onClick={e => { e.stopPropagation(); close(); navigate(`/billing/payment?plan=${planKey}`); }}
                    >
                      {planKey === 'enterprise' ? 'Contact Sales' : `Upgrade to ${p.label}`}
                    </button>
                  </div>
                );
              })}

              {upgradePlans.length === 0 && (
                <div style={{ textAlign: 'center', width: '100%', padding: '20px 0', color: '#475467', fontSize: 14, fontFamily: "'Inter',sans-serif" }}>
                  You're on the highest plan. Contact support for custom limits.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
