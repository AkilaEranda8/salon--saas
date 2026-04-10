import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

const Rs     = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const STATUS_COLOR = {
  waiting:   { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  notified:  { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  booked:    { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_COLOR[status] || STATUS_COLOR.waiting;
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default function WaitlistPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [entries, setEntries]   = useState([]);
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

  useEffect(() => { load(); }, [load]);

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
    } catch (err) { addToast(err.response?.data?.message || 'Error', 'error'); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/waitlist/${id}/status`, { status });
      addToast(`Status updated to ${status}`, 'success');
      load();
    } catch { addToast('Failed to update', 'error'); }
  };

  const removeEntry = async (id) => {
    if (!window.confirm('Remove this waitlist entry?')) return;
    try {
      await api.delete(`/waitlist/${id}`);
      addToast('Removed', 'success');
      load();
    } catch { addToast('Failed to remove', 'error'); }
  };

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };

  return (
    <PageWrapper
      title="Smart Waitlist"
      subtitle="Manage walk-in and advance waiting customers"
      actions={
        <Button onClick={() => setShowForm(true)}>+ Add to Waitlist</Button>
      }
    >
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['all', 'waiting', 'notified', 'booked', 'cancelled'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: filter === s ? '#2563EB' : '#F3F4F6',
            color: filter === s ? '#fff' : '#374151',
            border: 'none',
          }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Add to Waitlist</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
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
                <textarea style={{ ...inp, height: 60 }} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add to Waitlist'}</Button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#F9FAFB', borderRadius: 12, color: '#9CA3AF' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
          <div style={{ fontWeight: 600 }}>No waitlist entries for "{filter}"</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{e.customer_name}</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  {e.phone && <span>{e.phone}</span>}
                  {e.service && <span style={{ marginLeft: 8 }}>• {e.service.name}</span>}
                  {e.staff && <span style={{ marginLeft: 8 }}>• {e.staff.name}</span>}
                </div>
                {(e.preferred_date || e.preferred_time) && (
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {e.preferred_date && <span>📅 {e.preferred_date}</span>}
                    {e.preferred_time && <span> 🕐 {e.preferred_time}</span>}
                  </div>
                )}
              </div>
              <StatusBadge status={e.status} />
              <div style={{ display: 'flex', gap: 6 }}>
                {e.status === 'waiting' && (
                  <button onClick={() => updateStatus(e.id, 'notified')} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #3B82F6', background: '#EFF6FF', color: '#1D4ED8', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    Mark Notified
                  </button>
                )}
                {(e.status === 'waiting' || e.status === 'notified') && (
                  <button onClick={() => updateStatus(e.id, 'booked')} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #10B981', background: '#D1FAE5', color: '#065F46', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    Booked ✓
                  </button>
                )}
                {e.status !== 'cancelled' && e.status !== 'booked' && (
                  <button onClick={() => updateStatus(e.id, 'cancelled')} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #EF4444', background: '#FEE2E2', color: '#991B1B', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    Cancel
                  </button>
                )}
                <button onClick={() => removeEntry(e.id)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', fontSize: 11, cursor: 'pointer' }}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
