import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import { useTheme } from '../context/ThemeContext';

/* ── SVG icon helper ─────────────────────────────────────────────────── */
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  birthday:   'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M16 3H8l-2 4h12l-2-4z M12 3v4',
  gift:       'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z',
  winback:    'M19 12H5 M12 5l-7 7 7 7',
  rebook:     'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  send:       'M22 2L11 13 M22 2L15 22 8.5 13.5 2 9z',
  users:      'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  check:      'M20 6L9 17l-5-5',
  refresh:    'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  trending:   'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  star:       'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  clock:      'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6v6l4 2',
  zap:        'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  plus:       'M12 5v14M5 12h14',
  close:      'M18 6L6 18M6 6l12 12',
  mail:       'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
};

const TABS = [
  { k: 'birthday', label: 'Birthday', icon: ICONS.gift },
  { k: 'inactive', label: 'Win-Back', icon: ICONS.winback },
  { k: 'rebook',   label: 'Rebook',   icon: ICONS.rebook },
];

const PRIORITY_CONFIG = {
  high:   { bg: '#FEF2F2', darkBg: 'rgba(239,68,68,0.12)',   text: '#991B1B', darkText: '#FCA5A5', border: '#FECACA', darkBorder: 'rgba(239,68,68,0.3)' },
  medium: { bg: '#FFFBEB', darkBg: 'rgba(245,158,11,0.12)',  text: '#92400E', darkText: '#FCD34D', border: '#FDE68A', darkBorder: 'rgba(245,158,11,0.3)' },
  normal: { bg: '#EFF6FF', darkBg: 'rgba(99,102,241,0.12)',  text: '#1E40AF', darkText: '#93C5FD', border: '#BFDBFE', darkBorder: 'rgba(99,102,241,0.3)' },
  low:    { bg: '#F8FAFC', darkBg: 'rgba(100,116,139,0.12)', text: '#475569', darkText: '#94A3B8', border: '#E2E8F0', darkBorder: 'rgba(100,116,139,0.3)' },
};

/* ── Campaign progress bar ──────────────────────────────────────────── */
const CampaignBar = ({ sent, total }) => {
  const p = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>Campaign reach</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{sent} of {total}</span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${p}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ height: '100%', background: 'rgba(255,255,255,0.85)', borderRadius: 99 }}
        />
      </div>
    </div>
  );
};

/* ── Empty state ─────────────────────────────────────────────────────── */
const Empty = ({ icon, title, body, isDark }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    style={{
      textAlign: 'center', padding: '52px 24px',
      background: isDark ? '#151B2D' : '#FAFBFF',
      border: `2px dashed ${isDark ? '#2D3748' : '#C7D2FE'}`,
      borderRadius: 18,
    }}
  >
    <div style={{
      width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
      background: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1',
    }}>
      <Ico d={icon} size={24} />
    </div>
    <div style={{ fontSize: 15, fontWeight: 800, color: isDark ? '#F1F5F9' : '#101828', fontFamily: "'Sora',sans-serif" }}>{title}</div>
    <div style={{ fontSize: 13, color: isDark ? '#64748B' : '#6B7280', marginTop: 5 }}>{body}</div>
  </motion.div>
);

/* ── Avatar circle ───────────────────────────────────────────────────── */
const Avatar = ({ name, size = 36 }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
    background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.38, fontWeight: 800, color: '#fff',
  }}>
    {(name || '?')[0].toUpperCase()}
  </div>
);

/* helpers */
const daysAgo = (dateStr) => {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
};

export default function MarketingAutomationPage() {
  const { addToast } = useToast();
  const { isDark } = useTheme();

  const [tab, setTab] = useState('birthday');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [birthdayMsg, setBirthdayMsg] = useState('Happy Birthday {name}! 🎂 As a special gift, enjoy 10% off your next visit at our salon. Book now!');
  const [winbackMsg, setWinbackMsg] = useState("Hi {name}, we miss you! It's been a while since your last visit. Book now and enjoy a special returning-customer discount!");
  const [inactiveDays, setInactiveDays] = useState(45);

  const [birthdayCustomers, setBirthdayCustomers] = useState([]);
  const [inactiveCustomers, setInactiveCustomers] = useState([]);
  const [rebookSuggestions, setRebookSuggestions] = useState([]);

  const loadBirthday = useCallback(async () => {
    const r = await api.get('/marketing/birthday-customers');
    setBirthdayCustomers(Array.isArray(r.data) ? r.data : []);
  }, []);

  const loadInactive = useCallback(async () => {
    const r = await api.get(`/marketing/inactive-customers?days=${inactiveDays}`);
    setInactiveCustomers(Array.isArray(r.data) ? r.data : []);
  }, [inactiveDays]);

  const loadRebook = useCallback(async () => {
    const r = await api.get('/marketing/rebook-suggestions');
    setRebookSuggestions(Array.isArray(r.data) ? r.data : []);
  }, []);

  const reloadActiveTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'birthday') await loadBirthday();
      if (tab === 'inactive') await loadInactive();
      if (tab === 'rebook') await loadRebook();
    } catch {
      addToast('Failed to load marketing data', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, loadBirthday, loadInactive, loadRebook, addToast]);

  useEffect(() => { reloadActiveTab(); }, [reloadActiveTab]);

  const sendBirthday = async (customerId) => {
    setSending(true);
    try {
      await api.post('/marketing/send-birthday', { customer_ids: [customerId], message_template: birthdayMsg });
      addToast('Birthday message sent', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to send', 'error');
    }
    setSending(false);
  };

  const sendBirthdayBulk = async () => {
    if (!birthdayCustomers.length) return;
    if (!window.confirm(`Send birthday message to ${birthdayCustomers.length} customer(s)?`)) return;
    setSending(true);
    try {
      const r = await api.post('/marketing/send-birthday', {
        customer_ids: birthdayCustomers.map((c) => c.id),
        message_template: birthdayMsg,
      });
      const { sent = 0, total = birthdayCustomers.length } = r.data || {};
      addToast(`Birthday campaign: ${sent}/${total} sent`, sent ? 'success' : 'error');
    } catch (err) {
      addToast(err.response?.data?.message || 'Bulk send failed', 'error');
    }
    setSending(false);
  };

  const sendWinback = async (customerId) => {
    setSending(true);
    try {
      await api.post('/marketing/send-winback', { customer_ids: [customerId], message_template: winbackMsg });
      addToast('Win-back message sent', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to send', 'error');
    }
    setSending(false);
  };

  const sendWinbackBulk = async () => {
    if (!inactiveCustomers.length) return;
    if (!window.confirm(`Send win-back message to ${inactiveCustomers.length} customer(s)?`)) return;
    setSending(true);
    try {
      const r = await api.post('/marketing/send-winback', {
        customer_ids: inactiveCustomers.map((c) => c.id),
        message_template: winbackMsg,
      });
      const { sent = 0, total = inactiveCustomers.length } = r.data || {};
      addToast(`Win-back campaign: ${sent}/${total} sent`, sent ? 'success' : 'error');
    } catch (err) {
      addToast(err.response?.data?.message || 'Bulk send failed', 'error');
    }
    setSending(false);
  };

  /* ── Computed stats ── */
  const totalAudience = birthdayCustomers.length + inactiveCustomers.length + rebookSuggestions.length;
  const highPriority  = rebookSuggestions.filter((r) => r.rebook_priority === 'high').length;

  /* ── Theme shortcuts ── */
  const surface  = isDark ? '#151B2D' : '#fff';
  const border   = isDark ? '#1E293B' : '#E5E7EB';
  const textMain = isDark ? '#F1F5F9' : '#101828';
  const textSub  = isDark ? '#64748B' : '#6B7280';
  const hoverBg  = isDark ? '#1A1F2E' : '#F9FAFB';

  const inputStyle = {
    padding: '10px 14px', borderRadius: 10, fontSize: 13,
    border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
    background: isDark ? '#1A1F2E' : '#FAFAFA',
    color: textMain, width: '100%', boxSizing: 'border-box',
    fontFamily: "'Inter', sans-serif", outline: 'none',
    transition: 'border-color 0.15s',
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: textSub, marginBottom: 6, display: 'block',
  };

  const stats = [
    { label: 'Birthdays Today',    value: birthdayCustomers.length,  icon: ICONS.gift,    accent: '#EC4899', soft: isDark ? 'rgba(236,72,153,0.12)' : '#FDF2F8' },
    { label: 'Inactive Customers', value: inactiveCustomers.length,  icon: ICONS.winback, accent: '#F59E0B', soft: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB' },
    { label: 'Rebook Queue',       value: rebookSuggestions.length,  icon: ICONS.rebook,  accent: '#6366F1', soft: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF' },
    { label: 'High Priority',      value: highPriority,              icon: ICONS.zap,     accent: '#EF4444', soft: isDark ? 'rgba(239,68,68,0.12)'  : '#FEF2F2' },
  ];

  return (
    <PageWrapper
      title="Marketing Automation"
      subtitle="Run birthday wishes, win-back offers, and rebook nudges"
      actions={
        <button onClick={reloadActiveTab} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 12,
          border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
          background: isDark ? '#1A1F2E' : '#fff',
          cursor: 'pointer', fontWeight: 700, fontSize: 13,
          color: textSub, fontFamily: "'Inter', sans-serif",
          transition: 'all 0.15s',
        }}>
          <Ico d={ICONS.refresh} size={14} /> Refresh
        </button>
      }
    >
      {/* ── Stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            style={{
              background: surface, borderRadius: 16,
              border: `1.5px solid ${border}`,
              padding: '16px 18px',
              boxShadow: isDark ? 'none' : '0 1px 4px rgba(16,24,40,0.05)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, background: s.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.accent, flexShrink: 0 }}>
              <Ico d={s.icon} size={18} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: textMain, fontFamily: "'Sora','Manrope',sans-serif", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: textSub, marginTop: 3, fontWeight: 500 }}>{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Hero gradient card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        style={{
          background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 50%, #8B5CF6 100%)',
          borderRadius: 20, padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(124,58,237,0.28)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, right: 80, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.25)' }}>
              <Ico d={ICONS.zap} size={10} /> Marketing Hub
            </span>
            <h2 style={{ margin: '12px 0 4px', fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.1, fontFamily: "'Sora','Manrope',sans-serif", letterSpacing: '-0.03em' }}>
              {totalAudience} {totalAudience === 1 ? 'Customer' : 'Customers'} in Pipeline
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)' }}>
              {birthdayCustomers.length > 0
                ? `${birthdayCustomers.length} birthday${birthdayCustomers.length > 1 ? 's' : ''} today — send them some love!`
                : 'No birthdays today. Focus on win-back and rebook campaigns.'}
            </p>
            <CampaignBar sent={birthdayCustomers.length + inactiveCustomers.length} total={Math.max(totalAudience, 1)} />
          </div>
          <div style={{
            background: totalAudience > 20 ? 'rgba(239,68,68,0.2)' : totalAudience > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.15)',
            border: totalAudience > 20 ? '1px solid rgba(239,68,68,0.5)' : totalAudience > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.3)',
            borderRadius: 99, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.07em', alignSelf: 'flex-start',
          }}>
            {totalAudience > 20 ? 'High Volume' : totalAudience > 0 ? 'Active' : 'Quiet'}
          </div>
        </div>
      </motion.div>

      {/* ── Pill Tabs ── */}
      <div style={{ display: 'flex', gap: 6, background: isDark ? '#1A1F2E' : '#F3F4F6', borderRadius: 14, padding: 5, width: 'fit-content' }}>
        {TABS.map(({ k, label, icon }) => {
          const active = tab === k;
          const count  = k === 'birthday' ? birthdayCustomers.length : k === 'inactive' ? inactiveCustomers.length : rebookSuggestions.length;
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: active ? (isDark ? '#252F45' : '#fff') : 'transparent',
              color: active ? (isDark ? '#C4B5FD' : '#7C3AED') : textSub,
              fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
              boxShadow: active ? '0 1px 4px rgba(16,24,40,0.08)' : 'none',
              transition: 'all 0.18s', fontFamily: "'Inter',sans-serif",
            }}>
              <Ico d={icon} size={14} />
              {label}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? '#7C3AED' : (isDark ? '#2D3748' : '#E5E7EB'),
                color: active ? '#fff' : textSub,
                borderRadius: 999, fontSize: 10, fontWeight: 800, padding: '1px 7px', minWidth: 20,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 56, color: textSub, fontSize: 14 }}>Loading campaign audience…</div>
      ) : (
        <AnimatePresence mode="wait">

          {/* ═══════ BIRTHDAY ═══════ */}
          {tab === 'birthday' && (
            <motion.div key="birthday" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: surface, border: `1.5px solid ${border}`, borderRadius: 18, padding: 24, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? 'rgba(236,72,153,0.12)' : '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EC4899' }}>
                    <Ico d={ICONS.gift} size={17} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: textMain, fontFamily: "'Sora','Manrope',sans-serif" }}>Birthday Message Template</h3>
                </div>
                <label style={labelStyle}>Message — use {'{name}'} as placeholder</label>
                <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.7 }} value={birthdayMsg} onChange={(e) => setBirthdayMsg(e.target.value)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: textSub, fontWeight: 600 }}>
                    {birthdayCustomers.length} birthday customer{birthdayCustomers.length !== 1 ? 's' : ''} today
                  </span>
                  <button onClick={sendBirthdayBulk} disabled={sending || !birthdayCustomers.length} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 11, border: 'none',
                    cursor: (sending || !birthdayCustomers.length) ? 'not-allowed' : 'pointer',
                    background: (sending || !birthdayCustomers.length) ? '#94A3B8' : 'linear-gradient(135deg,#EC4899,#BE185D)',
                    color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Inter',sans-serif",
                    boxShadow: (sending || !birthdayCustomers.length) ? 'none' : '0 4px 12px rgba(236,72,153,0.35)',
                  }}>
                    <Ico d={ICONS.send} size={13} /> {sending ? 'Sending…' : 'Send to All'}
                  </button>
                </div>
              </div>

              {birthdayCustomers.length === 0
                ? <Empty isDark={isDark} icon={ICONS.gift} title="No birthdays today" body="Birthday customers appear here automatically each day." />
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                    {birthdayCustomers.map((c, idx) => {
                      const days = c.days_until_birthday ?? 0;
                      return (
                        <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} whileHover={{ y: -3 }}
                          style={{ background: surface, border: `1.5px solid ${border}`, borderRadius: 16, padding: 18, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.06)', transition: 'box-shadow 0.15s, transform 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                            <Avatar name={c.name} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                              <div style={{ fontSize: 12, color: textSub }}>{c.phone}</div>
                            </div>
                            {days === 0 && (
                              <span style={{ fontSize: 10, fontWeight: 800, background: isDark ? 'rgba(236,72,153,0.15)' : '#FDF2F8', color: '#BE185D', border: '1px solid #F9A8D4', borderRadius: 99, padding: '2px 8px', flexShrink: 0 }}>Today!</span>
                            )}
                          </div>
                          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: isDark ? '#0F172A' : '#FDF2F8', border: `1px solid ${isDark ? '#3B1A2E' : '#FBCFE8'}` }}>
                            <div style={{ fontSize: 11, color: isDark ? '#F9A8D4' : '#BE185D', fontWeight: 700, marginBottom: 2 }}>🎂 Birthday</div>
                            <div style={{ fontSize: 12.5, color: textSub }}>{c.dob || '—'}{days > 0 ? ` · in ${days} day${days > 1 ? 's' : ''}` : ''}</div>
                          </div>
                          <button onClick={() => sendBirthday(c.id)} disabled={sending} style={{
                            width: '100%', padding: '8px 12px', borderRadius: 10,
                            border: `1.5px solid ${isDark ? '#4B2040' : '#F9A8D4'}`,
                            background: isDark ? 'rgba(236,72,153,0.1)' : 'linear-gradient(135deg,#FDF2F8,#FCE7F3)',
                            color: isDark ? '#F9A8D4' : '#9D174D',
                            cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12,
                            fontFamily: "'Inter',sans-serif", transition: 'all 0.15s',
                          }}>
                            Send Birthday Wish
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )
              }
            </motion.div>
          )}

          {/* ═══════ WIN-BACK ═══════ */}
          {tab === 'inactive' && (
            <motion.div key="inactive" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: surface, border: `1.5px solid ${border}`, borderRadius: 18, padding: 24, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706' }}>
                    <Ico d={ICONS.winback} size={17} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: textMain, fontFamily: "'Sora','Manrope',sans-serif" }}>Win-Back Campaign Settings</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'start' }}>
                  <div>
                    <label style={labelStyle}>Inactive Days Threshold</label>
                    <input type="number" min="7" style={inputStyle} value={inactiveDays} onChange={(e) => setInactiveDays(Number(e.target.value || 45))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Win-Back Message — use {'{name}'}</label>
                    <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.7 }} value={winbackMsg} onChange={(e) => setWinbackMsg(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
                  <button onClick={reloadActiveTab} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 11,
                    border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
                    background: isDark ? '#1A1F2E' : '#fff',
                    cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    color: textSub, fontFamily: "'Inter',sans-serif",
                  }}>
                    <Ico d={ICONS.users} size={14} /> Find Audience
                  </button>
                  <button onClick={sendWinbackBulk} disabled={sending || !inactiveCustomers.length} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 11, border: 'none',
                    cursor: (sending || !inactiveCustomers.length) ? 'not-allowed' : 'pointer',
                    background: (sending || !inactiveCustomers.length) ? '#94A3B8' : 'linear-gradient(135deg,#F59E0B,#D97706)',
                    color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Inter',sans-serif",
                    boxShadow: (sending || !inactiveCustomers.length) ? 'none' : '0 4px 12px rgba(245,158,11,0.35)',
                  }}>
                    <Ico d={ICONS.send} size={13} /> {sending ? 'Sending…' : `Send to All (${inactiveCustomers.length})`}
                  </button>
                </div>
              </div>

              {inactiveCustomers.length === 0
                ? <Empty isDark={isDark} icon={ICONS.winback} title="No inactive customers found" body="Adjust the days threshold and click Find Audience." />
                : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ background: surface, border: `1.5px solid ${border}`, borderRadius: 18, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.05)', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: isDark ? '#1A1F2E' : '#F9FAFB', borderBottom: `2px solid ${border}` }}>
                            {['Customer', 'Phone', 'Last Visit', 'Days Inactive', 'Visits', 'Action'].map((h) => (
                              <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: textSub, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inactiveCustomers.map((c, idx) => {
                            const inactive = daysAgo(c.last_visit) ?? inactiveDays;
                            return (
                              <motion.tr key={c.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                                style={{ borderBottom: `1px solid ${border}` }}
                                onMouseEnter={(ev) => { ev.currentTarget.style.background = hoverBg; }}
                                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Avatar name={c.name} size={30} />
                                    <div style={{ fontWeight: 700, color: textMain, fontSize: 13 }}>{c.name}</div>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px', color: textSub }}>{c.phone}</td>
                                <td style={{ padding: '12px 14px', color: textSub, fontSize: 12 }}>
                                  {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : 'Never'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <span style={{
                                    fontWeight: 700, fontSize: 12, borderRadius: 99, padding: '2px 10px',
                                    color: inactive > 90 ? '#991B1B' : inactive > 60 ? '#92400E' : '#D97706',
                                    background: inactive > 90 ? (isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2') : (isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB'),
                                    border: `1px solid ${inactive > 90 ? (isDark ? 'rgba(239,68,68,0.3)' : '#FECACA') : (isDark ? 'rgba(245,158,11,0.3)' : '#FDE68A')}`,
                                  }}>
                                    {inactive}d
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px', fontWeight: 600, color: textMain }}>{c.visits ?? 0}</td>
                                <td style={{ padding: '12px 14px' }}>
                                  <button onClick={() => sendWinback(c.id)} disabled={sending} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8,
                                    border: `1.5px solid ${isDark ? '#2D3748' : '#FDE68A'}`,
                                    background: isDark ? '#1A1F2E' : '#FFFBEB',
                                    color: isDark ? '#FCD34D' : '#92400E',
                                    cursor: sending ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Inter',sans-serif",
                                  }}>
                                    <Ico d={ICONS.send} size={11} /> Win-back
                                  </button>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )
              }
            </motion.div>
          )}

          {/* ═══════ REBOOK ═══════ */}
          {tab === 'rebook' && (
            <motion.div key="rebook" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {rebookSuggestions.length === 0
                ? <Empty isDark={isDark} icon={ICONS.rebook} title="No rebook opportunities" body="Rebook suggestions appear from completed appointments 3–8 weeks ago." />
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                    {rebookSuggestions.map((item, idx) => {
                      const pKey = item.rebook_priority || 'normal';
                      const pc   = PRIORITY_CONFIG[pKey] || PRIORITY_CONFIG.normal;
                      const cust = item.customer || {};
                      const svc  = item.service  || {};
                      return (
                        <motion.div key={item.id || idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} whileHover={{ y: -3 }}
                          style={{ background: surface, border: `1.5px solid ${border}`, borderRadius: 16, padding: 20, boxShadow: isDark ? 'none' : '0 2px 8px rgba(16,24,40,0.06)', transition: 'box-shadow 0.15s, transform 0.15s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <Avatar name={cust.name || item.customer_name || '?'} size={36} />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: textMain }}>{cust.name || item.customer_name || '—'}</div>
                                <div style={{ fontSize: 12, color: textSub }}>{cust.phone || item.phone || ''}</div>
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10.5, fontWeight: 800, borderRadius: 99, padding: '3px 10px',
                              textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
                              background: isDark ? pc.darkBg : pc.bg,
                              color: isDark ? pc.darkText : pc.text,
                              border: `1px solid ${isDark ? pc.darkBorder : pc.border}`,
                            }}>
                              {pKey}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: isDark ? '#0F172A' : '#F9FAFB', border: `1px solid ${border}` }}>
                            {[
                              { label: 'Last service', value: svc.name || item.last_service_name || '—' },
                              { label: 'Completed',    value: item.date ? new Date(item.date).toLocaleDateString() : '—' },
                              { label: 'Price',        value: svc.price ? `LKR ${Number(svc.price).toLocaleString()}` : '—' },
                            ].map(({ label, value }) => (
                              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                                <span style={{ color: textSub }}>{label}</span>
                                <span style={{ fontWeight: 700, color: textMain }}>{value}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{
                            padding: '8px 12px', borderRadius: 10, textAlign: 'center',
                            background: isDark ? 'rgba(99,102,241,0.08)' : '#EEF2FF',
                            border: `1.5px dashed ${isDark ? 'rgba(99,102,241,0.3)' : '#A5B4FC'}`,
                            fontSize: 12, color: isDark ? '#818CF8' : '#4338CA', fontWeight: 600,
                          }}>
                            Auto nudge via Reminders cron
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )
              }
            </motion.div>
          )}

        </AnimatePresence>
      )}

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: textSub, textAlign: 'center' }}>
        Campaigns run automatically via cron. Manual sends apply immediately to active phone numbers.
      </p>
    </PageWrapper>
  );
}
