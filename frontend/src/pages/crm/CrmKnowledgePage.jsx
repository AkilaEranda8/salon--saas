import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';

const CATEGORIES = ['faq', 'policy', 'promo', 'service', 'script', 'hours', 'payment', 'other'];
const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'Sinhala' },
  { value: 'en-si', label: 'EN + SI' },
];

const EMPTY = {
  title: '',
  category: 'faq',
  body: '',
  tags: '',
  locale: 'en',
  priority: 50,
  is_active: true,
};

const IMPORT_HINT = `Title: Opening hours
Body: We open Mon–Sat 9am–7pm. Sundays by appointment.

---

Title: Cancellation policy
Body: Cancel at least 2 hours before your appointment.`;

export default function CrmKnowledgePage() {
  const { C } = usePageTheme();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterLocale, setFilterLocale] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [listQ, setListQ] = useState('');
  const [previewQ, setPreviewQ] = useState('');
  const [previewHits, setPreviewHits] = useState([]);
  const [previewBlock, setPreviewBlock] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat) params.category = filterCat;
      if (filterLocale) params.locale = filterLocale;
      if (filterActive) params.active = filterActive;
      if (listQ.trim()) params.q = listQ.trim();
      const { data } = await api.get('/crm/knowledge', { params });
      setRows(data.data || []);
      setStats(data.stats || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterLocale, filterActive, listQ]);

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
      priority: row.priority ?? 50,
      is_active: row.is_active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    setBusy(true);
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
    } finally {
      setBusy(false);
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

  const toggleActive = async (row) => {
    try {
      await api.put(`/crm/knowledge/${row.id}`, { is_active: !row.is_active });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const duplicate = async (id) => {
    try {
      const { data } = await api.post(`/crm/knowledge/${id}/duplicate`);
      toast.success('Duplicated (inactive copy)');
      startEdit(data);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Duplicate failed');
    }
  };

  const seedDefaults = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/seed-defaults');
      setRows(data.data || []);
      setStats(data.stats || null);
      toast.success(data.created ? `Added ${data.created} starter articles` : 'Starter articles already present');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!importText.trim()) {
      toast.error('Paste articles to import');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/bulk-import', { text: importText });
      toast.success(`Imported ${data.created} articles`);
      setImportText('');
      setShowImport(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!previewQ.trim()) {
      toast.error('Enter a customer question');
      return;
    }
    try {
      const { data } = await api.get('/crm/knowledge/search', {
        params: { q: previewQ, limit: 6, category: filterCat || undefined, locale: filterLocale || undefined },
      });
      setPreviewHits(data.hits || []);
      setPreviewBlock(data.prompt_block || '');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed');
    }
  };

  const catCounts = useMemo(() => stats?.by_category || {}, [stats]);

  return (
    <PageWrapper
      title="AI Knowledge Base"
      subtitle="Advanced FAQs, policies, and scripts — searched by WhatsApp AI for this salon only."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={seedDefaults} disabled={busy} style={ghostBtn(C)}>Add starter pack</button>
          <button type="button" onClick={() => setShowImport((v) => !v)} style={ghostBtn(C)}>
            {showImport ? 'Hide import' : 'Bulk import'}
          </button>
          <button type="button" onClick={load} style={ghostBtn(C)}>Refresh</button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Stat C={C} label="Total" value={stats?.total ?? '—'} />
          <Stat C={C} label="Active" value={stats?.active ?? '—'} />
          <Stat C={C} label="Inactive" value={stats?.inactive ?? '—'} />
          {CATEGORIES.filter((c) => catCounts[c]).slice(0, 4).map((c) => (
            <Stat key={c} C={C} label={c} value={catCounts[c]} />
          ))}
        </div>

        {showImport && (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: C.text }}>Bulk import</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
              Separate articles with <code>---</code>. Use <code>Title:</code> / <code>Body:</code> lines (or first line = title).
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={IMPORT_HINT}
              rows={8}
              style={{ ...inputStyle(C), resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={runImport} disabled={busy} style={primaryBtn(C)}>Import</button>
              <button type="button" onClick={() => setImportText(IMPORT_HINT)} style={ghostBtn(C)}>Load example</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(300px, 1.1fr)', gap: 16 }}>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, color: C.text }}>
              {editId ? `Edit article #${editId}` : 'New article'}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Title (what customers ask about)"
                style={inputStyle(C)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  style={inputStyle(C)}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={form.locale}
                  onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
                  style={inputStyle(C)}
                >
                  {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Answer the AI should use (EN and/or Sinhala)…"
                rows={10}
                style={{ ...inputStyle(C), resize: 'vertical' }}
              />
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="Tags / keywords (cancel, price, book…)"
                style={inputStyle(C)}
              />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
                  Active for AI
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={save} disabled={busy} style={primaryBtn(C)}>
                  {editId ? 'Update' : 'Create'}
                </button>
                {editId && <button type="button" onClick={resetForm} style={ghostBtn(C)}>Cancel</button>}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <input
                  value={listQ}
                  onChange={(e) => setListQ(e.target.value)}
                  placeholder="Filter articles…"
                  style={inputStyle(C)}
                />
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={inputStyle(C)}>
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterLocale} onChange={(e) => setFilterLocale(e.target.value)} style={inputStyle(C)}>
                  <option value="">All locales</option>
                  {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} style={inputStyle(C)}>
                  <option value="">Active + inactive</option>
                  <option value="1">Active only</option>
                  <option value="0">Inactive only</option>
                </select>
              </div>
              {loading && <div style={{ color: C.muted }}>Loading…</div>}
              {!loading && !rows.length && (
                <div style={{ color: C.muted, fontSize: 13.5 }}>
                  No articles yet. Click <strong>Add starter pack</strong> or create your own.
                </div>
              )}
              <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
                      opacity: r.is_active ? 1 : 0.65,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, fontWeight: 700, color: C.text, fontSize: 13 }}>{r.title}</div>
                      <Badge C={C}>{r.category}</Badge>
                      <Badge C={C}>{r.locale || 'en'}</Badge>
                      <Badge C={C}>P{r.priority}</Badge>
                      {!r.is_active && <Badge C={C} danger>off</Badge>}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>
                      {String(r.body || '').slice(0, 140)}{String(r.body || '').length > 140 ? '…' : ''}
                    </div>
                    {Array.isArray(r.tags) && r.tags.length > 0 && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        tags: {r.tags.join(', ')}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => startEdit(r)} style={ghostBtn(C)}>Edit</button>
                      <button type="button" onClick={() => toggleActive(r)} style={ghostBtn(C)}>
                        {r.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" onClick={() => duplicate(r.id)} style={ghostBtn(C)}>Duplicate</button>
                      <button type="button" onClick={() => remove(r.id)} style={ghostBtn(C)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: C.text }}>AI search preview</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
                Type a customer question to see which articles WhatsApp AI will load (phrase + synonym scoring).
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={previewQ}
                  onChange={(e) => setPreviewQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runPreview(); }}
                  placeholder="e.g. cancellation policy / මිල කීයද"
                  style={{ ...inputStyle(C), flex: 1 }}
                />
                <button type="button" onClick={runPreview} style={primaryBtn(C)}>Search</button>
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {!previewHits.length && (
                  <div style={{ color: C.muted, fontSize: 12.5 }}>No hits yet — try a question.</div>
                )}
                {previewHits.map((h) => (
                  <div key={h.id} style={{ fontSize: 12.5, color: C.text, borderLeft: `3px solid ${C.primary || '#2563EB'}`, paddingLeft: 10 }}>
                    <strong>[{h.category}] {h.title}</strong>
                    <span style={{ color: C.muted }}> · score {h.score}</span>
                    <div style={{ color: C.muted, marginTop: 2 }}>{String(h.body || '').slice(0, 180)}…</div>
                  </div>
                ))}
              </div>
              {previewBlock && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', color: C.muted, fontSize: 12.5 }}>Prompt block sent to AI</summary>
                  <pre style={{
                    marginTop: 8, padding: 10, borderRadius: 8, background: C.inputBg || '#f8fafc',
                    border: `1px solid ${C.border}`, whiteSpace: 'pre-wrap', fontSize: 11.5, color: C.text,
                  }}>
                    {previewBlock}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

function Stat({ C, label, value }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.label }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Badge({ C, children, danger }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
      padding: '2px 7px', borderRadius: 999,
      background: danger ? 'rgba(220,38,38,0.1)' : `${C.primary || '#2563EB'}18`,
      color: danger ? '#DC2626' : (C.primary || '#2563EB'),
    }}>
      {children}
    </span>
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
