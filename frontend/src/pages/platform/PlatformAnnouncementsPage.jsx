import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import { DataTable } from '../../components/ui/PageKit';

const TYPES = ['INFO', 'WARNING', 'PAYMENT_DUE'];
const TARGETS = ['ALL', 'SELECTED'];

const TYPE_COLORS = {
  INFO:        { bg: '#DBEAFE', text: '#1E40AF' },
  WARNING:     { bg: '#FEF3C7', text: '#92400E' },
  PAYMENT_DUE: { bg: '#FEE2E2', text: '#991B1B' },
};

const EMPTY = {
  title: '',
  body: '',
  type: 'INFO',
  target: 'ALL',
  target_tenants: [],
  dismissible: true,
  sendNow: true,
};

function Modal({ title, onClose, children, dark }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: dark ? '#1E293B' : '#fff',
        borderRadius: 18, padding: '24px 26px', width: 560, maxWidth: '92vw',
        maxHeight: '90vh', overflowY: 'auto',
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: dark ? '#F8FAFC' : '#111827' }}>{title}</div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#94A3B8' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PlatformAnnouncementsPage() {
  const { isDark } = useTheme();
  const [rows, setRows] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
    border: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`,
    background: isDark ? '#0F172A' : '#fff',
    color: isDark ? '#E2E8F0' : '#111827',
    fontSize: 13,
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [annRes, tenantRes] = await Promise.all([
        api.get('/platform/announcements'),
        api.get('/platform/tenants?limit=500'),
      ]);
      setRows(Array.isArray(annRes.data) ? annRes.data : []);
      const t = tenantRes.data;
      setTenants(Array.isArray(t) ? t : (Array.isArray(t?.data) ? t.data : []));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load announcements.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tenantMap = useMemo(() => {
    const m = new Map();
    for (const t of tenants) m.set(Number(t.id), t);
    return m;
  }, [tenants]);

  const openCreate = () => {
    setForm(EMPTY);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message are required.');
      return;
    }
    if (form.target === 'SELECTED' && !form.target_tenants.length) {
      setError('Pick at least one tenant.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/platform/announcements', {
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type,
        target: form.target,
        target_tenants: form.target === 'SELECTED' ? form.target_tenants.map(Number) : [],
        dismissible: form.dismissible,
        sendNow: form.sendNow,
      });
      setNotice(form.sendNow ? 'Announcement sent to tenants.' : 'Draft saved.');
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    }
    setSaving(false);
  };

  const sendDraft = async (row) => {
    try {
      await api.patch(`/platform/announcements/${row.id}/send`);
      setNotice('Announcement sent.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Send failed.');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.title}"?`)) return;
    try {
      await api.delete(`/platform/announcements/${row.id}`);
      setNotice('Deleted.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.');
    }
  };

  const columns = useMemo(() => [
    {
      id: 'title',
      header: 'Title',
      accessorKey: 'title',
      meta: { width: '22%' },
      cell: ({ row: { original: r } }) => (
        <div>
          <div style={{ fontWeight: 700 }}>{r.title}</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>{r.created_by}</div>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessorKey: 'type',
      meta: { width: '12%' },
      cell: ({ getValue }) => {
        const v = getValue();
        const c = TYPE_COLORS[v] || TYPE_COLORS.INFO;
        return (
          <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text }}>
            {v}
          </span>
        );
      },
    },
    {
      id: 'target',
      header: 'Audience',
      accessorFn: (r) => r.target,
      meta: { width: '18%' },
      cell: ({ row: { original: r } }) => (
        r.target === 'ALL'
          ? <span>All salons</span>
          : (
            <span style={{ fontSize: 12 }}>
              {(r.target_tenants || []).map((id) => tenantMap.get(Number(id))?.name || `#${id}`).join(', ')}
            </span>
          )
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      meta: { width: '10%' },
    },
    {
      id: 'sent',
      header: 'Sent',
      accessorFn: (r) => r.sent_at || '',
      meta: { width: '14%' },
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12 }}>{getValue() ? new Date(getValue()).toLocaleString() : '—'}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { width: '16%' },
      cell: ({ row: { original: r } }) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {r.status !== 'SENT' && (
            <button type="button" onClick={() => sendDraft(r)} style={actionBtn('#059669', '#ECFDF5')}>Send</button>
          )}
          <button type="button" onClick={() => remove(r)} style={actionBtn('#DC2626', '#FEF2F2')}>Delete</button>
        </div>
      ),
    },
  ], [tenantMap]);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: isDark ? '#F8FAFC' : '#111827' }}>Announcements</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: isDark ? '#94A3B8' : '#64748B' }}>
            Send messages to salon dashboards — e.g. payment due reminders.
          </p>
        </div>
        <button type="button" onClick={openCreate} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: '#4F46E5', color: '#fff', fontWeight: 700, fontSize: 13,
        }}>
          + New announcement
        </button>
      </div>

      {error && <div style={banner('#FEF2F2', '#DC2626')}>{error}</div>}
      {notice && <div style={banner('#ECFDF5', '#059669')}>{notice}</div>}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyMessage="No announcements yet"
        emptySub="Create one to notify salons about billing or updates"
        pagination={false}
        searchableColumns={[{ id: 'title', title: 'Title' }]}
      />

      {modalOpen && (
        <Modal title="New announcement" onClose={() => setModalOpen(false)} dark={isDark}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={labelStyle(isDark)}>
              Title
              <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label style={labelStyle(isDark)}>
              Message
              <textarea
                style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={labelStyle(isDark)}>
                Type
                <select style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={labelStyle(isDark)}>
                Audience
                <select style={inputStyle} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}>
                  {TARGETS.map((t) => <option key={t} value={t}>{t === 'ALL' ? 'All salons' : 'Selected salons'}</option>)}
                </select>
              </label>
            </div>
            {form.target === 'SELECTED' && (
              <label style={labelStyle(isDark)}>
                Salons
                <select
                  multiple
                  style={{ ...inputStyle, minHeight: 120 }}
                  value={form.target_tenants.map(String)}
                  onChange={(e) => {
                    const selected = [...e.target.selectedOptions].map((o) => Number(o.value));
                    setForm((f) => ({ ...f, target_tenants: selected }));
                  }}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: isDark ? '#CBD5E1' : '#374151' }}>
              <input type="checkbox" checked={form.dismissible} onChange={(e) => setForm((f) => ({ ...f, dismissible: e.target.checked }))} />
              Tenant admin can dismiss
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: isDark ? '#CBD5E1' : '#374151' }}>
              <input type="checkbox" checked={form.sendNow} onChange={(e) => setForm((f) => ({ ...f, sendNow: e.target.checked }))} />
              Send immediately
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={() => setModalOpen(false)} style={actionBtn('#374151', isDark ? '#1E293B' : '#F3F4F6')}>Cancel</button>
              <button type="button" disabled={saving} onClick={handleSave} style={actionBtn('#fff', '#4F46E5')}>
                {saving ? 'Saving…' : form.sendNow ? 'Send' : 'Save draft'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function labelStyle(dark) {
  return { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: dark ? '#94A3B8' : '#374151' };
}

function banner(bg, color) {
  return { background: bg, color, padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13 };
}

function actionBtn(color, bg) {
  return {
    padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: bg, color, fontSize: 12, fontWeight: 700,
  };
}
