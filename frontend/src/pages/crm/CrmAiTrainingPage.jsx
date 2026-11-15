import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useFeatureGate } from '../../hooks/useFeatureGate';

/**
 * Full advanced AI Training page (English).
 * Teach Q&A answers, manage behaviour shortcuts, test retrieval.
 */

const TABS = [
  { id: 'teach', label: 'Teach answers' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'test', label: 'Test training' },
];

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'Sinhala' },
  { value: 'en-si', label: 'EN + SI' },
  { value: 'ta', label: 'Tamil' },
];

const CATEGORIES = ['faq', 'policy', 'promo', 'service', 'script', 'hours', 'payment', 'other'];
const RULE_CATS = ['behavior', 'booking', 'handoff', 'pricing', 'language', 'hours', 'custom'];

const SAMPLE_TESTS = [
  'What time do you open?',
  'Do you have bridal packages?',
  'How do I book an appointment?',
  'Can I cancel or reschedule?',
  'වෙන්කරන්න කොහොමද?',
  'Do you accept card payment?',
];

const IMPORT_HINT = `Q: What are your opening hours?
A: We open Mon–Sat 9am–7pm. Sundays by appointment.

---

Q: Do you do bridal packages?
A: Yes — ask for bridal and we will share current packages.`;

const EMPTY_LESSON = {
  question: '',
  answer: '',
  locale: 'en',
  category: 'faq',
  tags: 'training',
  priority: 60,
  is_active: true,
};

export default function CrmAiTrainingPage() {
  const { C } = usePageTheme();
  const { isMobile } = useBreakpoint();
  const { allowed: kbAllowed } = useFeatureGate('ai_knowledge_base');

  const [tab, setTab] = useState('teach');
  const [lessons, setLessons] = useState([]);
  const [stats, setStats] = useState(null);
  const [rules, setRules] = useState([]);
  const [rulesSummary, setRulesSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(EMPTY_LESSON);
  const [editLessonId, setEditLessonId] = useState(null);

  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleBody, setRuleBody] = useState('');
  const [ruleCat, setRuleCat] = useState('behavior');
  const [editRuleId, setEditRuleId] = useState(null);

  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [googleQuery, setGoogleQuery] = useState('');

  const [filterQ, setFilterQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterLocale, setFilterLocale] = useState('');
  const [filterActive, setFilterActive] = useState('1');
  const [selected, setSelected] = useState(() => new Set());

  const [testQ, setTestQ] = useState('');
  const [testHits, setTestHits] = useState([]);
  const [testBlock, setTestBlock] = useState('');
  const [rulesPreview, setRulesPreview] = useState('');

  const [waOk, setWaOk] = useState(false);
  const [keyOk, setKeyOk] = useState(false);
  const [accessReady, setAccessReady] = useState(false);

  const loadLessons = useCallback(async () => {
    if (!kbAllowed) {
      setLessons([]);
      setStats(null);
      return;
    }
    try {
      const params = {};
      if (filterActive !== '') params.active = filterActive;
      if (filterCat) params.category = filterCat;
      if (filterLocale) params.locale = filterLocale;
      if (filterQ.trim()) params.q = filterQ.trim();
      const { data } = await api.get('/crm/knowledge', { params });
      setLessons(data.data || []);
      setStats(data.stats || null);
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load training answers');
    }
  }, [kbAllowed, filterActive, filterCat, filterLocale, filterQ]);

  const loadRules = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/rules');
      setRules(data.data || []);
      setRulesSummary(data.summary || null);
      setRulesPreview(data.previewBlock || '');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load behaviour rules');
    }
  }, []);

  const loadExtras = useCallback(async () => {
    try {
      const [waRes, aiRes, accessRes] = await Promise.all([
        api.get('/notifications/whatsapp/status').catch(() => ({ data: {} })),
        api.get('/crm/ai-settings').catch(() => ({ data: null })),
        api.get('/crm/ai-access').catch(() => ({ data: null })),
      ]);
      setWaOk(waRes.data?.status === 'connected');
      const ai = aiRes.data;
      setKeyOk(ai
        ? (ai.provider === 'gemini'
          ? !!ai.gemini_api_key_set
          : ai.provider === 'openai'
            ? !!ai.openai_api_key_set
            : true)
        : false);
      setAccessReady(!!accessRes.data?.ready);
    } catch { /* silent */ }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadLessons(), loadRules(), loadExtras()]);
    setLoading(false);
  }, [loadLessons, loadRules, loadExtras]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!kbAllowed && tab === 'teach') setTab('behaviour');
  }, [kbAllowed, tab]);

  const activeRules = useMemo(
    () => rules.filter((r) => r.is_active !== false).length,
    [rules],
  );
  const activeLessons = stats?.active ?? lessons.filter((r) => r.is_active !== false).length;

  const readiness = useMemo(() => {
    if (!kbAllowed) return { label: 'Knowledge Base feature off — enable on plan', tone: 'warn' };
    if (activeLessons < 1) return { label: 'Add training answers so AI knows your salon', tone: 'warn' };
    if (activeRules < 1) return { label: 'Answers OK — add behaviour rules next', tone: 'warn' };
    if (!accessReady || !waOk || !keyOk) {
      return { label: 'Training OK — finish Access / WhatsApp / AI key', tone: 'warn' };
    }
    return { label: 'Training ready for live WhatsApp AI', tone: 'ok' };
  }, [kbAllowed, activeLessons, activeRules, accessReady, waOk, keyOk]);

  const resetLessonForm = () => {
    setForm(EMPTY_LESSON);
    setEditLessonId(null);
  };

  const saveLesson = async () => {
    if (!kbAllowed) {
      toast.error('Knowledge Base feature is not enabled for this salon');
      return;
    }
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error('Customer question and AI answer are required');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.question.trim(),
        body: form.answer.trim(),
        category: form.category || 'faq',
        locale: form.locale,
        priority: Number(form.priority) || 60,
        is_active: form.is_active !== false,
        tags: form.tags,
      };
      if (editLessonId) {
        await api.put(`/crm/knowledge/${editLessonId}`, payload);
        toast.success('Training answer updated');
      } else {
        await api.post('/crm/knowledge', payload);
        toast.success('AI trained with this answer');
      }
      resetLessonForm();
      await loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const editLesson = (row) => {
    setEditLessonId(row.id);
    setForm({
      question: row.title || '',
      answer: row.body || '',
      locale: row.locale || 'en',
      category: row.category || 'faq',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : (row.tags || 'training'),
      priority: row.priority ?? 60,
      is_active: row.is_active !== false,
    });
    setTab('teach');
    if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeLesson = async (id) => {
    if (!window.confirm('Remove this training answer?')) return;
    try {
      await api.delete(`/crm/knowledge/${id}`);
      toast.success('Removed');
      if (editLessonId === id) resetLessonForm();
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const toggleLesson = async (row) => {
    try {
      await api.put(`/crm/knowledge/${row.id}`, { is_active: !row.is_active });
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const duplicateLesson = async (row) => {
    try {
      const { data } = await api.post(`/crm/knowledge/${row.id}/duplicate`);
      toast.success('Copy created (inactive)');
      editLesson(data);
      await loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Duplicate failed');
    }
  };

  const seedLessons = async (force = false) => {
    if (force && !window.confirm('Refresh starter answers with latest recommended text? Matching titles will be overwritten.')) {
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/seed-defaults', force ? { force: true } : {});
      if (force) toast.success(`Refreshed ${data.updated || 0} · added ${data.created || 0}`);
      else toast.success(`Starter pack ready (${data.created ?? 0} new)`);
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  const autoTrainFromSalon = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/auto-train');
      const n = (data?.results || []).filter((r) => r.action === 'created' || r.action === 'updated').length;
      toast.success(data?.message || `Auto-trained Gemini from salon data (${n} lessons)`);
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Auto-train failed');
    } finally {
      setBusy(false);
    }
  };

  const trainFromGoogle = async () => {
    const q = googleQuery.trim();
    if (q.length < 3) {
      toast.error('Type a topic to search on Google (min 3 characters)');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/train-from-google', { query: q, save: true });
      toast.success(data?.message || 'Trained from Google Search');
      setGoogleQuery('');
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Google train failed');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!importText.trim()) {
      toast.error('Paste Q&A text first');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/bulk-import', { text: importText });
      toast.success(`Imported ${data.created ?? data.count ?? 0} answers`);
      setImportText('');
      setShowImport(false);
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setBusy(false);
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

  const bulkLessons = async (is_active) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/bulk', { ids, is_active });
      toast.success(`${is_active ? 'Enabled' : 'Disabled'} ${data.updated || ids.length}`);
      await loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  };

  const resetRuleForm = () => {
    setRuleTitle('');
    setRuleBody('');
    setRuleCat('behavior');
    setEditRuleId(null);
  };

  const saveRule = async () => {
    if (!ruleTitle.trim() || !ruleBody.trim()) {
      toast.error('Title and rule text required');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: ruleTitle.trim(),
        body: ruleBody.trim(),
        category: ruleCat,
        priority: 55,
        is_active: true,
      };
      if (editRuleId) {
        await api.put(`/crm/rules/${editRuleId}`, payload);
        toast.success('Behaviour rule updated');
      } else {
        await api.post('/crm/rules', payload);
        toast.success('Behaviour rule added');
      }
      resetRuleForm();
      await loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const editRule = (row) => {
    setEditRuleId(row.id);
    setRuleTitle(row.title || '');
    setRuleBody(row.body || '');
    setRuleCat(row.category || 'behavior');
    setTab('behaviour');
  };

  const removeRule = async (id) => {
    if (!window.confirm('Delete this behaviour rule?')) return;
    try {
      await api.delete(`/crm/rules/${id}`);
      toast.success('Deleted');
      if (editRuleId === id) resetRuleForm();
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const toggleRule = async (row) => {
    try {
      await api.put(`/crm/rules/${row.id}`, { is_active: !row.is_active });
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const seedRules = async (force = false) => {
    setBusy(true);
    try {
      const { data } = await api.post('/crm/rules/seed-defaults', force ? { force: true } : {});
      toast.success(force
        ? `Rules refreshed (${data.updated || 0} updated, ${data.created || 0} new)`
        : `Starter rules ready (${data.created ?? 0} new)`);
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (qOverride) => {
    if (!kbAllowed) {
      toast.error('Enable Knowledge Base to test answer retrieval');
      return;
    }
    const q = (qOverride || testQ).trim();
    if (!q) {
      toast.error('Type a customer question');
      return;
    }
    setTestQ(q);
    setBusy(true);
    try {
      const [searchRes, previewRes] = await Promise.all([
        api.get('/crm/knowledge/search', { params: { q, limit: 6 } }),
        api.get('/crm/rules/preview').catch(() => ({ data: {} })),
      ]);
      const data = searchRes.data || {};
      setTestHits(data.hits || data.data || []);
      setTestBlock(data.prompt_block || data.promptBlock || '');
      setRulesPreview(previewRes.data?.rulesBlock || rulesPreview || '');
      if (!(data.hits || data.data || []).length) {
        toast('No matching training answers yet — add a Q&A in Teach answers');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageWrapper
      title="AI Training"
      subtitle="Teach WhatsApp AI your salon answers and behaviour. Training is private to this salon only."
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/crm/rules" style={linkBtn(C)}>AI Rules</Link>
          <Link to="/crm/knowledge" style={linkBtn(C)}>Knowledge Base</Link>
          <Link to="/crm/access" style={linkBtn(C)}>AI Access</Link>
          <button type="button" onClick={loadAll} style={ghostBtn(C)}>Refresh</button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: isMobile ? 14 : 18, width: '100%' }}>
        {/* Hero */}
        <section style={{
          borderRadius: 18, padding: isMobile ? 16 : 22,
          border: `1px solid ${C.border}`,
          background: C.isDark
            ? 'linear-gradient(135deg, #1e1b4b 0%, #0F172A 55%, #1E293B 100%)'
            : 'linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 45%, #ECFDF5 100%)',
          boxShadow: C.shadow,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.45fr 1fr', gap: 16 }}>
            <div>
              <div style={kicker(C)}>Salon AI coach</div>
              <h2 style={{
                margin: '6px 0 0', fontSize: isMobile ? 22 : 26, fontWeight: 800,
                color: C.text, letterSpacing: '-0.02em',
              }}>
                Train answers customers hear on WhatsApp
              </h2>
              <p style={{ margin: '10px 0 0', color: C.muted, fontSize: 14, lineHeight: 1.55, maxWidth: 640 }}>
                Add Q&A lessons for FAQs and policies. Behaviour rules stay mandatory and win when they conflict.
                Use Test to see what the model would pull into a reply.
              </p>
            </div>
            <div style={{
              background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14,
              display: 'grid', gap: 8,
            }}>
              <Meter label="Trained answers" value={kbAllowed ? activeLessons : 'Feature off'} ok={kbAllowed && activeLessons > 0} C={C} />
              <Meter label="Behaviour rules" value={activeRules} ok={activeRules > 0} C={C} />
              <Meter label="AI Access" value={accessReady ? 'Ready' : 'Needs ticks'} ok={accessReady} C={C} />
              <Meter label="WhatsApp + AI key" value={waOk && keyOk ? 'Connected' : 'Check setup'} ok={waOk && keyOk} C={C} />
              <div style={{
                marginTop: 4, padding: '8px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                background: readiness.tone === 'ok' ? '#DCFCE7' : '#FEF3C7',
                color: readiness.tone === 'ok' ? '#166534' : '#92400E',
              }}>
                {readiness.label}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 10,
        }}>
          <Stat C={C} label="Total lessons" value={stats?.total ?? lessons.length} />
          <Stat C={C} label="Active lessons" value={activeLessons} accent="#16A34A" />
          <Stat C={C} label="Inactive" value={stats?.inactive ?? '—'} />
          <Stat C={C} label="Active rules" value={activeRules} />
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
          borderBottom: `1px solid ${C.border}`, paddingBottom: 10,
        }}>
          {TABS.map((t) => {
            const disabled = (t.id === 'teach' || t.id === 'test') && !kbAllowed;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => setTab(t.id)}
                style={{
                  ...ghostBtn(C),
                  opacity: disabled ? 0.45 : 1,
                  background: on ? (C.primary || '#2563EB') : 'transparent',
                  color: on ? '#fff' : C.text,
                  border: on ? 'none' : `1px solid ${C.border}`,
                }}
                title={disabled ? 'Requires Knowledge Base on your plan' : undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {!kbAllowed && (tab === 'teach' || tab === 'test') && (
          <div style={{
            padding: 14, borderRadius: 12, background: '#FEF3C7', color: '#92400E',
            fontSize: 13.5, fontWeight: 600, lineHeight: 1.45,
          }}>
            Knowledge Base is not enabled on this salon plan. Behaviour rules still work — open the Behaviour tab or enable Knowledge Base to teach answers.
          </div>
        )}

        {/* TEACH */}
        {tab === 'teach' && kbAllowed && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(300px, 400px) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}>
            <section style={{ ...shell(C), padding: 16 }}>
              <div style={kicker(C)}>01 · Teach</div>
              <div style={{ fontWeight: 800, margin: '4px 0 6px', color: C.text, fontSize: 16 }}>
                {editLessonId ? `Edit answer #${editLessonId}` : 'Teach a new answer'}
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                When a customer asks something similar, WhatsApp AI pulls this into the reply.
              </p>

              <Field label="Customer asks" C={C}>
                <input
                  value={form.question}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                  placeholder="e.g. What time do you open?"
                  style={fieldStyle(C)}
                />
              </Field>
              <Field label="AI should answer" C={C}>
                <textarea
                  value={form.answer}
                  onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                  placeholder="Write the reply you want the AI to give…"
                  rows={7}
                  style={{ ...fieldStyle(C), resize: 'vertical', lineHeight: 1.45 }}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Language" C={C}>
                  <select value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))} style={fieldStyle(C)}>
                    {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </Field>
                <Field label="Category" C={C}>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={fieldStyle(C)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                <Field label="Priority" C={C}>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    style={fieldStyle(C)}
                  />
                </Field>
                <Field label="Tags" C={C}>
                  <input
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="training, bridal"
                    style={fieldStyle(C)}
                  />
                </Field>
              </div>

              <label style={{
                display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0',
                color: C.text, fontSize: 13, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active (used in WhatsApp replies)
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={busy} onClick={saveLesson} style={primaryBtn(C, busy)}>
                  {editLessonId ? 'Update answer' : 'Train AI'}
                </button>
                {editLessonId && (
                  <button type="button" onClick={resetLessonForm} style={ghostBtn(C)}>Cancel</button>
                )}
              </div>

              <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={busy} onClick={autoTrainFromSalon} style={primaryBtn(C, busy)}>
                  Auto-train Gemini from salon data
                </button>
                <button type="button" disabled={busy} onClick={() => seedLessons(false)} style={ghostBtn(C)}>Add starter pack</button>
                <button type="button" disabled={busy} onClick={() => seedLessons(true)} style={ghostBtn(C)}>Refresh starters</button>
                <button type="button" onClick={() => setShowImport((v) => !v)} style={ghostBtn(C)}>
                  {showImport ? 'Hide import' : 'Bulk import Q&A'}
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
                Auto-train pulls live services, prices, staff hours, and branches into Gemini training.
                Service edits also re-train automatically.
              </p>

              <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                  Train from Google Search
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
                  Gemini searches Google and saves a training tip. Salon prices still come from your salon data — not Google.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={googleQuery}
                    onChange={(e) => setGoogleQuery(e.target.value)}
                    placeholder="e.g. keratin aftercare tips, bridal hair trends Sri Lanka"
                    style={{ ...fieldStyle(C), flex: '1 1 220px' }}
                  />
                  <button type="button" disabled={busy} onClick={trainFromGoogle} style={primaryBtn(C, busy)}>
                    Search &amp; train
                  </button>
                </div>
              </div>

              {showImport && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={IMPORT_HINT}
                    rows={8}
                    style={{ ...fieldStyle(C), fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                  />
                  <button type="button" disabled={busy} onClick={runImport} style={{ ...primaryBtn(C, busy), marginTop: 8 }}>
                    Import
                  </button>
                </div>
              )}
            </section>

            <section style={shell(C)}>
              <div style={{
                padding: '12px 14px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              }}>
                <input
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadLessons(); }}
                  placeholder="Search lessons…"
                  style={{ ...fieldStyle(C), maxWidth: isMobile ? '100%' : 200 }}
                />
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...fieldStyle(C), maxWidth: 130 }}>
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterLocale} onChange={(e) => setFilterLocale(e.target.value)} style={{ ...fieldStyle(C), maxWidth: 120 }}>
                  <option value="">All languages</option>
                  {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} style={{ ...fieldStyle(C), maxWidth: 130 }}>
                  <option value="">Active & inactive</option>
                  <option value="1">Active only</option>
                  <option value="0">Inactive only</option>
                </select>
                <button type="button" onClick={loadLessons} style={ghostBtn(C)}>Apply</button>
              </div>

              {selected.size > 0 && (
                <div style={{
                  padding: '8px 14px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                  background: C.inputBg || 'rgba(0,0,0,0.02)',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: C.text }}>{selected.size} selected</span>
                  <button type="button" disabled={busy} onClick={() => bulkLessons(true)} style={ghostBtn(C)}>Enable</button>
                  <button type="button" disabled={busy} onClick={() => bulkLessons(false)} style={ghostBtn(C)}>Disable</button>
                  <button type="button" onClick={() => setSelected(new Set())} style={ghostBtn(C)}>Clear</button>
                </div>
              )}

              <div style={{
                padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
                fontWeight: 800, color: C.text, display: 'flex', justifyContent: 'space-between',
              }}>
                <span>Trained answers ({lessons.length})</span>
                <button type="button" onClick={() => setSelected(new Set(lessons.map((l) => l.id)))} style={{ ...ghostBtn(C), padding: '4px 8px', fontSize: 11 }}>
                  Select all
                </button>
              </div>

              <div style={{ maxHeight: isMobile ? 'none' : 620, overflowY: 'auto' }}>
                {loading && <div style={{ padding: 20, color: C.muted }}>Loading…</div>}
                {!loading && !lessons.length && (
                  <div style={{ padding: 20, color: C.muted, lineHeight: 1.5 }}>
                    No answers yet. Teach one on the left, or click <strong style={{ color: C.text }}>Add starter pack</strong>.
                  </div>
                )}
                {lessons.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      padding: '12px 14px',
                      borderBottom: `1px solid ${C.border}`,
                      opacity: row.is_active === false ? 0.6 : 1,
                      background: editLessonId === row.id ? (C.inputBg || 'transparent') : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700, color: C.text, fontSize: 14, flex: 1 }}>{row.title}</div>
                          <Badge C={C}>{row.category}</Badge>
                          <Badge C={C}>{(row.locale || 'en').toUpperCase()}</Badge>
                          <Badge C={C} tone={row.is_active !== false ? 'ok' : 'muted'}>
                            {row.is_active !== false ? 'Active' : 'Off'}
                          </Badge>
                        </div>
                        <div style={{
                          fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {row.body}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => editLesson(row)} style={ghostBtn(C)}>Edit</button>
                          <button type="button" onClick={() => toggleLesson(row)} style={ghostBtn(C)}>
                            {row.is_active !== false ? 'Disable' : 'Enable'}
                          </button>
                          <button type="button" onClick={() => duplicateLesson(row)} style={ghostBtn(C)}>Duplicate</button>
                          <button type="button" onClick={() => removeLesson(row.id)} style={dangerBtn(C)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {stats?.by_category && (
                <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(stats.by_category).map(([cat, n]) => (
                    <button key={cat} type="button" onClick={() => setFilterCat(cat)} style={{ ...ghostBtn(C), fontSize: 11 }}>
                      {cat} · {n}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* BEHAVIOUR */}
        {tab === 'behaviour' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(300px, 400px) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}>
            <section style={{ ...shell(C), padding: 16 }}>
              <div style={kicker(C)}>02 · Behaviour</div>
              <div style={{ fontWeight: 800, margin: '4px 0 6px', color: C.text, fontSize: 16 }}>
                {editRuleId ? `Edit rule #${editRuleId}` : 'Quick behaviour rule'}
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                Rules are mandatory and override trained answers when they conflict.
                For the full editor, open <Link to="/crm/rules" style={{ color: C.primary || '#2563EB', fontWeight: 700 }}>AI Rules</Link>.
              </p>

              <Field label="Rule title" C={C}>
                <input
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder="e.g. Always reply in Sinhala first"
                  style={fieldStyle(C)}
                />
              </Field>
              <Field label="Category" C={C}>
                <select value={ruleCat} onChange={(e) => setRuleCat(e.target.value)} style={fieldStyle(C)}>
                  {RULE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="What the AI must do" C={C}>
                <textarea
                  value={ruleBody}
                  onChange={(e) => setRuleBody(e.target.value)}
                  placeholder="Write a clear instruction the AI must always follow…"
                  rows={6}
                  style={{ ...fieldStyle(C), resize: 'vertical' }}
                />
              </Field>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" disabled={busy} onClick={saveRule} style={primaryBtn(C, busy)}>
                  {editRuleId ? 'Update rule' : 'Save rule'}
                </button>
                {editRuleId && <button type="button" onClick={resetRuleForm} style={ghostBtn(C)}>Cancel</button>}
                <button type="button" disabled={busy} onClick={() => seedRules(false)} style={ghostBtn(C)}>Add starters</button>
                <button type="button" disabled={busy} onClick={() => seedRules(true)} style={ghostBtn(C)}>Refresh starters</button>
              </div>
            </section>

            <section style={shell(C)}>
              <div style={{
                padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: C.text }}>Rules ({rules.length})</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>
                    Active {rulesSummary?.active ?? activeRules} · Inactive {rulesSummary?.inactive ?? '—'}
                  </div>
                </div>
                <Link to="/crm/rules" style={linkBtn(C)}>Full AI Rules →</Link>
              </div>
              <div style={{ maxHeight: isMobile ? 'none' : 560, overflowY: 'auto' }}>
                {loading && <div style={{ padding: 20, color: C.muted }}>Loading…</div>}
                {!loading && !rules.length && (
                  <div style={{ padding: 20, color: C.muted }}>No rules yet. Add one on the left or use starters.</div>
                )}
                {rules.map((row) => (
                  <div key={row.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, opacity: row.is_active === false ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, color: C.text, flex: 1 }}>{row.title}</div>
                      <Badge C={C}>{row.category}</Badge>
                      <Badge C={C}>P{row.priority}</Badge>
                      <Badge C={C} tone={row.is_active !== false ? 'ok' : 'muted'}>
                        {row.is_active !== false ? 'Active' : 'Off'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{row.body}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => editRule(row)} style={ghostBtn(C)}>Edit</button>
                      <button type="button" onClick={() => toggleRule(row)} style={ghostBtn(C)}>
                        {row.is_active !== false ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" onClick={() => removeRule(row.id)} style={dangerBtn(C)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TEST */}
        {tab === 'test' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ ...shell(C), padding: isMobile ? 16 : 20 }}>
              <div style={kicker(C)}>03 · Test</div>
              <div style={{ fontWeight: 800, margin: '4px 0 6px', color: C.text, fontSize: 17 }}>
                Test what the AI will use
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                Type a customer question. We show matched training answers and the mandatory rules block.
              </p>

              {!kbAllowed && (
                <div style={{
                  marginBottom: 12, padding: 12, borderRadius: 10,
                  background: '#F59E0B18', color: '#B45309', fontSize: 13, fontWeight: 600,
                }}>
                  Knowledge Base is not enabled — enable it to test answer retrieval. Behaviour rules still apply on live chats.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={testQ}
                  onChange={(e) => setTestQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }}
                  placeholder="e.g. Do you have bridal packages?"
                  style={{ ...fieldStyle(C), flex: 1, minWidth: 220 }}
                />
                <button type="button" disabled={busy || !kbAllowed} onClick={() => runTest()} style={primaryBtn(C, busy)}>
                  Test
                </button>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SAMPLE_TESTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={!kbAllowed || busy}
                    onClick={() => runTest(q)}
                    style={{ ...ghostBtn(C), fontSize: 12 }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <section style={shell(C)}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 800, color: C.text }}>
                  Matched training ({testHits.length})
                </div>
                <div style={{ padding: 14 }}>
                  {!testHits.length && (
                    <div style={{ color: C.muted, fontSize: 13.5 }}>Run a test to see which answers would be used.</div>
                  )}
                  {testHits.map((h, i) => (
                    <div key={h.id || i} style={{
                      padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.text, flex: 1 }}>{h.title || h.question}</div>
                        {h.score != null && <Badge C={C}>score {Number(h.score).toFixed?.(2) || h.score}</Badge>}
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
                        {h.body || h.snippet || h.answer}
                      </div>
                      {h.id && (
                        <button type="button" onClick={() => editLesson(h)} style={{ ...ghostBtn(C), marginTop: 8 }}>
                          Edit this answer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!!testBlock && (
                  <div style={{ padding: 14, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, color: C.muted }}>
                      Knowledge prompt snippet
                    </div>
                    <pre style={preStyle(C)}>{testBlock}</pre>
                  </div>
                )}
              </section>

              <section style={shell(C)}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 800, color: C.text }}>
                  Mandatory rules block
                </div>
                <div style={{ padding: 14 }}>
                  <pre style={{ ...preStyle(C), maxHeight: 420 }}>
                    {rulesPreview || '(No active rules — nothing injected)'}
                  </pre>
                  <Link to="/crm/rules" style={{ ...linkBtn(C), marginTop: 10 }}>Open AI Rules</Link>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

function Field({ label, C, children }) {
  return (
    <label style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}

function Meter({ label, value, ok, C }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: ok ? '#16A34A' : C.text }}>{value}</span>
    </div>
  );
}

function Stat({ C, label, value, accent }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.cardBg }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Badge({ C, children, tone }) {
  const color = tone === 'ok' ? '#16A34A' : C.muted;
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 800, color, letterSpacing: 0.3, textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 6,
      border: `1px solid ${tone === 'ok' ? 'rgba(22,163,74,0.35)' : C.border}`,
    }}>
      {children}
    </span>
  );
}

function shell(C) {
  return {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: C.shadow,
  };
}

function kicker(C) {
  return {
    fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: C.label || C.muted,
  };
}

function fieldStyle(C) {
  return {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${C.inputBdr || C.border}`,
    background: C.inputBg || C.cardBg,
    color: C.text,
    padding: '10px 12px',
    fontSize: 13.5,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function primaryBtn(C, disabled) {
  return {
    padding: '9px 14px', borderRadius: 10, border: 'none',
    background: C.primary || C.accent || '#2563EB', color: '#fff',
    fontWeight: 700, cursor: disabled ? 'wait' : 'pointer', fontSize: 13,
    opacity: disabled ? 0.7 : 1,
  };
}

function ghostBtn(C) {
  return {
    padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
    background: 'transparent', color: C.text, fontWeight: 600, cursor: 'pointer', fontSize: 12.5,
  };
}

function dangerBtn(C) {
  return {
    ...ghostBtn(C),
    borderColor: '#EF4444',
    color: '#EF4444',
  };
}

function linkBtn(C) {
  return { ...ghostBtn(C), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
}

function preStyle(C) {
  return {
    margin: 0,
    padding: 12,
    borderRadius: 10,
    background: C.inputBg || '#f8fafc',
    border: `1px solid ${C.border}`,
    whiteSpace: 'pre-wrap',
    fontSize: 12,
    color: C.text,
    lineHeight: 1.45,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    overflow: 'auto',
    maxHeight: 280,
  };
}
