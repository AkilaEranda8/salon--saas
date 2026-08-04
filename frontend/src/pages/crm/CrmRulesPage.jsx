import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const CATEGORIES = ['behavior', 'booking', 'handoff', 'pricing', 'language', 'custom'];

const EMPTY = {
  title: '',
  category: 'custom',
  body: '',
  priority: 50,
  is_active: true,
};

export default function CrmRulesPage() {
  const { C } = usePageTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat) params.category = filterCat;
      const { data } = await api.get('/crm/rules', { params });
      setRows(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [filterCat]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm(EMPTY);
    setEditId(null);
  };

  const startEdit = (row) => {
    setEditId(row.id);
    setForm({
      title: row.title || '',
      category: row.category || 'custom',
      body: row.body || '',
      priority: row.priority ?? 50,
      is_active: row.is_active !== false,
    });
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and rule text required');
      return;
    }
    const payload = {
      ...form,
      priority: Number(form.priority) || 0,
    };
    try {
      if (editId) {
        await api.put(`/crm/rules/${editId}`, payload);
        toast.success('Rule updated');
      } else {
        await api.post('/crm/rules', payload);
        toast.success('Rule created');
      }
      resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.delete(`/crm/rules/${id}`);
      toast.success('Deleted');
      if (editId === id) resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.put(`/crm/rules/${row.id}`, { is_active: !row.is_active });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post('/crm/rules/seed-defaults');
      setRows(data.data || []);
      toast.success(data.created ? `Added ${data.created} starter rules` : 'Starter rules already present');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <PageWrapper
      title="AI Rules"
      subtitle="Rules are private to YOUR salon only. Other tenants cannot see or use them. Active rules are mandatory for your WhatsApp AI."
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={seedDefaults} disabled={seeding} style={ghostBtn(C)}>
            {seeding ? 'Loading…' : 'Add starter rules'}
          </button>
          <button type="button" onClick={load} style={ghostBtn(C)}>Refresh</button>
        </div>
      )}
    >
      <div style={{
        marginBottom: 14, padding: '12px 14px', borderRadius: 12,
        border: `1px solid ${C.border}`, background: C.cardBg, color: C.muted, fontSize: 13,
      }}>
        Tenant isolation: rules you save here apply only to this salon’s WhatsApp AI.
        The bot can access only this salon’s services, staff, customers, and knowledge — not other salons.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: 16 }}>
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: C.text }}>
            {editId ? `Edit rule #${editId}` : 'New rule'}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Rule title"
              style={inputStyle(C)}
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              style={inputStyle(C)}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="What should the AI do / not do?"
              rows={8}
              style={{ ...inputStyle(C), resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: C.muted }}>
                Priority
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  style={{ ...inputStyle(C), width: 100, marginTop: 4, display: 'block' }}
                />
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.text, fontSize: 13, marginTop: 18 }}>
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={save} style={primaryBtn(C)}>{editId ? 'Update' : 'Create'}</button>
              {editId && <button type="button" onClick={resetForm} style={ghostBtn(C)}>Cancel</button>}
            </div>
          </div>
        </div>

        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...inputStyle(C), maxWidth: 200 }}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {loading && <div style={{ color: C.muted }}>Loading…</div>}
          {!loading && !rows.length && (
            <div style={{ color: C.muted, fontSize: 13.5 }}>
              No rules yet. Click <strong>Add starter rules</strong> or create your own.
            </div>
          )}
          <div style={{ display: 'grid', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
            {rows.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, opacity: r.is_active ? 1 : 0.65 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, fontWeight: 700, color: C.text, fontSize: 13 }}>{r.title}</div>
                  <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase' }}>{r.category}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>P{r.priority}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  {String(r.body || '')}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => startEdit(r)} style={ghostBtn(C)}>Edit</button>
                  <button type="button" onClick={() => toggleActive(r)} style={ghostBtn(C)}>
                    {r.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" onClick={() => remove(r.id)} style={ghostBtn(C)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

function inputStyle(C) {
  return {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${C.inputBdr}`,
    background: C.inputBg,
    color: C.text,
    padding: '10px 12px',
    fontSize: 13.5,
    boxSizing: 'border-box',
  };
}
function primaryBtn(C) {
  return {
    padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: C.primary || '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13,
  };
}
function ghostBtn(C) {
  return {
    padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
    background: 'transparent', color: C.text, fontWeight: 600, fontSize: 12.5,
  };
}
