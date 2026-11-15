import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const FALLBACK_CATEGORIES = ['behavior', 'booking', 'handoff', 'pricing', 'language', 'hours', 'custom'];

const EMPTY = {
  title: '',
  category: 'custom',
  body: '',
  priority: 50,
  is_active: true,
};

/**
 * Full advanced AI Rules page (English).
 * Owners write mandatory prompt rules that override soft AI defaults for this salon only.
 */
export default function CrmRulesPage() {
  const { C } = usePageTheme();
  const { isMobile } = useBreakpoint();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [categoryMeta, setCategoryMeta] = useState({});
  const [templates, setTemplates] = useState([]);
  const [previewBlock, setPreviewBlock] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCat) params.category = filterCat;
      if (filterActive !== '') params.active = filterActive;
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get('/crm/rules', { params });
      setRows(data.data || []);
      setSummary(data.summary || null);
      setCategories(data.categories?.length ? data.categories : FALLBACK_CATEGORIES);
      setCategoryMeta(data.categoryMeta || {});
      setTemplates(data.templates || []);
      setPreviewBlock(data.previewBlock || '');
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterActive, search]);

  useEffect(() => { load(); }, [load]);

  const catLabel = (c) => categoryMeta[c]?.label || c;
  const catHint = (c) => categoryMeta[c]?.hint || '';

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.id - a.id),
    [rows],
  );

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
    if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyTemplate = (tpl) => {
    setEditId(null);
    setForm({
      title: tpl.title || '',
      category: tpl.category || 'custom',
      body: tpl.body || '',
      priority: tpl.priority ?? 50,
      is_active: true,
    });
    toast.success('Template loaded — review and save');
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and rule text are required');
      return;
    }
    setSaving(true);
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
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule permanently?')) return;
    try {
      await api.delete(`/crm/rules/${id}`);
      toast.success('Deleted');
      if (editId === id) resetForm();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.put(`/crm/rules/${row.id}`, { is_active: !row.is_active });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const duplicate = async (row) => {
    try {
      const { data } = await api.post(`/crm/rules/${row.id}/duplicate`);
      toast.success('Copy created (disabled)');
      startEdit(data);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Duplicate failed');
    }
  };

  const bumpPriority = async (row, delta) => {
    try {
      await api.put(`/crm/rules/${row.id}`, {
        priority: Math.max(0, Math.min(999, (Number(row.priority) || 0) + delta)),
      });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Priority update failed');
    }
  };

  const seedDefaults = async (force = false) => {
    if (force && !window.confirm('Refresh starter rules with latest recommended text? Existing titles will be overwritten.')) {
      return;
    }
    setSeeding(true);
    try {
      const { data } = await api.post('/crm/rules/seed-defaults', force ? { force: true } : {});
      setRows(data.data || []);
      setSummary(data.summary || null);
      setPreviewBlock(data.previewBlock || '');
      if (force) {
        toast.success(`Refreshed ${data.updated || 0} · added ${data.created || 0}`);
      } else {
        toast.success(data.created ? `Added ${data.created} starter rules` : 'Starter rules already present — use Refresh starters to update text');
      }
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(sortedRows.map((r) => r.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const bulkSetActive = async (is_active) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      await api.post('/crm/rules/bulk', { ids, is_active });
      toast.success(is_active ? `Enabled ${ids.length} rules` : `Disabled ${ids.length} rules`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  };

  const refreshPreview = async () => {
    try {
      const { data } = await api.get('/crm/rules/preview');
      setPreviewBlock(data.rulesBlock || '');
      setShowPreview(true);
      toast.success(`${data.count || 0} active rules in prompt`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Preview failed');
    }
  };

  return (
    <PageWrapper
      title="AI Rules"
      subtitle="Mandatory instructions for your WhatsApp AI. Private to this salon. Higher priority wins when rules conflict."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/crm/ai-access" style={{ ...ghostBtn(C), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            AI Access
          </Link>
          <button type="button" onClick={refreshPreview} style={ghostBtn(C)}>Prompt preview</button>
          <button type="button" onClick={() => seedDefaults(false)} disabled={seeding} style={ghostBtn(C)}>
            {seeding ? 'Loading…' : 'Add starters'}
          </button>
          <button type="button" onClick={() => seedDefaults(true)} disabled={seeding} style={ghostBtn(C)}>
            Refresh starters
          </button>
          <button type="button" onClick={load} style={ghostBtn(C)}>Refresh</button>
        </div>
      )}
    >
      {/* Summary strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 10,
        marginBottom: 14,
      }}>
        <StatCard C={C} label="Total rules" value={summary?.total ?? rows.length} />
        <StatCard C={C} label="Active" value={summary?.active ?? '—'} accent="#16A34A" />
        <StatCard C={C} label="Inactive" value={summary?.inactive ?? '—'} />
        <StatCard C={C} label="Categories" value={categories.length} />
      </div>

      <div style={{
        marginBottom: 14, padding: '12px 14px', borderRadius: 12,
        border: `1px solid ${C.border}`, background: C.cardBg, color: C.muted, fontSize: 13, lineHeight: 1.5,
      }}>
        Active rules are injected as a <strong style={{ color: C.text }}>mandatory system block</strong> on every AI reply.
        They override soft defaults and knowledge snippets. Keep them short, specific, and test with Prompt preview.
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(300px, 380px) minmax(0, 1fr)',
        gap: 16,
        alignItems: 'start',
      }}>
        {/* Editor */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: C.text, fontSize: 15 }}>
            {editId ? `Edit rule #${editId}` : 'New rule'}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Write what the AI must always do — or never do — for this salon.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Title" C={C}>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Ask before listing all services"
                maxLength={200}
                style={inputStyle(C)}
              />
            </Field>
            <Field label="Category" hint={catHint(form.category)} C={C}>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={inputStyle(C)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{catLabel(c)}</option>
                ))}
              </select>
            </Field>
            <Field label="Rule text" hint={`${form.body.length}/4000`} C={C}>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value.slice(0, 4000) }))}
                placeholder="Clear instruction the AI must follow on every reply…"
                rows={10}
                style={{ ...inputStyle(C), resize: 'vertical', lineHeight: 1.45, fontFamily: 'inherit' }}
              />
            </Field>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Priority (higher = stronger)" C={C}>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  style={{ ...inputStyle(C), width: 110 }}
                />
              </Field>
              <label style={{
                display: 'flex', gap: 8, alignItems: 'center', color: C.text, fontSize: 13,
                padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active (injected into AI)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={save} disabled={saving} style={primaryBtn(C)}>
                {saving ? 'Saving…' : editId ? 'Update rule' : 'Create rule'}
              </button>
              {editId && (
                <button type="button" onClick={resetForm} style={ghostBtn(C)}>Cancel</button>
              )}
            </div>
          </div>

          {!!templates.length && (
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>Insertable templates</div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {templates.map((t) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    style={{
                      textAlign: 'left', padding: '8px 10px', borderRadius: 10,
                      border: `1px solid ${C.border}`, background: 'transparent',
                      cursor: 'pointer', color: C.text,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {catLabel(t.category)} · P{t.priority}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or text…"
              style={{ ...inputStyle(C), maxWidth: isMobile ? '100%' : 220 }}
            />
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...inputStyle(C), maxWidth: 160 }}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select>
            <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} style={{ ...inputStyle(C), maxWidth: 140 }}>
              <option value="">Active & inactive</option>
              <option value="1">Active only</option>
              <option value="0">Inactive only</option>
            </select>
          </div>

          {selected.size > 0 && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              marginBottom: 12, padding: '8px 10px', borderRadius: 10,
              background: C.inputBg || 'rgba(0,0,0,0.03)', border: `1px solid ${C.border}`,
            }}>
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{selected.size} selected</span>
              <button type="button" disabled={busy} onClick={() => bulkSetActive(true)} style={ghostBtn(C)}>Enable</button>
              <button type="button" disabled={busy} onClick={() => bulkSetActive(false)} style={ghostBtn(C)}>Disable</button>
              <button type="button" onClick={clearSelection} style={ghostBtn(C)}>Clear</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={selectAllVisible} style={ghostBtn(C)}>Select all</button>
            <button type="button" onClick={clearSelection} style={ghostBtn(C)}>Clear selection</button>
          </div>

          {loading && <div style={{ color: C.muted }}>Loading…</div>}
          {!loading && !sortedRows.length && (
            <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>
              No rules yet. Click <strong style={{ color: C.text }}>Add starters</strong> for recommended salon rules, or create your own.
            </div>
          )}

          <div style={{ display: 'grid', gap: 8, maxHeight: isMobile ? 'none' : 640, overflowY: 'auto' }}>
            {sortedRows.map((r) => {
              const on = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  style={{
                    border: `1px solid ${editId === r.id ? (C.primary || '#2563EB') : C.border}`,
                    borderRadius: 12,
                    padding: 12,
                    opacity: r.is_active ? 1 : 0.62,
                    background: editId === r.id ? (C.inputBg || 'transparent') : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSelect(r.id)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, fontWeight: 700, color: C.text, fontSize: 13.5 }}>{r.title}</div>
                        <Badge C={C}>{catLabel(r.category)}</Badge>
                        <Badge C={C}>P{r.priority}</Badge>
                        <Badge C={C} tone={r.is_active ? 'ok' : 'muted'}>
                          {r.is_active ? 'Active' : 'Off'}
                        </Badge>
                      </div>
                      <div style={{
                        fontSize: 12.5, color: C.muted, marginTop: 6,
                        whiteSpace: 'pre-wrap', lineHeight: 1.45,
                      }}>
                        {String(r.body || '')}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => startEdit(r)} style={ghostBtn(C)}>Edit</button>
                        <button type="button" onClick={() => toggleActive(r)} style={ghostBtn(C)}>
                          {r.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" onClick={() => duplicate(r)} style={ghostBtn(C)}>Duplicate</button>
                        <button type="button" onClick={() => bumpPriority(r, 10)} style={ghostBtn(C)}>Priority +</button>
                        <button type="button" onClick={() => bumpPriority(r, -10)} style={ghostBtn(C)}>Priority −</button>
                        <button type="button" onClick={() => remove(r.id)} style={ghostBtn(C)}>Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {summary?.byCategory && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: C.text, marginBottom: 8 }}>By category</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {categories.map((c) => {
                  const s = summary.byCategory[c] || { total: 0, active: 0 };
                  if (!s.total) return null;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFilterCat(c)}
                      style={{ ...ghostBtn(C), fontSize: 11.5 }}
                    >
                      {catLabel(c)} · {s.active}/{s.total}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prompt preview panel */}
      {showPreview && (
        <div style={{
          marginTop: 16, background: C.cardBg, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, color: C.text }}>Prompt injection preview</div>
              <div style={{ fontSize: 12, color: C.muted }}>Exact block sent to the model with every reply</div>
            </div>
            <button type="button" onClick={() => setShowPreview(false)} style={ghostBtn(C)}>Close</button>
          </div>
          <pre style={{
            margin: 0, padding: 14, borderRadius: 10, overflow: 'auto', maxHeight: 360,
            background: C.inputBg || 'rgba(0,0,0,0.04)', color: C.text,
            fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}>
            {previewBlock || '(No active rules — nothing injected)'}
          </pre>
        </div>
      )}
    </PageWrapper>
  );
}

function StatCard({ C, label, value, accent }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.cardBg,
    }}>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Field({ label, hint, C, children }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>
        {label}
        {hint ? <span style={{ fontWeight: 400, marginLeft: 6 }}>· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Badge({ C, children, tone }) {
  const color = tone === 'ok' ? '#16A34A' : C.muted;
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, color,
      textTransform: 'uppercase', letterSpacing: 0.3,
      padding: '2px 7px', borderRadius: 6,
      border: `1px solid ${tone === 'ok' ? 'rgba(22,163,74,0.35)' : C.border}`,
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
