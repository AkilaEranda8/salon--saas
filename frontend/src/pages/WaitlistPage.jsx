import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard } from '../components/ui/PageKit';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

const STATUS_META = {
  waiting:   { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B', border: '#FDE68A', label: 'Waiting' },
  notified:  { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6', border: '#BFDBFE', label: 'Notified' },
  booked:    { bg: '#D1FAE5', text: '#065F46', dot: '#10B981', border: '#A7F3D0', label: 'Booked' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444', border: '#FECACA', label: 'Cancelled' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_META[status] || STATUS_META.waiting;
  return (
    <span style={{
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      borderRadius: 99, padding: '3px 12px', fontSize: 11, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: "'Inter', sans-serif",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  );
};

/* ── Wait-time bar (hero) ─────────────────────────────────────────────────── */
const WaitBar = ({ waiting, total }) => {
  const pct = total > 0 ? Math.min(100, Math.round((waiting / total) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, maxWidth: 360 }}>
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

export default function WaitlistPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [entries, setEntries]   = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff]       = useState([]);
  const [filter, setFilter]     = useState('waiting');
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [form, setForm] = useState({ customer_name: '', phone: '', service_id: '', staff_id: '', preferred_date: '', preferred_time: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const r = await api.get('/waitlist', { params });
      setEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setEntries([]); }
    setLoading(false);
  }, [filter]);

  const loadAll = useCallback(async () => {
    try {
      const r = await api.get('/waitlist');
      setAllEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setAllEntries([]); }
  }, []);

  useEffect(() => { load(); loadAll(); }, [load, loadAll]);

  useEffect(() => {
    api.get('/services').then((r) => setServices(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))).catch(() => {});
    api.get('/staff').then((r) => setStaff(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))).catch(() => {});
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) return addToast('Customer name required', 'error');
    setSaving(true);
    try {
      await api.post('/waitlist', form);
      addToast('Added to waitlist', 'success');
      setShowForm(false);
      setForm({ customer_name: '', phone: '', service_id: '', staff_id: '', preferred_date: '', preferred_time: '', notes: '' });
      load();
      loadAll();
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/waitlist/${id}/status`, { status });
      addToast(`Status updated to ${status}`, 'success');
      load();
      loadAll();
    } catch { addToast('Failed to update', 'error'); }
  };

  const removeEntry = async (id) => {
    if (!window.confirm('Remove this waitlist entry?')) return;
    try {
      await api.delete(`/waitlist/${id}`);
      addToast('Removed', 'success');
      load();
      loadAll();
    } catch { addToast('Failed to remove', 'error'); }
  };

  /* ── Computed stats ── */
  const waitingCount  = allEntries.filter(e => e.status === 'waiting').length;
  const notifiedCount = allEntries.filter(e => e.status === 'notified').length;
  const bookedCount   = allEntries.filter(e => e.status === 'booked').length;
  const totalCount    = allEntries.length;

  const inp = {
    padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13.5,
    width: '100%', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
    outline: 'none', transition: 'border-color 0.15s',
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 6, display: 'block', fontFamily: "'Inter', sans-serif" };

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
          + Add to Waitlist
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
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
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

      {/* ── Filter Tabs ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', 'waiting', 'notified', 'booked', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '7px 18px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            background: filter === s ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F9FAFB',
            color: filter === s ? '#fff' : '#667085',
            border: filter === s ? 'none' : '1.5px solid #EAECF0',
            boxShadow: filter === s ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
            transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
          }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Add Form ── */}
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
              background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 24,
              boxShadow: '0 2px 8px rgba(16,24,40,0.06)',
            }}>
              <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                Add to Waitlist
              </h3>
              <form onSubmit={handleAdd}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={lbl}>Customer Name *</label>
                    <input style={inp} value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={lbl}>Phone</label>
                    <input style={inp} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Service</label>
                    <select style={inp} value={form.service_id} onChange={(e) => setForm((p) => ({ ...p, service_id: e.target.value }))}>
                      <option value="">Any service</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Preferred Staff</label>
                    <select style={inp} value={form.staff_id} onChange={(e) => setForm((p) => ({ ...p, staff_id: e.target.value }))}>
                      <option value="">Any staff</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                    <textarea style={{ ...inp, height: 60, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add to Waitlist'}</Button>
                  <button type="button" onClick={() => setShowForm(false)} style={{
                    padding: '9px 18px', borderRadius: 10, border: '1.5px solid #EAECF0', background: '#fff',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#344054', fontFamily: "'Inter', sans-serif",
                  }}>Cancel</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Entry List ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#98A2B3', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: '#98A2B3',
          border: '2px dashed #E5E7EB', borderRadius: 14,
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#667085' }}>No waitlist entries for "{filter}"</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Entries will appear here when customers are added.</div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16,
            boxShadow: '0 2px 8px rgba(16,24,40,0.06)', overflow: 'hidden',
          }}
        >
          {entries.map((e, idx) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              style={{
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                borderBottom: idx < entries.length - 1 ? '1px solid #F2F4F7' : 'none',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = '#F9FAFB'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
            >
              {/* Position indicator */}
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: e.status === 'waiting' ? 'linear-gradient(135deg, #F59E0B22, #F59E0B12)' : e.status === 'booked' ? 'linear-gradient(135deg, #10B98122, #10B98112)' : '#F9FAFB',
                border: `1.5px solid ${e.status === 'waiting' ? '#F59E0B28' : e.status === 'booked' ? '#10B98128' : '#EAECF0'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: e.status === 'waiting' ? '#D97706' : e.status === 'booked' ? '#059669' : '#98A2B3',
                fontFamily: "'Inter', sans-serif", flexShrink: 0,
              }}>
                {idx + 1}
              </div>

              {/* Customer info */}
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#101828', fontFamily: "'Inter', sans-serif" }}>{e.customer_name}</div>
                <div style={{ fontSize: 12.5, color: '#667085', marginTop: 3, fontFamily: "'Inter', sans-serif", display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {e.phone && <span>{e.phone}</span>}
                  {e.service && <span style={{ color: '#98A2B3' }}>•</span>}
                  {e.service && <span>{e.service.name}</span>}
                  {e.staff && <span style={{ color: '#98A2B3' }}>•</span>}
                  {e.staff && <span>{e.staff.name}</span>}
                </div>
                {(e.preferred_date || e.preferred_time) && (
                  <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 3, fontFamily: "'Inter', sans-serif" }}>
                    {e.preferred_date && <span>{e.preferred_date}</span>}
                    {e.preferred_date && e.preferred_time && <span> &middot; </span>}
                    {e.preferred_time && <span>{e.preferred_time}</span>}
                  </div>
                )}
              </div>

              <StatusBadge status={e.status} />

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6 }}>
                {e.status === 'waiting' && (
                  <button onClick={() => updateStatus(e.id, 'notified')} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px solid #BFDBFE', background: '#EFF6FF',
                    color: '#1D4ED8', fontSize: 11.5, cursor: 'pointer', fontWeight: 700,
                    fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                  }}>
                    Notify
                  </button>
                )}
                {(e.status === 'waiting' || e.status === 'notified') && (
                  <button onClick={() => updateStatus(e.id, 'booked')} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px solid #A7F3D0', background: '#ECFDF5',
                    color: '#065F46', fontSize: 11.5, cursor: 'pointer', fontWeight: 700,
                    fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                  }}>
                    Book
                  </button>
                )}
                {e.status !== 'cancelled' && e.status !== 'booked' && (
                  <button onClick={() => updateStatus(e.id, 'cancelled')} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2',
                    color: '#991B1B', fontSize: 11.5, cursor: 'pointer', fontWeight: 700,
                    fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
                  }}>
                    Cancel
                  </button>
                )}
                <button onClick={() => removeEntry(e.id)} style={{
                  padding: '6px 10px', borderRadius: 8, border: '1.5px solid #EAECF0', background: '#F9FAFB',
                  color: '#98A2B3', fontSize: 11.5, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.15s',
                }}>
                  Remove
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Customers are automatically notified when their spot opens up.
      </p>
    </PageWrapper>
  );
}
