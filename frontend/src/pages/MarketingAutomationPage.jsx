import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard } from '../components/ui/PageKit';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

const TABS = [
  { k: 'birthday', label: 'Birthday Campaign' },
  { k: 'inactive', label: 'Win-Back Campaign' },
  { k: 'rebook',   label: 'Rebook Suggestions' },
];

const PRIORITY_META = {
  high:   { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
  medium: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  normal: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  low:    { bg: '#F9FAFB', text: '#667085', border: '#EAECF0' },
};

/* ── Campaign progress bar (hero) ─────────────────────────────────────── */
const CampaignBar = ({ sent, total }) => {
  const p = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
          Campaign reach
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
          {sent} of {total} customers
        </span>
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

export default function MarketingAutomationPage() {
  const { addToast } = useToast();

  const [tab, setTab] = useState('birthday');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [birthdayMsg, setBirthdayMsg] = useState('Happy Birthday {{name}}! Enjoy {{offer}} at our salon this week.');
  const [winbackMsg, setWinbackMsg] = useState('Hi {{name}}, we miss you! Come back this week and enjoy {{offer}}.');
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
      await api.post('/marketing/send-birthday', { customer_id: customerId, message: birthdayMsg, offer: '10% OFF' });
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
    let ok = 0;
    for (const c of birthdayCustomers) {
      try {
        await api.post('/marketing/send-birthday', { customer_id: c.id, message: birthdayMsg, offer: '10% OFF' });
        ok += 1;
      } catch {
        // Continue sending to others.
      }
    }
    setSending(false);
    addToast(`Birthday campaign sent to ${ok}/${birthdayCustomers.length}`, ok ? 'success' : 'error');
  };

  const sendWinback = async (customerId) => {
    setSending(true);
    try {
      await api.post('/marketing/send-winback', { customer_id: customerId, message: winbackMsg, offer: '15% OFF next visit' });
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
    let ok = 0;
    for (const c of inactiveCustomers) {
      try {
        await api.post('/marketing/send-winback', { customer_id: c.id, message: winbackMsg, offer: '15% OFF next visit' });
        ok += 1;
      } catch {
        // Continue sending to others.
      }
    }
    setSending(false);
    addToast(`Win-back campaign sent to ${ok}/${inactiveCustomers.length}`, ok ? 'success' : 'error');
  };

  /* ── Computed stats ── */
  const totalAudience  = birthdayCustomers.length + inactiveCustomers.length + rebookSuggestions.length;
  const highPriority   = rebookSuggestions.filter(r => r.rebook_priority === 'high').length;

  const inp = {
    padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13.5,
    width: '100%', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
    outline: 'none', transition: 'border-color 0.15s',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 6, display: 'block', fontFamily: "'Inter', sans-serif" };

  return (
    <PageWrapper
      title="Marketing Automation"
      subtitle="Run birthday wishes, win-back offers, and rebook nudges"
      actions={
        <button onClick={reloadActiveTab} style={{
          padding: '9px 18px', borderRadius: 10, border: '1.5px solid #EAECF0',
          background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
          color: '#344054', fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
        }}>
          Refresh
        </button>
      }
    >
      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Birthdays Today" value={birthdayCustomers.length} color="#EC4899" />
        <StatCard label="Inactive"        value={inactiveCustomers.length} color="#F59E0B" />
        <StatCard label="Rebook Queue"    value={rebookSuggestions.length} color="#6366F1" />
        <StatCard label="Total Audience"  value={totalAudience}            color="#2563EB" />
      </div>

      {/* ── Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 50%, #8B5CF6 100%)',
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
              Marketing Hub
            </span>
            <h2 style={{
              margin: '12px 0 2px', fontSize: 28, fontWeight: 900, color: '#fff',
              lineHeight: 1.1, fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
            }}>
              {totalAudience} {totalAudience === 1 ? 'Customer' : 'Customers'} in Pipeline
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif" }}>
              {birthdayCustomers.length > 0
                ? `${birthdayCustomers.length} birthday${birthdayCustomers.length > 1 ? 's' : ''} today — send them some love!`
                : 'No birthdays today. Focus on win-back and rebook campaigns.'}
            </p>
            <CampaignBar sent={birthdayCustomers.length + inactiveCustomers.length} total={Math.max(totalAudience, 1)} />
          </div>
          <div style={{
            background: totalAudience > 20 ? 'rgba(239,68,68,0.2)' : totalAudience > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.15)',
            border: totalAudience > 20 ? '1px solid rgba(239,68,68,0.5)' : totalAudience > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.3)',
            borderRadius: 99, padding: '6px 16px',
            fontSize: 12, fontWeight: 700, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Inter', sans-serif",
          }}>
            {totalAudience > 20 ? 'High Volume' : totalAudience > 0 ? 'Active' : 'Quiet'}
          </div>
        </div>
      </motion.div>

      {/* ── Campaign Tabs ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(({ k, label }) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '7px 18px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            background: tab === k ? 'linear-gradient(135deg, #7C3AED, #8B5CF6)' : '#F9FAFB',
            color: tab === k ? '#fff' : '#667085',
            border: tab === k ? 'none' : '1.5px solid #EAECF0',
            boxShadow: tab === k ? '0 2px 8px rgba(124,58,237,0.25)' : 'none',
            transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
          }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#98A2B3', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Loading campaign audience…</div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ═══════ BIRTHDAY ═══════ */}
          {tab === 'birthday' && (
            <motion.div key="birthday" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Template card */}
              <div style={{
                background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24,
                boxShadow: '0 2px 8px rgba(16,24,40,0.06)',
              }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                  Birthday Template
                </h3>
                <textarea
                  style={{ ...inp, minHeight: 80, resize: 'vertical' }}
                  value={birthdayMsg}
                  onChange={(e) => setBirthdayMsg(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: '#667085', fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    {birthdayCustomers.length} birthday customer{birthdayCustomers.length !== 1 ? 's' : ''} today
                  </span>
                  <Button onClick={sendBirthdayBulk} disabled={sending || birthdayCustomers.length === 0}>
                    {sending ? 'Sending…' : 'Send to All'}
                  </Button>
                </div>
              </div>

              {/* Customer cards */}
              {birthdayCustomers.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 60, color: '#98A2B3',
                  border: '2px dashed #E5E7EB', borderRadius: 14,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#667085' }}>No birthdays today</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Birthday customers will appear here automatically.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                  {birthdayCustomers.map((c, idx) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      whileHover={{ translateY: -3 }}
                      style={{
                        background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 14, padding: 18,
                        boxShadow: '0 2px 8px rgba(16,24,40,0.06)', transition: 'box-shadow 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#101828', marginBottom: 3, fontFamily: "'Inter', sans-serif" }}>{c.name}</div>
                      <div style={{ fontSize: 12.5, color: '#667085', fontFamily: "'Inter', sans-serif" }}>{c.phone}</div>
                      <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 4, marginBottom: 14, fontFamily: "'Inter', sans-serif" }}>
                        DOB: {c.dob || '—'}
                      </div>
                      <button onClick={() => sendBirthday(c.id)} disabled={sending} style={{
                        width: '100%', padding: '8px 12px', borderRadius: 10,
                        border: '1.5px solid #F9A8D4', background: 'linear-gradient(135deg, #FDF2F8, #FCE7F3)',
                        color: '#9D174D', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                        fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                      }}>
                        Send Birthday Wish
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════ WIN-BACK ═══════ */}
          {tab === 'inactive' && (
            <motion.div key="inactive" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Settings card */}
              <div style={{
                background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24,
                boxShadow: '0 2px 8px rgba(16,24,40,0.06)',
              }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                  Win-Back Settings
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, alignItems: 'start' }}>
                  <div>
                    <label style={lbl}>Inactive Days</label>
                    <input type="number" min="7" style={inp} value={inactiveDays} onChange={(e) => setInactiveDays(Number(e.target.value || 45))} />
                  </div>
                  <div>
                    <label style={lbl}>Win-back Template</label>
                    <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={winbackMsg} onChange={(e) => setWinbackMsg(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
                  <button onClick={reloadActiveTab} style={{
                    padding: '9px 18px', borderRadius: 10, border: '1.5px solid #EAECF0',
                    background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    color: '#344054', fontFamily: "'Inter', sans-serif",
                  }}>Find Audience</button>
                  <Button onClick={sendWinbackBulk} disabled={sending || inactiveCustomers.length === 0}>
                    {sending ? 'Sending…' : `Send to All (${inactiveCustomers.length})`}
                  </Button>
                </div>
              </div>

              {/* Table */}
              {inactiveCustomers.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 60, color: '#98A2B3',
                  border: '2px dashed #E5E7EB', borderRadius: 14,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#667085' }}>No inactive customers found</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Adjust the inactive days threshold and try again.</div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{
                    background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16,
                    boxShadow: '0 2px 8px rgba(16,24,40,0.06)', overflow: 'hidden',
                  }}
                >
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
                      <thead>
                        <tr style={{ borderBottom: '1.5px solid #EAECF0', background: '#F9FAFB' }}>
                          {['Customer', 'Phone', 'Last Visit', 'Days Inactive', 'Visits', 'Action'].map((h) => (
                            <th key={h} style={{
                              padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800,
                              color: '#667085', textTransform: 'uppercase', letterSpacing: '0.04em',
                              fontFamily: "'Inter', sans-serif",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inactiveCustomers.map((c, idx) => (
                          <motion.tr
                            key={c.id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            style={{ borderBottom: '1px solid #F2F4F7' }}
                            onMouseEnter={(ev) => { ev.currentTarget.style.background = '#F9FAFB'; }}
                            onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                          >
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#101828' }}>{c.name}</td>
                            <td style={{ padding: '12px 14px', color: '#667085' }}>{c.phone}</td>
                            <td style={{ padding: '12px 14px', color: '#667085' }}>{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : 'Never'}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                fontWeight: 700, fontSize: 12,
                                color: c.days_inactive > 90 ? '#991B1B' : c.days_inactive > 60 ? '#92400E' : '#D97706',
                                background: c.days_inactive > 90 ? '#FEF2F2' : c.days_inactive > 60 ? '#FFFBEB' : '#FFFBEB',
                                border: `1px solid ${c.days_inactive > 90 ? '#FECACA' : '#FDE68A'}`,
                                borderRadius: 99, padding: '2px 10px',
                              }}>
                                {c.days_inactive}d
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{c.visit_count || 0}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <button onClick={() => sendWinback(c.id)} disabled={sending} style={{
                                padding: '6px 14px', borderRadius: 8, border: '1.5px solid #BFDBFE',
                                background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer',
                                fontSize: 11.5, fontWeight: 700, fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                              }}>Win-back</button>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ═══════ REBOOK ═══════ */}
          {tab === 'rebook' && (
            <motion.div key="rebook" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {rebookSuggestions.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 60, color: '#98A2B3',
                  border: '2px dashed #E5E7EB', borderRadius: 14,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#667085' }}>No rebooking opportunities</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Rebook suggestions will appear based on customer visit patterns.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                  {rebookSuggestions.map((item, idx) => {
                    const pm = PRIORITY_META[item.rebook_priority] || PRIORITY_META.normal;
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        whileHover={{ translateY: -3 }}
                        style={{
                          background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 14, padding: 20,
                          boxShadow: '0 2px 8px rgba(16,24,40,0.06)', transition: 'box-shadow 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#101828', fontFamily: "'Inter', sans-serif" }}>{item.customer_name}</div>
                            <div style={{ fontSize: 12.5, color: '#667085', fontFamily: "'Inter', sans-serif" }}>{item.phone}</div>
                          </div>
                          <span style={{
                            fontSize: 10.5, fontWeight: 800, borderRadius: 99, padding: '3px 10px',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            background: pm.bg, color: pm.text, border: `1px solid ${pm.border}`,
                            fontFamily: "'Inter', sans-serif",
                          }}>
                            {item.rebook_priority || 'normal'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                          {[
                            { label: 'Last service', value: item.last_service_name || 'N/A' },
                            { label: 'Last visit', value: item.last_visit ? new Date(item.last_visit).toLocaleDateString() : 'N/A' },
                            { label: 'Recommended in', value: `${item.recommended_days || 30} days` },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontFamily: "'Inter', sans-serif" }}>
                              <span style={{ color: '#667085' }}>{label}</span>
                              <span style={{ fontWeight: 700, color: '#344054' }}>{value}</span>
                            </div>
                          ))}
                        </div>

                        <button
                          disabled
                          title="Integrate this with your reminders/SMS flow"
                          style={{
                            width: '100%', padding: '8px 12px', borderRadius: 10,
                            border: '1.5px solid #EAECF0', background: '#F9FAFB',
                            color: '#98A2B3', cursor: 'not-allowed', fontSize: 12, fontWeight: 700,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          Auto Nudge (Scheduled)
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Campaigns run automatically via cron. Manual sends apply immediately.
      </p>
    </PageWrapper>
  );
}
