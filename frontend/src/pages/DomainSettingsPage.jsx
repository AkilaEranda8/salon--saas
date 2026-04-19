import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Design Tokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const T = {
  bg:       '#F7F8FA',
  card:     '#FFFFFF',
  border:   '#E5E7EB',
  borderL:  '#F3F4F6',
  text:     '#111827',
  sub:      '#6B7280',
  muted:    '#9CA3AF',
  accent:   '#7C3AED',
  accentL:  '#EDE9FE',
  accentD:  '#5B21B6',
  green:    '#059669',
  greenBg:  '#D1FAE5',
  greenBdr: '#6EE7B7',
  orange:   '#D97706',
  orangeBg: '#FEF3C7',
  orangeBdr:'#FCD34D',
  red:      '#DC2626',
  redBg:    '#FEE2E2',
  blue:     '#2563EB',
  blueBg:   '#EFF6FF',
  blueBdr:  '#BFDBFE',
  navy:     '#1E1B4B',
};

/* ━━━━━━━━━━━━━━━━━ Inject keyframe animations (once) ━━━━━━━━━━━━━━━━━━━━━━ */
const STYLE_ID = '__domain-settings-kf';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes ds-fadeUp   { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
    @keyframes ds-pulse    { 0%,100% { opacity:1 } 50% { opacity:.55 } }
    @keyframes ds-spin     { to { transform:rotate(360deg) } }
    @keyframes ds-glow     { 0%,100% { box-shadow:0 0 0 0 rgba(124,58,237,.25) } 50% { box-shadow:0 0 0 8px rgba(124,58,237,0) } }
    @keyframes ds-checkPop { 0% { transform:scale(0) } 60% { transform:scale(1.2) } 100% { transform:scale(1) } }
    @keyframes ds-shimmer  { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
  `;
  document.head.appendChild(style);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Helper Components ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function GlassCard({ children, style = {}, delay = 0 }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.03)',
      animation: `ds-fadeUp .45s ease ${delay}ms both`,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title, subtitle, badge }) {
  return (
    <div style={{
      padding: '18px 22px',
      borderBottom: `1px solid ${T.borderL}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      {icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `linear-gradient(135deg, ${T.accentL}, #F5F3FF)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {badge}
    </div>
  );
}

function CardBody({ children, style = {} }) {
  return <div style={{ padding: '18px 22px 22px', ...style }}>{children}</div>;
}

function Badge({ verified }) {
  const bg  = verified ? T.greenBg  : T.orangeBg;
  const clr = verified ? T.green    : T.orange;
  const bdr = verified ? T.greenBdr : T.orangeBdr;
  const label = verified ? 'Verified' : 'Pending DNS';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
      background: bg, color: clr, border: `1px solid ${bdr}`,
      letterSpacing: '.2px', textTransform: 'uppercase',
      animation: verified ? 'ds-checkPop .4s ease' : undefined,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: clr,
        animation: verified ? undefined : 'ds-pulse 2s ease infinite',
      }} />
      {label}
    </span>
  );
}

function CopyBtn({ value, label }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={doCopy}
      title={`Copy ${label || 'value'}`}
      style={{
        border: 'none', background: copied ? T.greenBg : T.accentL,
        color: copied ? T.green : T.accent,
        fontSize: 11.5, fontWeight: 700, padding: '4px 10px',
        borderRadius: 6, cursor: 'pointer',
        transition: 'all .2s ease',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      {copied ? (
        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg> Copied</>
      ) : (
        <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</>
      )}
    </button>
  );
}

function Btn({ children, onClick, disabled, variant = 'primary', style = {} }) {
  const base = {
    border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '10px 20px', display: 'inline-flex', alignItems: 'center', gap: 7,
    transition: 'all .2s ease', opacity: disabled ? .6 : 1,
    fontFamily: "'Inter', sans-serif",
  };
  const variants = {
    primary:  { background: T.navy, color: '#fff' },
    accent:   { background: `linear-gradient(135deg, ${T.accent}, ${T.accentD})`, color: '#fff', boxShadow: '0 2px 8px rgba(124,58,237,.25)' },
    danger:   { background: T.redBg, color: T.red },
    ghost:    { background: 'transparent', color: T.accent, border: `1.5px solid ${T.accent}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'ds-spin .7s linear infinite' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round"/>
    </svg>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━ Step Indicator (DNS flow) ━━━━━━━━━━━━━━━━━━━━━━━ */

function StepFlow({ steps, currentStep }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '0 0 20px' }}>
      {steps.map((s, i) => {
        const done    = i < currentStep;
        const active  = i === currentStep;
        const dotClr  = done ? T.green : active ? T.accent : T.muted;
        const lineClr = done ? T.green : T.borderL;
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 72 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? T.greenBg : active ? T.accentL : '#F9FAFB',
                border: `2px solid ${dotClr}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: dotClr,
                transition: 'all .3s ease',
                animation: active ? 'ds-glow 2s ease infinite' : undefined,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? T.text : T.muted, textAlign: 'center', lineHeight: 1.2 }}>
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: lineClr, borderRadius: 1, marginBottom: 20, minWidth: 20, transition: 'background .3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ DNS Table Row ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function DnsRecordRow({ type, name, value, ttl = 'Auto' }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '72px 1fr 1fr 60px', gap: 0,
      borderBottom: `1px solid ${T.borderL}`, alignItems: 'stretch',
    }}>
      {/* Type */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center' }}>
        <span style={{
          background: `linear-gradient(135deg, ${T.accent}, ${T.accentD})`,
          color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '3px 8px',
          borderRadius: 5, letterSpacing: '.5px',
        }}>
          {type}
        </span>
      </div>
      {/* Name */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${T.borderL}` }}>
        <code style={{ fontSize: 12.5, fontWeight: 600, color: T.text, wordBreak: 'break-all' }}>{name}</code>
        <CopyBtn value={name} label="Name" />
      </div>
      {/* Value */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${T.borderL}` }}>
        <code style={{ fontSize: 12.5, fontWeight: 600, color: T.text, wordBreak: 'break-all' }}>{value}</code>
        <CopyBtn value={value} label="Value" />
      </div>
      {/* TTL */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', fontSize: 12, color: T.muted, fontWeight: 600, borderLeft: `1px solid ${T.borderL}` }}>
        {ttl}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Main Component ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DomainSettingsPage = () => {
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [data, setData] = useState({
    slug: '',
    subdomain_url: '',
    custom_domain: '',
    domain_verified: false,
  });
  const [inputDomain, setInputDomain] = useState('');

  /* ── Fetch ── */
  useEffect(() => {
    api.get('/branding/domain')
      .then((res) => {
        setData(res.data);
        setInputDomain(res.data.custom_domain || '');
      })
      .catch(() => toast.error('Failed to load domain settings.'))
      .finally(() => setLoading(false));
  }, []);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    const cleaned = inputDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleaned) {
      toast.error('Please enter a valid domain.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch('/branding/domain', { custom_domain: cleaned });
      setData((d) => ({ ...d, custom_domain: res.data.custom_domain, domain_verified: false }));
      setInputDomain(res.data.custom_domain || '');
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [inputDomain]);

  /* ── Verify ── */
  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      const res = await api.post('/branding/domain/verify');
      setData((d) => ({ ...d, domain_verified: res.data.domain_verified }));
      if (res.data.domain_verified) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  }, []);

  /* ── Remove ── */
  const handleRemove = useCallback(async () => {
    if (!window.confirm('Remove custom domain? Your salon will only be accessible via the salon.hexalyte.com subdomain.')) return;
    setSaving(true);
    try {
      await api.patch('/branding/domain', { custom_domain: '' });
      setData((d) => ({ ...d, custom_domain: null, domain_verified: false }));
      setInputDomain('');
      toast.success('Custom domain removed.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed.');
    } finally {
      setSaving(false);
    }
  }, []);

  /* ── Computed ── */
  const hasDomain  = !!data.custom_domain;
  const isVerified = data.domain_verified;
  const cnameHost  = hasDomain
    ? (() => {
        const d = data.custom_domain;
        if (d.startsWith('www.')) return 'www';
        const parts = d.split('.');
        // Root domain (e.g. akilaeranda.com) → use @ in DNS
        if (parts.length <= 2) return '@';
        // Subdomain (e.g. booking.mysalon.com) → use the subdomain prefix
        return parts[0];
      })()
    : '';
  const currentStep = !hasDomain ? 0 : isVerified ? 2 : 1;

  /* ── Loading ── */
  if (loading) {
    return (
      <PageWrapper title="Domain Settings">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, padding: 80, color: T.muted,
        }}>
          <Spinner size={28} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Loading domain settings…</span>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Domain Settings" subtitle="Manage your salon's custom domain for a branded experience">

      {/* ━━━ Step Flow Progress ━━━ */}
      <GlassCard delay={50}>
        <CardBody>
          <StepFlow
            steps={['Enter Domain', 'Configure DNS', 'Verify & Go Live']}
            currentStep={currentStep}
          />
        </CardBody>
      </GlassCard>

      {/* ━━━ Subdomain Card ━━━ */}
      <GlassCard delay={120}>
        <CardHeader
          icon="🌐"
          title="Your Default Subdomain"
          subtitle="Always active — included with your account"
          badge={<Badge verified />}
        />
        <CardBody>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
            borderRadius: 10, border: `1px solid #DDD6FE`,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            <code style={{ fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: '.2px' }}>
              {data.subdomain_url}
            </code>
            <CopyBtn value={data.subdomain_url} label="Subdomain" />
            <a
              href={data.subdomain_url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12, color: T.green, fontWeight: 700,
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', background: T.greenBg, borderRadius: 6,
                border: `1px solid ${T.greenBdr}`,
              }}
            >
              Open
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </CardBody>
      </GlassCard>

      {/* ━━━ Custom Domain Card ━━━ */}
      <GlassCard delay={200}>
        <CardHeader
          icon="🔗"
          title="Custom Domain"
          subtitle="Point your own domain (e.g. booking.mysalon.com) to your salon"
          badge={hasDomain ? <Badge verified={isVerified} /> : null}
        />
        <CardBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Domain Input */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.sub, marginBottom: 7, letterSpacing: '.3px', textTransform: 'uppercase' }}>
                Domain Name
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center',
                  border: `1.5px solid ${T.border}`, borderRadius: 10,
                  overflow: 'hidden', transition: 'border-color .2s',
                  background: '#FAFAFA',
                }}>
                  <span style={{
                    padding: '0 12px', fontSize: 13, color: T.muted, fontWeight: 600,
                    borderRight: `1px solid ${T.borderL}`, height: '100%',
                    display: 'flex', alignItems: 'center', background: '#F3F4F6',
                  }}>
                    https://
                  </span>
                  <input
                    value={inputDomain}
                    onChange={(e) => setInputDomain(e.target.value.trim().toLowerCase())}
                    placeholder="booking.mysalon.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    style={{
                      flex: 1, padding: '11px 14px', border: 'none', outline: 'none',
                      fontSize: 13.5, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      fontWeight: 500, color: T.text, background: 'transparent',
                      letterSpacing: '.3px',
                    }}
                  />
                </div>
                <Btn onClick={handleSave} disabled={saving} variant="primary">
                  {saving ? <><Spinner size={14} /> Saving…</> : <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save
                  </>}
                </Btn>
                {hasDomain && (
                  <Btn onClick={handleRemove} disabled={saving} variant="danger">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                    Remove
                  </Btn>
                )}
              </div>

              {inputDomain && !inputDomain.includes('hexalyte.com') && (
                <div style={{
                  marginTop: 8, fontSize: 12, color: T.sub,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                  </svg>
                  Your salon will be accessible at{' '}
                  <code style={{ color: T.accent, fontWeight: 700, fontSize: 12 }}>https://{inputDomain}</code>
                </div>
              )}
            </div>

            {/* Current Domain Status */}
            {hasDomain && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '14px 18px',
                background: isVerified
                  ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)'
                  : 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                borderRadius: 12,
                border: `1px solid ${isVerified ? T.greenBdr : T.orangeBdr}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: isVerified ? T.greenBg : T.orangeBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {isVerified ? '✅' : '⏳'}
                </div>
                <div style={{ flex: 1 }}>
                  <code style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{data.custom_domain}</code>
                  <div style={{ fontSize: 12, color: isVerified ? T.green : T.orange, fontWeight: 600, marginTop: 2 }}>
                    {isVerified ? 'Domain is live and serving traffic' : 'DNS configuration required — follow the steps below'}
                  </div>
                </div>
                {!isVerified && (
                  <Btn onClick={handleVerify} disabled={verifying} variant="accent">
                    {verifying ? <><Spinner size={14} /> Checking DNS…</> : <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                      </svg>
                      Verify DNS
                    </>}
                  </Btn>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </GlassCard>

      {/* ━━━ DNS Setup Instructions (when domain set but not verified) ━━━ */}
      {hasDomain && !isVerified && (
        <GlassCard delay={300}>
          <CardHeader
            icon="📋"
            title="DNS Configuration"
            subtitle="Add these records at your domain registrar (Cloudflare, GoDaddy, Namecheap, etc.)"
          />
          <CardBody style={{ padding: 0 }}>

            {/* Warning banner */}
            <div style={{
              margin: '18px 22px 16px',
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
              border: `1px solid ${T.orangeBdr}`,
              borderRadius: 10,
              display: 'flex', alignItems: 'flex-start', gap: 10,
              fontSize: 13, color: '#92400E', lineHeight: 1.5,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: -1 }}>⚠️</span>
              <div>
                <strong>DNS propagation can take up to 24 hours.</strong>
                <br />
                After adding the DNS record, wait a few minutes and click <strong>Verify DNS</strong> to check.
              </div>
            </div>

            {/* DNS Records Table */}
            <div style={{ margin: '0 22px 12px', borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              {/* Table Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '72px 1fr 1fr 60px',
                background: '#F9FAFB', borderBottom: `1px solid ${T.border}`,
              }}>
                {['Type', 'Name / Host', 'Value / Points To', 'TTL'].map((h) => (
                  <div key={h} style={{
                    padding: '10px 14px', fontSize: 11, fontWeight: 800,
                    color: T.sub, textTransform: 'uppercase', letterSpacing: '.5px',
                    borderLeft: h !== 'Type' ? `1px solid ${T.borderL}` : undefined,
                  }}>
                    {h}
                  </div>
                ))}
              </div>
              {/* CNAME Row */}
              <DnsRecordRow
                type="CNAME"
                name={cnameHost}
                value="salon.hexalyte.com"
              />
            </div>

            {/* Instructions */}
            <div style={{ margin: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Step-by-step */}
              <div style={{
                padding: '16px 18px', background: T.blueBg, border: `1px solid ${T.blueBdr}`,
                borderRadius: 10, fontSize: 13, color: '#1E40AF', lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                  🔧 Quick Setup Guide
                </div>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Log in to your domain registrar (Cloudflare, GoDaddy, Namecheap, etc.)</li>
                  <li>Go to <strong>DNS Settings</strong> or <strong>DNS Management</strong></li>
                  <li>Add a new <strong>CNAME</strong> record with the values above</li>
                  <li>Save and wait a few minutes for propagation</li>
                  <li>Come back and click <strong>Verify DNS</strong></li>
                </ol>
              </div>

              {/* Note for root domains */}
              <div style={{
                padding: '12px 16px', background: '#F9FAFB',
                border: `1px solid ${T.borderL}`, borderRadius: 10,
                fontSize: 12, color: T.sub, lineHeight: 1.6,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
                <div>
                  <strong>Using a root domain?</strong> (e.g. <code style={{ fontSize: 11, color: T.accent }}>mysalon.com</code>)
                  <br />
                  Some registrars don't support CNAME on root domains. In that case, use an <strong>A record</strong>{' '}
                  pointing to your server IP, or use a subdomain like{' '}
                  <code style={{ fontSize: 11, color: T.accent }}>booking.mysalon.com</code> instead.
                </div>
              </div>
            </div>
          </CardBody>
        </GlassCard>
      )}

      {/* ━━━ Domain Active / Success Card ━━━ */}
      {hasDomain && isVerified && (
        <GlassCard delay={300}>
          <CardBody>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '20px 24px',
              background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 50%, #A7F3D0 100%)',
              borderRadius: 14,
              border: `1px solid ${T.greenBdr}`,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: '#fff', border: `2px solid ${T.greenBdr}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, animation: 'ds-checkPop .5s ease',
                boxShadow: '0 2px 8px rgba(5,150,105,.15)',
              }}>
                ✅
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.green, lineHeight: 1.3 }}>
                  Custom Domain is Live!
                </div>
                <div style={{ fontSize: 13, color: '#065F46', marginTop: 4 }}>
                  Your salon dashboard is now accessible at
                </div>
                <a
                  href={`https://${data.custom_domain}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    marginTop: 8, padding: '7px 14px',
                    background: '#fff', borderRadius: 8, border: `1px solid ${T.greenBdr}`,
                    fontSize: 13, fontWeight: 700, color: T.accent,
                    textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {data.custom_domain}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
              <CopyBtn value={`https://${data.custom_domain}`} label="Domain URL" />
            </div>
          </CardBody>
        </GlassCard>
      )}

    </PageWrapper>
  );
};

export default DomainSettingsPage;
