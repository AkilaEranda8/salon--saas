import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard } from '../components/ui/PageKit';

/* ── Inline SVG icons ──────────────────────────────────────────────────────── */
const IconBuilding   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/><path d="M3 15h6"/><path d="M15 3v18"/><path d="M15 9h6"/><path d="M15 15h6"/></svg>;
const IconUsers2     = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconScissors   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>;
const IconCreditCard = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
const IconSettings   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const IconArrowRight = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconCheck2     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconAlert      = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IconSpark      = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconShield     = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;

/* ── Plan visual styles (colors/gradients only — data comes from API) ──────── */
const PLAN_STYLES = {
  trial: {
    color: '#64748b', bg: '#f8fafc', border: '#cbd5e1',
    gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
  },
  basic: {
    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
    gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
  },
  pro: {
    color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe',
    gradient: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)',
  },
  enterprise: {
    color: '#059669', bg: '#ecfdf5', border: '#a7f3d0',
    gradient: 'linear-gradient(135deg, #064E3B 0%, #059669 100%)',
  },
};
const DEFAULT_STYLE = { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)' };

/* helper: -1 means unlimited */
const fmtLimit = (v) => (v === -1 || v === null || v === undefined ? '∞' : v);

/* ── Trial progress bar ────────────────────────────────────────────────────── */
const TrialBar = ({ daysLeft, totalDays = 14 }) => {
  const pct = Math.max(0, Math.min(100, (daysLeft / totalDays) * 100));
  return (
    <div style={{ marginTop: 16, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
          Trial period
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: daysLeft <= 7 ? '#FCD34D' : '#fff', fontFamily: "'Inter', sans-serif" }}>
          {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining` : 'Expired'}
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ height: '100%', background: daysLeft <= 3 ? '#EF4444' : daysLeft <= 7 ? '#FCD34D' : 'rgba(255,255,255,0.85)', borderRadius: 99 }}
        />
      </div>
    </div>
  );
};

/* ── Main Component ─────────────────────────────────────────────────────────── */
const BillingPage = () => {
  const { tenant } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [managing, setManaging]   = useState(false);
  const [apiPlans, setApiPlans]   = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/billing/status'),
      api.get('/public/plans').catch(() => ({ data: [] })),
    ])
      .then(([statusRes, plansRes]) => {
        setStatus(statusRes.data);
        setApiPlans(Array.isArray(plansRes.data) ? plansRes.data : []);
      })
      .catch(() => toast.error('Failed to load billing info.'))
      .finally(() => setLoading(false));
  }, []);

  /* Build PLANS map and UPGRADE_PLANS list from API data */
  const { PLANS, upgradePlans } = useMemo(() => {
    const map = {};
    const list = [];

    for (const p of apiPlans) {
      const style = PLAN_STYLES[p.key] || DEFAULT_STYLE;
      map[p.key] = {
        label: p.label,
        ...style,
        branches: fmtLimit(p.max_branches),
        staff: fmtLimit(p.max_staff),
        services: fmtLimit(p.max_services),
      };
      if (p.key !== 'trial') {
        list.push({
          key: p.key,
          price: p.price_display || 'Custom',
          period: p.price_period || '',
          tagline: p.tagline || '',
          popular: !!p.is_popular,
          features: Array.isArray(p.features) ? p.features : [],
        });
      }
    }

    // Fallback if API returned nothing
    if (!map.trial) {
      map.trial = { label: 'Free Trial', ...PLAN_STYLES.trial, branches: 1, staff: 5, services: 20 };
    }

    return { PLANS: map, upgradePlans: list };
  }, [apiPlans]);

  const handleUpgrade = (plan) => {
    navigate(`/billing/payment?plan=${plan}`);
  };

  const handleManage = async () => {
    setManaging(true);
    try {
      const res = await api.get('/billing/portal');
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to open billing portal.');
      setManaging(false);
    }
  };

  const currentPlan  = status?.plan ?? 'trial';
  const planInfo     = PLANS[currentPlan] ?? PLANS.trial;
  const trialEnds    = status?.trial_ends_at ? new Date(status.trial_ends_at) : null;
  const daysLeft     = trialEnds ? Math.max(0, Math.ceil((trialEnds - new Date()) / 86400000)) : null;
  const isActive     = status?.subscription?.status === 'active';
  const isSuspended  = status?.status === 'suspended';
  const visiblePlans = upgradePlans.filter(p => currentPlan === 'trial' || p.key !== currentPlan);

  /* Manage Billing action button for PageWrapper */
  const manageBtn = isActive ? (
    <button
      onClick={handleManage}
      disabled={managing}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 18px',
        background: '#fff',
        border: '1.5px solid #EAECF0',
        borderRadius: 10, cursor: managing ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 700, color: '#344054',
        boxShadow: '0 1px 4px rgba(16,24,40,0.06)',
        transition: 'all 0.15s',
        opacity: managing ? 0.6 : 1,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <IconSettings />
      {managing ? 'Opening…' : 'Manage Billing'}
    </button>
  ) : null;

  return (
    <PageWrapper
      title="Billing & Subscription"
      subtitle="New salons start with a 14-day free trial. Upgrade anytime to unlock more branches, staff & features."
      actions={manageBtn}
    >

      {/* ── Suspended Alert ── */}
      {isSuspended && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'linear-gradient(135deg, #FFF1F2, #FEE2E2)',
            border: '1px solid #FECACA',
            borderRadius: 14, padding: '14px 20px',
            color: '#DC2626',
          }}
        >
          <span style={{ flexShrink: 0, color: '#DC2626' }}><IconAlert /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
              Subscription Suspended
            </div>
            <div style={{ fontSize: 13, color: '#B91C1C', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
              Your account is suspended. Please update your billing to restore full access.
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Branches"     value={planInfo.branches} icon={<IconBuilding />}   color="#2563EB" />
        <StatCard label="Staff"        value={planInfo.staff}    icon={<IconUsers2 />}     color="#7C3AED" />
        <StatCard label="Services"     value={planInfo.services} icon={<IconScissors />}   color="#059669" />
        <StatCard
          label="Subscription"
          value={isSuspended ? 'Suspended' : isActive ? 'Active' : currentPlan === 'trial' ? 'Trial' : 'Inactive'}
          icon={<IconCreditCard />}
          color={isSuspended ? '#EF4444' : isActive ? '#059669' : '#D97706'}
        />
      </div>

      {/* ── Current Plan Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: planInfo.gradient,
          borderRadius: 18, padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(37,99,235,0.22)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Decorative orbs */}
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-30, right:80, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16, position:'relative' }}>
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.07em',
              textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.25)',
              fontFamily: "'Inter', sans-serif",
            }}>
              {planInfo.label}
            </span>
            <h2 style={{
              margin: '12px 0 2px', fontSize: 28, fontWeight: 900, color: '#fff',
              lineHeight: 1.1, fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
            }}>
              Your Current Plan
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif" }}>
              {currentPlan === 'trial'
                ? 'Explore all features during your free trial period.'
                : 'Your subscription is actively powering your salon.'}
            </p>
            {currentPlan === 'trial' && daysLeft !== null && <TrialBar daysLeft={daysLeft} />}
            {currentPlan !== 'trial' && status?.subscription?.current_period_end && (
              <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.80)', fontFamily: "'Inter', sans-serif" }}>
                Next renewal:{' '}
                <strong style={{ color: '#fff' }}>
                  {new Date(status.subscription.current_period_end)
                    .toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
                </strong>
              </div>
            )}
          </div>
          <div style={{
            background: isSuspended ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.15)',
            border: isSuspended ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.3)',
            borderRadius: 99, padding: '6px 16px',
            fontSize: 12, fontWeight: 700, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Inter', sans-serif",
          }}>
            {isSuspended ? 'Suspended' : 'Active'}
          </div>
        </div>
      </motion.div>

      {/* ── Upgrade / Plan Cards ── */}
      {currentPlan !== 'enterprise' && visiblePlans.length > 0 && (
        <>
          <div>
            <h2 style={{
              margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#101828',
              fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.3px',
            }}>
              Choose a plan
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#667085', fontFamily: "'Inter', sans-serif" }}>
              Unlock more capacity and features as your business grows.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {visiblePlans.map(({ key, price, period, tagline, popular, features }, i) => {
              const info = PLANS[key] || { label: key, ...DEFAULT_STYLE };
              const isCurrent = key === currentPlan;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.07 }}
                  whileHover={{ translateY: -3 }}
                  style={{
                    flex: 1, minWidth: 230,
                    background: popular ? 'linear-gradient(160deg, #FAF5FF 0%, #F3E8FF 100%)' : '#fff',
                    border: `1.5px solid ${popular ? info.color : '#EAECF0'}`,
                    borderRadius: 18, padding: '26px 22px',
                    position: 'relative',
                    boxShadow: popular ? '0 8px 32px rgba(124,58,237,0.14)' : '0 2px 8px rgba(16,24,40,0.06)',
                    display: 'flex', flexDirection: 'column',
                    transition: 'box-shadow 0.18s',
                  }}
                >
                  {popular && (
                    <div style={{
                      position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(90deg, #7C3AED, #A855F7)',
                      color: '#fff', fontSize: 11, fontWeight: 800,
                      padding: '4px 16px', borderRadius: 99,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.40)',
                      whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif",
                    }}>
                      Most Popular
                    </div>
                  )}

                  {/* Plan header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: `linear-gradient(135deg, ${info.color}22 0%, ${info.color}12 100%)`,
                      border: `1.5px solid ${info.color}28`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: info.color, flexShrink: 0,
                    }}>
                      {key === 'basic' ? <IconCreditCard /> : key === 'pro' ? <IconSpark /> : <IconShield />}
                    </div>
                    <span style={{ fontSize: 17, fontWeight: 800, color: info.color, fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                      {info.label}
                    </span>
                  </div>

                  <p style={{ fontSize: 12.5, color: '#667085', margin: '0 0 14px', lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
                    {tagline}
                  </p>

                  <div style={{ marginBottom: 18 }}>
                    <span style={{ fontSize: 29, fontWeight: 900, color: '#101828', fontFamily: "'Sora', sans-serif" }}>
                      {price}
                    </span>
                    <span style={{ fontSize: 13.5, color: '#98A2B3', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
                      {period}
                    </span>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', flexGrow: 1 }}>
                    {features.map((f) => (
                      <li key={f} style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '5px 0', fontSize: 13.5, color: '#344054',
                        borderBottom: '1px solid #F2F4F7',
                        fontFamily: "'Inter', sans-serif",
                      }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 99,
                          background: `${info.color}18`, border: `1px solid ${info.color}28`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: info.color, flexShrink: 0,
                        }}>
                          <IconCheck2 />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div style={{
                      textAlign: 'center', padding: '11px 0',
                      borderRadius: 10, background: '#F2F4F7',
                      fontSize: 13, fontWeight: 700, color: '#667085',
                      fontFamily: "'Inter', sans-serif",
                    }}>
                      Current plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(key)}
                      style={{
                        width: '100%', padding: '12px 0',
                        background: popular
                          ? 'linear-gradient(90deg, #7C3AED, #A855F7)'
                          : `linear-gradient(135deg, ${info.color}, ${info.color}CC)`,
                        color: '#fff', border: 'none',
                        borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                        cursor: 'pointer',
                        opacity: 1,
                        boxShadow: popular ? '0 4px 14px rgba(124,58,237,0.35)' : `0 2px 10px ${info.color}40`,
                        transition: 'all 0.15s', letterSpacing: '0.02em',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {`Get ${info.label}`} <IconArrowRight />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Enterprise ── */}
      {currentPlan === 'enterprise' && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
            border: '1.5px solid #A7F3D0', borderRadius: 16, padding: '22px 26px',
            display: 'flex', alignItems: 'center', gap: 16,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #064E3B, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <IconShield />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#065F46', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
              You're on Enterprise
            </div>
            <div style={{ fontSize: 13, color: '#047857', marginTop: 3, fontFamily: "'Inter', sans-serif" }}>
              You have full access to all features. Contact support for custom add-ons or SLA adjustments.
            </div>
          </div>
          {isActive && (
            <button
              onClick={handleManage}
              disabled={managing}
              style={{
                flexShrink: 0, padding: '10px 20px',
                background: '#059669', color: '#fff', border: 'none',
                borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                whiteSpace: 'nowrap', opacity: managing ? 0.6 : 1,
                boxShadow: '0 2px 8px rgba(5,150,105,0.30)',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {managing ? 'Opening…' : 'Manage Billing'}
            </button>
          )}
        </motion.div>
      )}

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Pay via bank transfer and upload your slip for admin approval. Your subscription will be activated once approved.
      </p>
    </PageWrapper>
  );
};

export default BillingPage;
