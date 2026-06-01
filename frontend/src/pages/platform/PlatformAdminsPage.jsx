import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { DataTable, TableCraftStatusBadge, CRAFT_TABLE_DEFAULTS } from '../../components/ui/PageKit';

function Surface({ title, subtitle, children, dark = false, rightAction = null }) {
  return (
    <section
      style={{
        borderRadius: 18,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#111827' : '#FFFFFF',
        boxShadow: dark ? '0 12px 26px rgba(2,6,23,0.34)' : '0 12px 24px rgba(15,23,42,0.07)',
        padding: '16px 16px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: dark ? '#F8FAFC' : '#0F172A' }}>{title}</div>
          {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: dark ? '#94A3B8' : '#64748B' }}>{subtitle}</div>}
        </div>
        {rightAction}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint, dark = false, accent = '#2563EB' }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${dark ? '#334155' : '#E5E7EB'}`,
        background: dark ? '#0B1220' : '#FFFFFF',
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.75, color: dark ? '#94A3B8' : '#64748B' }}>
        {label}
      </div>
      <div style={{ marginTop: 7, fontSize: 24, fontWeight: 800, lineHeight: 1, color: accent }}>{value}</div>
      {hint && <div style={{ marginTop: 6, fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>{hint}</div>}
    </div>
  );
}

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
};

function AdminModal({ onClose, onSave, saving, form, setForm, formError }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          width: 560,
          maxWidth: '92vw',
          boxShadow: '0 30px 80px rgba(15,23,42,0.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #E5E7EB', background: 'linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 70%)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#6366F1' }}>Platform Security</div>
          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, color: '#111827' }}>Create Platform Admin</div>
          <div style={{ marginTop: 5, fontSize: 13, color: '#64748B' }}>Add a new admin with global platform access.</div>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 12 }}>
          <label style={{ display: 'block' }}>
            <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#374151' }}>Name (optional)</div>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Platform Admin"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7EB', borderRadius: 9, padding: '10px 11px', fontSize: 13 }}
            />
          </label>

          <label style={{ display: 'block' }}>
            <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#374151' }}>Username</div>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="admin_username"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7EB', borderRadius: 9, padding: '10px 11px', fontSize: 13 }}
            />
          </label>

          <label style={{ display: 'block' }}>
            <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#374151' }}>Password</div>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Strong password"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7EB', borderRadius: 9, padding: '10px 11px', fontSize: 13 }}
            />
          </label>

          {formError && (
            <div style={{ color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 12px', fontSize: 12 }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ border: '1px solid #D0D5DD', borderRadius: 12, background: '#fff', color: '#344054', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{ border: 'none', borderRadius: 12, background: '#2563EB', color: '#fff', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.75 : 1 }}
            >
              {saving ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlatformAdminsPage() {
  const { isDark } = useTheme();
  const { user } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const loadAdmins = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setNotice({ type: '', text: '' });

    try {
      const res = await api.get('/platform/admins');
      setAdmins(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to load platform admins.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAdmins(false);
  }, []);

  const activeCount = useMemo(() => admins.filter((a) => a.is_active !== false).length, [admins]);

  const createAdmin = async () => {
    setFormError('');
    const payload = {
      name: String(form.name || '').trim(),
      username: String(form.username || '').trim(),
      password: String(form.password || ''),
    };

    if (!payload.username || !payload.password) {
      setFormError('Username and password are required.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/platform/admins', payload);
      setShowModal(false);
      setForm(EMPTY_FORM);
      setNotice({ type: 'success', text: 'Platform admin created successfully.' });
      await loadAdmins(true);
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to create admin.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAdmin = async (admin) => {
    if (!window.confirm(`Delete platform admin ${admin.username}?`)) return;
    try {
      await api.delete(`/platform/admins/${admin.id}`);
      setNotice({ type: 'success', text: 'Platform admin deleted successfully.' });
      await loadAdmins(true);
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.message || 'Failed to delete admin.' });
    }
  };

  const columns = useMemo(() => [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => row.name || 'Platform Admin',
      cell: ({ row: { original: admin } }) => (
        <span style={{ fontWeight: 700, color: isDark ? '#E2E8F0' : '#0F172A' }}>{admin.name || 'Platform Admin'}</span>
      ),
    },
    {
      id: 'username',
      header: 'Username',
      accessorFn: (row) => row.username || '',
      cell: ({ row: { original: admin } }) => (
        <span style={{ color: isDark ? '#CBD5E1' : '#334155' }}>{admin.username}</span>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      accessorFn: (row) => row.createdAt || '',
      enableSorting: false,
      cell: ({ row: { original: admin } }) => (
        <span style={{ color: isDark ? '#CBD5E1' : '#334155' }}>
          {admin.createdAt ? new Date(admin.createdAt).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (row) => (row.is_active !== false ? 'active' : 'inactive'),
      cell: ({ row: { original: admin } }) => (
        <TableCraftStatusBadge status={admin.is_active !== false ? 'active' : 'inactive'} />
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row: { original: admin } }) => {
        const isSelf = String(admin.id) === String(user?.id);
        return isSelf ? (
          <span style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#6B7280', fontWeight: 700 }}>Current account</span>
        ) : (
          <button
            type="button"
            onClick={() => deleteAdmin(admin)}
            style={{
              border: '1px solid #FECACA',
              background: '#FEF2F2',
              color: '#B91C1C',
              borderRadius: 9,
              padding: '7px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        );
      },
    },
  ], [isDark, user?.id]);

  const pageBg = isDark
    ? 'radial-gradient(circle at top left, rgba(59,130,246,0.15), transparent 35%), linear-gradient(180deg,#0F172A 0%, #0B1220 100%)'
    : 'radial-gradient(circle at top left, rgba(37,99,235,0.12), transparent 35%), linear-gradient(180deg,#F7FBFF 0%, #F4F7FA 100%)';

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: '28px clamp(16px,2.4vw,34px) 44px', boxSizing: 'border-box', background: pageBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, color: isDark ? '#93C5FD' : '#1D4ED8' }}>Platform Security</div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F2A34' }}>Platform Admins</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: isDark ? '#94A3B8' : '#5B6B70' }}>
            Manage global administrator accounts with access to platform-level controls.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => loadAdmins(true)}
            disabled={refreshing || loading || saving}
            style={{
              border: `1px solid ${isDark ? '#334155' : '#D0D5DD'}`,
              background: isDark ? '#0B1220' : '#fff',
              color: isDark ? '#E2E8F0' : '#1F2937',
              borderRadius: 12,
              padding: '10px 13px',
              fontSize: 13,
              fontWeight: 700,
              cursor: refreshing || loading || saving ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => { setShowModal(true); setFormError(''); }}
            style={{
              border: 'none',
              background: '#2563EB',
              color: '#fff',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + New Admin
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric label="Total Admins" value={admins.length} hint="platform_admin accounts" dark={isDark} accent="#2563EB" />
        <Metric label="Active" value={activeCount} hint="currently enabled" dark={isDark} accent="#10B981" />
        <Metric label="Current User" value={user?.username || '-'} hint={`id ${user?.id ?? '-'}`} dark={isDark} accent="#7C3AED" />
      </div>

      {notice.text && (
        <div
          style={{
            marginBottom: 14,
            borderRadius: 12,
            border: notice.type === 'error' ? '1px solid #FECACA' : '1px solid #A7F3D0',
            background: notice.type === 'error' ? '#FEF2F2' : '#ECFDF5',
            color: notice.type === 'error' ? '#B91C1C' : '#065F46',
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {notice.text}
        </div>
      )}

      <Surface dark={isDark} title="Admin Directory" subtitle="Create, search, and remove platform administrator accounts.">
        <DataTable
          columns={columns}
          data={admins}
          loading={loading}
          emptyMessage="No admins found."
          searchableColumns={[
            { id: 'name', title: 'Name' },
            { id: 'username', title: 'Username' },
          ]}
          filterableColumns={[{
            id: 'status',
            title: 'Status',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ],
          }]}
          {...CRAFT_TABLE_DEFAULTS}
        />
      </Surface>

      {showModal && (
        <AdminModal
          onClose={() => { setShowModal(false); setForm(EMPTY_FORM); }}
          onSave={createAdmin}
          saving={saving}
          form={form}
          setForm={setForm}
          formError={formError}
        />
      )}
    </div>
  );
}
