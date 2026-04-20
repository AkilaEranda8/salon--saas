import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard } from '../components/ui/PageKit';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/* ── Icons ──────────────────────────────────────────────────────────────── */
const IconPlus     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconSearch   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconBell     = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
const IconCheck    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconXCircle  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
const IconTrash    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>;
const IconUser     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconPhone    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
const IconClock    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconCalendar = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

/* ── Status config ──────────────────────────────────────────────────────── */
const STATUS_META = {
  waiting:   { bg: '#FEF3C7', bgDark: '#78350F22', text: '#92400E', textDark: '#FCD34D', dot: '#F59E0B', border: '#FDE68A', borderDark: '#78350F55', label: 'Waiting' },
  notified:  { bg: '#DBEAFE', bgDark: '#1E3A8A22', text: '#1E40AF', textDark: '#93C5FD', dot: '#3B82F6', border: '#BFDBFE', borderDark: '#1E3A8A55', label: 'Notified' },
  booked:    { bg: '#D1FAE5', bgDark: '#064E3B22', text: '#065F46', textDark: '#6EE7B7', dot: '#10B981', border: '#A7F3D0', borderDark: '#064E3B55', label: 'Booked' },
  cancelled: { bg: '#FEE2E2', bgDark: '#7F1D1D22', text: '#991B1B', textDark: '#FCA5A5', dot: '#EF4444', border: '#FECACA', borderDark: '#7F1D1D55', label: 'Cancelled' },
};

const StatusBadge = ({ status, isDark }) => {
  const s = STATUS_META[status] || STATUS_META.waiting;
  return (
    <span style={{
      background: isDark ? s.bgDark : s.bg,
      color: isDark ? s.textDark : s.text,
      border: `1px solid ${isDark ? s.borderDark : s.border}`,
      borderRadius: 99, padding: '3px 12px', fontSize: 11, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: "'Inter', sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  );
};

/* ── Wait-time bar (hero) ──────────────────────────────────────────────── */
const WaitBar = ({ waiting, total }) => {
  const pct = total > 0 ? Math.min(100, Math.round((waiting / total) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, maxWidth: 400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
          Currently waiting
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: pct > 70 ? '#FCD34D' : '#fff', fontFamily: "'Inter', sans-serif" }}>
          {waiting} of {total} entries
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ height: '100%', background: pct > 70 ? '#FCD34D' : 'rgba(255,255,255,0.85)', borderRadius: 99 }}
        />
      </div>
    </div>
  );
};

/* ── Shimmer loading rows ──────────────────────────────────────────────── */
const ShimmerRows = ({ isDark }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
    {[...Array(5)].map((_, i) => (
      <div key={i} style={{
        padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16,
        borderBottom: `1px solid ${isDark ? '#ffffff0a' : '#F2F4F7'}`,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: isDark ? '#ffffff0a' : '#F2F4F7', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: 140, height: 14, borderRadius: 6, background: isDark ? '#ffffff0a' : '#F2F4F7', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 200, height: 10, borderRadius: 6, background: isDark ? '#ffffff08' : '#F9FAFB', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
        <div style={{ width: 70, height: 24, borderRadius: 99, background: isDark ? '#ffffff0a' : '#F2F4F7', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    ))}
    <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
  </div>
);

export default function WaitlistPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { addToast } = useToast();
  const [entries, setEntries]       = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [services, setServices]     = useState([]);
  const [staff, setStaff]           = useState([]);
  const [filter, setFilter]         = useState('waiting');
  const [search, setSearch]         = useState('');
  const [branches, setBranches]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [filterBranch, setFilterBranch] = useState(user?.branch_id || '');

  const [form, setForm] = useState({
    customer_name: '',
    phone: '',
    service_id: '',
    staff_id: '',
    preferred_date: '',
    preferred_time: '',
    notes: '',
    branch_id: user?.branch_id || ''
  });

  /* ── Theme-aware colors ── */
  const c = {
    bg:       isDark ? '#1A1A2E' : '#fff',
    bgSub:    isDark ? '#16213E' : '#F9FAFB',
    border:   isDark ? '#ffffff12' : '#EAECF0',
    text:     isDark ? '#F1F5F9' : '#101828',
    textSub:  isDark ? '#94A3B8' : '#667085',
    textMuted:isDark ? '#64748B' : '#98A2B3',
    inputBg:  isDark ? '#0F172A' : '#FAFBFC',
    inputBrd: isDark ? '#ffffff18' : '#E5E7EB',
    hoverBg:  isDark ? '#ffffff06' : '#F9FAFB',
    cardBg:   isDark ? '#1E293B' : '#fff',
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        ...(filter !== 'all' ? { status: filter } : {}),
        ...(filterBranch ? { branchId: filterBranch } : {})
      };
      const r = await api.get('/waitlist', { params });
      setEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setEntries([]); }
    setLoading(false);
  }, [filter, filterBranch]);

  const loadAll = useCallback(async () => {
    try {
      const params = filterBranch ? { branchId: filterBranch } : {};
      const r = await api.get('/waitlist', { params });
      setAllEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setAllEntries([]); }
  }, [filterBranch]);

  useEffect(() => { load(); loadAll(); }, [load, loadAll]);

  useEffect(() => {
    api.get('/branches').then((r) => {
      const data = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      setBranches(data);
      if (!user?.branch_id && data.length > 0) {
        // If admin has no default branch, but we have branches, default to first one for the form
        setForm(p => ({ ...p, branch_id: data[0].id }));
      }
    }).catch(() => {});
    api.get('/services').then((r) => setServices(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))).catch(() => {});
    api.get('/staff').then((r) => setStaff(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))).catch(() => {});
  }, [user?.branch_id]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) return addToast('Customer name required', 'error');
    setSaving(true);
    try {
      await api.post('/waitlist', form);
      addToast('Added to waitlist', 'success');
      setShowForm(false);
      setForm({
        customer_name: '',
        phone: '',
        service_id: '',
        staff_id: '',
        preferred_date: '',
        preferred_time: '',
        notes: '',
        branch_id: user?.branch_id || (branches[0]?.id || '')
      });
      load(); loadAll();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/waitlist/${id}/status`, { status });
      addToast(`Status → ${status}`, 'success');
      load(); loadAll();
    } catch { addToast('Failed to update', 'error'); }
  };

  const removeEntry = async (id) => {
    if (!window.confirm('Remove this waitlist entry?')) return;
    try {
      await api.delete(`/waitlist/${id}`);
      addToast('Removed', 'success');
      load(); loadAll();
    } catch { addToast('Failed to remove', 'error'); }
  };

  /* ── Computed ── */
  const waitingCount  = allEntries.filter(e => e.status === 'waiting').length;
  const notifiedCount = allEntries.filter(e => e.status === 'notified').length;
  const bookedCount   = allEntries.filter(e => e.status === 'booked').length;
  const totalCount    = allEntries.length;

  const filtered = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase();
        return (e.customer_name || '').toLowerCase().includes(q)
          || (e.phone || '').toLowerCase().includes(q)
          || (e.service?.name || '').toLowerCase().includes(q)
          || (e.staff?.name || '').toLowerCase().includes(q);
      })
    : entries;

  /* ── Input/label style ── */
  const inp = {
    padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${c.inputBrd}`, fontSize: 13.5,
    width: '100%', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
    outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
    background: c.inputBg, color: c.text,
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: c.textSub, marginBottom: 6, display: 'block', fontFamily: "'Inter', sans-serif" };

  /* ── Filter tabs with counts ── */
  const filterTabs = [
    { key: 'all',       label: 'All',       count: totalCount },
    { key: 'waiting',   label: 'Waiting',   count: waitingCount },
    { key: 'notified',  label: 'Notified',  count: notifiedCount },
    { key: 'booked',    label: 'Booked',    count: bookedCount },
    { key: 'cancelled', label: 'Cancelled', count: allEntries.filter(e => e.status === 'cancelled').length },
  ];

  return (
    <PageWrapper
      title="Smart Waitlist"
      subtitle="Manage walk-in and advance waiting customers"
      actions={
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: '0 2px 10px rgba(37,99,235,0.35)',
            transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
          }}
        >
          <IconPlus /> Add to Waitlist
        </button>
      }
    >

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
        <StatCard label="Waiting"  value={waitingCount}  color="#F59E0B" />
        <StatCard label="Notified" value={notifiedCount} color="#3B82F6" />
        <StatCard label="Booked"   value={bookedCount}   color="#10B981" />
        <StatCard label="Total"    value={totalCount}    color="#6366F1" />
      </div>

      {/* ── Hero Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 50%, #3B82F6 100%)',
          borderRadius: 18, padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(37,99,235,0.22)',
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
              Smart Waitlist
            </span>
            <h2 style={{
              margin: '12px 0 2px', fontSize: 28, fontWeight: 900, color: '#fff',
              lineHeight: 1.1, fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
            }}>
              {waitingCount} {waitingCount === 1 ? 'Customer' : 'Customers'} Waiting
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif" }}>
              {notifiedCount > 0 ? `${notifiedCount} notified and ready to be booked.` : 'No customers have been notified yet.'}
            </p>
            <WaitBar waiting={waitingCount} total={Math.max(totalCount, 1)} />
          </div>
          <div style={{
            background: waitingCount > 10 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.15)',
            border: waitingCount > 10 ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.3)',
            borderRadius: 99, padding: '6px 16px',
            fontSize: 12, fontWeight: 700, color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Inter', sans-serif",
          }}>
            {waitingCount > 10 ? 'High Volume' : waitingCount > 0 ? 'Active' : 'Clear'}
          </div>
        </div>
      </motion.div>

      {/* ── Search + Filter Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: c.cardBg, border: `1.5px solid ${c.border}`, borderRadius: 14,
          padding: '12px 18px', boxShadow: '0 1px 4px rgba(16,24,40,0.04)',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: c.textMuted, pointerEvents: 'none' }}>
            <IconSearch />
          </div>
          <input
            placeholder="Search customers, services, staff…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 34px', borderRadius: 10,
              border: `1.5px solid ${c.inputBrd}`, fontSize: 13, fontWeight: 500,
              fontFamily: "'Inter', sans-serif", outline: 'none',
              background: c.inputBg, color: c.text,
              transition: 'border-color 0.15s', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {filterTabs.map((t) => {
            const active = filter === t.key;
            return (
              <button key={t.key} onClick={() => setFilter(t.key)} style={{
                padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: active ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : (isDark ? '#ffffff08' : '#F9FAFB'),
                color: active ? '#fff' : c.textSub,
                border: active ? 'none' : `1.5px solid ${c.border}`,
                boxShadow: active ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {t.label}
                <span style={{
                  background: active ? 'rgba(255,255,255,0.25)' : (isDark ? '#ffffff12' : '#EAECF0'),
                  padding: '1px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 800,
                  color: active ? '#fff' : c.textMuted,
                }}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Branch Filter (for admins) */}
        {(user?.role === 'admin' || user?.role === 'superadmin') && branches.length > 1 && (
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 10,
              border: `1.5px solid ${c.inputBrd}`, fontSize: 13, fontWeight: 600,
              fontFamily: "'Inter', sans-serif", outline: 'none',
              background: c.inputBg, color: c.text,
              transition: 'border-color 0.15s', cursor: 'pointer',
            }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </motion.div>

      {/* ── Add Form (Expandable) ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              background: c.cardBg, border: `1.5px solid ${c.border}`, borderRadius: 16, padding: 24,
              boxShadow: '0 2px 12px rgba(16,24,40,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                  Add to Waitlist
                </h3>
                <button onClick={() => setShowForm(false)} style={{
                  width: 30, height: 30, borderRadius: 8, border: `1.5px solid ${c.border}`,
                  background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.textMuted, transition: 'all 0.15s',
                }}>
                  <IconXCircle />
                </button>
              </div>
              <form onSubmit={handleAdd}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={lbl}>Customer Name *</label>
                    <input style={inp} value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} required placeholder="Full name" />
                  </div>
                  <div>
                    <label style={lbl}>Phone</label>
                    <input style={inp} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="07X XXX XXXX" />
                  </div>
                  <div>
                    <label style={lbl}>Service</label>
                    <select style={inp} value={form.service_id} onChange={(e) => setForm((p) => ({ ...p, service_id: e.target.value }))}>
                      <option value="">Any service</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Branch *</label>
                    <select
                      style={inp}
                      value={form.branch_id}
                      onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value, staff_id: '' }))}
                      required
                    >
                      <option value="">Select branch</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Preferred Staff</label>
                    <select style={inp} value={form.staff_id} onChange={(e) => setForm((p) => ({ ...p, staff_id: e.target.value }))}>
                      <option value="">Any staff</option>
                      {staff
                        .filter(s => !form.branch_id || Number(s.branch_id) === Number(form.branch_id))
                        .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Preferred Date</label>
                    <input type="date" style={inp} value={form.preferred_date} onChange={(e) => setForm((p) => ({ ...p, preferred_date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Preferred Time</label>
                    <input type="time" style={inp} value={form.preferred_time} onChange={(e) => setForm((p) => ({ ...p, preferred_time: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lbl}>Notes</label>
                    <textarea style={{ ...inp, height: 60, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Additional information…" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add to Waitlist'}</Button>
                  <button type="button" onClick={() => setShowForm(false)} style={{
                    padding: '9px 18px', borderRadius: 10, border: `1.5px solid ${c.border}`, background: 'transparent',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, color: c.textSub, fontFamily: "'Inter', sans-serif",
                  }}>Cancel</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Entry Table ── */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.12 }}
        style={{
          background: c.cardBg, border: `1.5px solid ${c.border}`, borderRadius: 16,
          boxShadow: '0 2px 8px rgba(16,24,40,0.06)', overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '48px 1fr 120px 140px auto',
          padding: '12px 24px', borderBottom: `1px solid ${c.border}`,
          gap: 16, alignItems: 'center',
        }}>
          {['#', 'Customer', 'Status', 'Preference', 'Actions'].map((h) => (
            <span key={h} style={{
              fontSize: 11, fontWeight: 700, color: c.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              fontFamily: "'Inter', sans-serif",
            }}>{h}</span>
          ))}
        </div>

        {/* Body */}
        {loading ? (
          <ShimmerRows isDark={isDark} />
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '50px 20px',
            fontFamily: "'Inter', sans-serif",
          }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 14, background: isDark ? '#ffffff08' : '#F2F4F7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textMuted }}>
              <IconUser />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: c.text }}>
              {search ? 'No matching entries' : `No ${filter === 'all' ? '' : filter} entries`}
            </div>
            <div style={{ fontSize: 13, marginTop: 4, color: c.textSub }}>
              {search ? 'Try a different search term.' : 'Add customers to the waitlist to see them here.'}
            </div>
          </div>
        ) : (
          <div>
            {filtered.map((e, idx) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.025 }}
                style={{
                  display: 'grid', gridTemplateColumns: '48px 1fr 120px 140px auto',
                  padding: '14px 24px', gap: 16, alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? `1px solid ${c.border}` : 'none',
                  transition: 'background 0.12s', cursor: 'default',
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = c.hoverBg; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
              >
                {/* # Position */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: e.status === 'waiting'
                    ? (isDark ? '#F59E0B18' : 'linear-gradient(135deg, #F59E0B22, #F59E0B12)')
                    : e.status === 'booked'
                    ? (isDark ? '#10B98118' : 'linear-gradient(135deg, #10B98122, #10B98112)')
                    : (isDark ? '#ffffff08' : '#F9FAFB'),
                  border: `1.5px solid ${
                    e.status === 'waiting' ? (isDark ? '#F59E0B30' : '#F59E0B28')
                    : e.status === 'booked' ? (isDark ? '#10B98130' : '#10B98128')
                    : c.border
                  }`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800,
                  color: e.status === 'waiting' ? '#D97706' : e.status === 'booked' ? '#059669' : c.textMuted,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {idx + 1}
                </div>

                {/* Customer */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: c.text, fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.customer_name}
                  </div>
                  <div style={{ fontSize: 12, color: c.textSub, marginTop: 3, fontFamily: "'Inter', sans-serif", display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {e.phone && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <IconPhone /> {e.phone}
                      </span>
                    )}
                    {e.service && (
                      <span style={{
                        background: isDark ? '#ffffff08' : '#F2F4F7', padding: '1px 8px', borderRadius: 99,
                        fontSize: 11, fontWeight: 600, color: c.textSub,
                      }}>
                        {e.service.name}
                      </span>
                    )}
                    {e.staff && (
                      <span style={{
                        background: isDark ? '#ffffff08' : '#F2F4F7', padding: '1px 8px', borderRadius: 99,
                        fontSize: 11, fontWeight: 600, color: c.textSub,
                      }}>
                        {e.staff.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <StatusBadge status={e.status} isDark={isDark} />

                {/* Preference */}
                <div style={{ fontSize: 12, color: c.textSub, fontFamily: "'Inter', sans-serif" }}>
                  {e.preferred_date ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <IconCalendar /> {e.preferred_date}
                    </div>
                  ) : null}
                  {e.preferred_time ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <IconClock /> {e.preferred_time}
                    </div>
                  ) : null}
                  {!e.preferred_date && !e.preferred_time && (
                    <span style={{ color: c.textMuted }}>—</span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {e.status === 'waiting' && (
                    <button onClick={() => updateStatus(e.id, 'notified')} title="Notify" style={{
                      padding: '5px 10px', borderRadius: 8,
                      border: `1.5px solid ${isDark ? '#1E40AF44' : '#BFDBFE'}`,
                      background: isDark ? '#1E40AF18' : '#EFF6FF',
                      color: isDark ? '#93C5FD' : '#1D4ED8',
                      fontSize: 11, cursor: 'pointer', fontWeight: 700,
                      fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <IconBell /> Notify
                    </button>
                  )}
                  {(e.status === 'waiting' || e.status === 'notified') && (
                    <button onClick={() => updateStatus(e.id, 'booked')} title="Book" style={{
                      padding: '5px 10px', borderRadius: 8,
                      border: `1.5px solid ${isDark ? '#064E3B44' : '#A7F3D0'}`,
                      background: isDark ? '#064E3B18' : '#ECFDF5',
                      color: isDark ? '#6EE7B7' : '#065F46',
                      fontSize: 11, cursor: 'pointer', fontWeight: 700,
                      fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <IconCheck /> Book
                    </button>
                  )}
                  {e.status !== 'cancelled' && e.status !== 'booked' && (
                    <button onClick={() => updateStatus(e.id, 'cancelled')} title="Cancel" style={{
                      padding: '5px 10px', borderRadius: 8,
                      border: `1.5px solid ${isDark ? '#7F1D1D44' : '#FECACA'}`,
                      background: isDark ? '#7F1D1D18' : '#FEF2F2',
                      color: isDark ? '#FCA5A5' : '#991B1B',
                      fontSize: 11, cursor: 'pointer', fontWeight: 700,
                      fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <IconXCircle /> Cancel
                    </button>
                  )}
                  <button onClick={() => removeEntry(e.id)} title="Remove" style={{
                    padding: '5px 8px', borderRadius: 8,
                    border: `1.5px solid ${c.border}`,
                    background: 'transparent', color: c.textMuted,
                    fontSize: 11, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                    transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    <IconTrash />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Table footer */}
        {!loading && filtered.length > 0 && (
          <div style={{
            padding: '10px 24px', borderTop: `1px solid ${c.border}`,
            fontSize: 12, color: c.textMuted, fontFamily: "'Inter', sans-serif",
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Showing {filtered.length} of {allEntries.length} entries</span>
            <span>Customers are automatically notified when slots open up.</span>
          </div>
        )}
      </motion.div>
    </PageWrapper>
  );
}
