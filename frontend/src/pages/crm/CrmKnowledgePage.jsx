import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const CATEGORIES = ['faq', 'policy', 'promo', 'service', 'script', 'other'];

const EMPTY = {
  title: '',
  category: 'faq',
  body: '',
  tags: '',
  locale: 'en',
  priority: 0,
  is_active: true,
};

export default function CrmKnowledgePage() {
  const { C } = usePageTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [previewQ, setPreviewQ] = useState('');
  const [previewHits, setPreviewHits] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat) params.category = filterCat;
      const { data } = await api.get('/crm/knowledge', { params });
      setRows(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load knowledge base');
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
      category: row.category || 'faq',
      body: row.body || '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
      locale: row.locale || 'en',
      priority: row.priority || 0,
      is_active: row.is_active !== false,
    });
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body required');
      return;
    }
    const payload = {
      ...form,
      tags: form.tags,
      priority: Number(form.priority) || 0,
    };
    try {
      if (editId) {
        await api.put(`/crm/knowledge/${editId}`, payload);
        toast.success('Article updated');
      } else {
        await api.post('/crm/knowledge', payload);
        toast.success('Article created');
      }
      resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this article?')) return;
    try {
      await api.delete(`/crm/knowledge/${id}`);
      toast.success('Deleted');
      if (editId === id) resetForm();
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const runPreview = async () => {
    try {
      const { data } = await api.get('/crm/knowledge/search', { params: { q: previewQ, limit: 5 } });
      setPreviewHits(data.hits || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed');
    }
  };

  return (
    <PageWrapper
      title="AI Knowledge Base"
      subtitle="FAQs, policies, promos, and scripts the WhatsApp AI receptionist can trust."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{editId ? `Edit #${editId}` : 'New article'}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title"
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
              placeholder="Content the AI should use…"
              rows={8}
              style={{ ...inputStyle(C), resize: 'vertical' }}
            />
            <input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="Tags (comma separated)"
              style={inputStyle(C)}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                style={{ ...inputStyle(C), width: 100 }}
                title="Priority"
              />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.text, fontSize: 13 }}>
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

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={inputStyle(C)}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" onClick={load} style={ghostBtn(C)}>Refresh</button>
            </div>
            {loading && <div style={{ color: C.muted }}>Loading…</div>}
            {!loading && !rows.length && <div style={{ color: C.muted }}>No articles yet.</div>}
            <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {rows.map((r) => (
                <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, fontWeight: 700, color: C.text, fontSize: 13 }}>{r.title}</div>
                    <span style={{ fontSize: 11, color: C.muted }}>{r.category}</span>
                    {!r.is_active && <span style={{ fontSize: 11, color: '#DC2626' }}>off</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{String(r.body || '').slice(0, 100)}…</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => startEdit(r)} style={ghostBtn(C)}>Edit</button>
                    <button type="button" onClick={() => remove(r.id)} style={ghostBtn(C)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Search preview (what AI sees)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={previewQ}
                onChange={(e) => setPreviewQ(e.target.value)}
                placeholder="e.g. cancellation policy"
                style={{ ...inputStyle(C), flex: 1 }}
              />
              <button type="button" onClick={runPreview} style={primaryBtn(C)}>Search</button>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {previewHits.map((h) => (
                <div key={h.id} style={{ fontSize: 12.5, color: C.text, borderLeft: `3px solid ${C.primary || '#2563EB'}`, paddingLeft: 10 }}>
                  <strong>[{h.category}] {h.title}</strong> · score {h.score}
                  <div style={{ color: C.muted, marginTop: 2 }}>{String(h.body || '').slice(0, 160)}…</div>
                </div>
              ))}
            </div>
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
