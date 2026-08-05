import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import PageWrapper from '../../components/layout/PageWrapper';
import usePageTheme from '../../hooks/usePageTheme';
import { useFeatureGate } from '../../hooks/useFeatureGate';

const TABS = [
  { id: 'teach', label: 'Teach answers' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'test', label: 'Test training' },
];

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'Sinhala' },
  { value: 'en-si', label: 'EN + SI' },
];

const RULE_CATS = ['behavior', 'booking', 'handoff', 'pricing', 'language', 'custom'];

const IMPORT_HINT = `Q: What are your opening hours?
A: We open Mon–Sat 9am–7pm. Sundays by appointment.

---

Q: Do you do bridal packages?
A: Yes — ask for bridal and we will share current packages.`;

function fieldStyle(C) {
  return {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${C.inputBdr || C.border}`,
    background: C.inputBg || C.cardBg,
    color: C.text,
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function btn(C, variant = 'default') {
  if (variant === 'primary') {
    return {
      padding: '9px 14px',
      borderRadius: 10,
      border: 'none',
      background: C.primary || C.accent || '#2563EB',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: 13,
    };
  }
  if (variant === 'danger') {
    return {
      padding: '7px 12px',
      borderRadius: 8,
      border: '1px solid #EF4444',
      background: 'transparent',
      color: '#EF4444',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: 12,
    };
  }
  return {
    padding: '9px 14px',
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.cardBg,
    color: C.text,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  };
}

export default function CrmAiTrainingPage() {
  const { C } = usePageTheme();
  const { allowed: kbAllowed } = useFeatureGate('ai_knowledge_base');
  const [tab, setTab] = useState('teach');

  const [lessons, setLessons] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [locale, setLocale] = useState('en');
  const [editLessonId, setEditLessonId] = useState(null);

  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleBody, setRuleBody] = useState('');
  const [ruleCat, setRuleCat] = useState('behavior');
  const [editRuleId, setEditRuleId] = useState(null);

  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const [testQ, setTestQ] = useState('');
  const [testHits, setTestHits] = useState([]);
  const [testBlock, setTestBlock] = useState('');

  const loadLessons = useCallback(async () => {
    if (!kbAllowed) {
      setLessons([]);
      return;
    }
    try {
      const { data } = await api.get('/crm/knowledge', { params: { active: '1' } });
      setLessons(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load training answers');
    }
  }, [kbAllowed]);

  const loadRules = useCallback(async () => {
    try {
      const { data } = await api.get('/crm/rules');
      setRules(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load behaviour rules');
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadLessons(), loadRules()]);
    setLoading(false);
  }, [loadLessons, loadRules]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!kbAllowed && tab === 'teach') setTab('behaviour');
  }, [kbAllowed, tab]);

  const resetLessonForm = () => {
    setQuestion('');
    setAnswer('');
    setLocale('en');
    setEditLessonId(null);
  };

  const saveLesson = async () => {
    if (!kbAllowed) {
      toast.error('Knowledge Base feature is not enabled for this salon');
      return;
    }
    if (!question.trim() || !answer.trim()) {
      toast.error('Customer question and AI answer are required');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: question.trim(),
        body: answer.trim(),
        category: 'faq',
        locale,
        priority: 60,
        is_active: true,
        tags: 'training',
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
    setQuestion(row.title || '');
    setAnswer(row.body || '');
    setLocale(row.locale || 'en');
    setTab('teach');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const seedLessons = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/crm/knowledge/seed-defaults');
      toast.success(`Starter pack ready (${data.created ?? 0} new)`);
      loadLessons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
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

  const seedRules = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/crm/rules/seed-defaults');
      toast.success(`Starter rules ready (${data.created ?? 0} new)`);
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    if (!kbAllowed) {
      toast.error('Enable Knowledge Base to test answer retrieval');
      return;
    }
    if (!testQ.trim()) {
      toast.error('Type a customer question');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.get('/crm/knowledge/search', { params: { q: testQ.trim(), limit: 5 } });
      setTestHits(data.hits || data.data || []);
      setTestBlock(data.prompt_block || data.promptBlock || '');
      if (!(data.hits || data.data || []).length) {
        toast('No matching training answers yet — add a Q&A in Teach answers');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  };

  const activeRules = rules.filter((r) => r.is_active !== false).length;
  const activeLessons = lessons.filter((r) => r.is_active !== false).length;

  return (
    <PageWrapper
      title="AI Training"
      subtitle="Teach WhatsApp AI how to answer customers and how it must behave."
    >
      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}
      >
        {[
          { label: 'Trained answers', value: kbAllowed ? activeLessons : '—' },
          { label: 'Behaviour rules', value: activeRules },
          { label: 'Status', value: loading ? 'Loading…' : 'Ready' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16,
        borderBottom: `1px solid ${C.border}`, paddingBottom: 10,
      }}
      >
        {TABS.map((t) => {
          const disabled = t.id === 'teach' && !kbAllowed;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => setTab(t.id)}
              style={{
                ...btn(C),
                opacity: disabled ? 0.45 : 1,
                background: on ? (C.primary || '#2563EB') : C.cardBg,
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

      {/* TEACH */}
      {tab === 'teach' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 16 }}>
          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
          }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6, color: C.text }}>
              {editLessonId ? 'Edit training answer' : 'Teach a new answer'}
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
              When a customer asks something similar, WhatsApp AI will use this answer.
            </p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              Customer asks
            </label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What time do you open?"
              style={{ ...fieldStyle(C), marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              AI should answer
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write the reply you want the AI to give…"
              rows={6}
              style={{ ...fieldStyle(C), marginBottom: 12, resize: 'vertical' }}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              Language
            </label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              style={{ ...fieldStyle(C), marginBottom: 14 }}
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={saveLesson} style={btn(C, 'primary')}>
                {editLessonId ? 'Update answer' : 'Train AI'}
              </button>
              {editLessonId && (
                <button type="button" onClick={resetLessonForm} style={btn(C)}>Cancel</button>
              )}
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={seedLessons} style={btn(C)}>
                Add starter pack
              </button>
              <button type="button" onClick={() => setShowImport((v) => !v)} style={btn(C)}>
                {showImport ? 'Hide bulk import' : 'Bulk import Q&A'}
              </button>
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={runImport}
                  style={{ ...btn(C, 'primary'), marginTop: 8 }}
                >
                  Import
                </button>
              </div>
            )}
          </div>

          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden',
          }}
          >
            <div style={{
              padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 800, color: C.text,
            }}
            >
              Trained answers ({lessons.length})
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {loading && <div style={{ padding: 20, color: C.muted }}>Loading…</div>}
              {!loading && !lessons.length && (
                <div style={{ padding: 20, color: C.muted }}>
                  No answers yet. Teach the first one on the left.
                </div>
              )}
              {lessons.map((row) => (
                <div
                  key={row.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{row.title}</div>
                  <div style={{
                    fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}
                  >
                    {row.body}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => editLesson(row)} style={btn(C)}>Edit</button>
                    <button type="button" onClick={() => removeLesson(row.id)} style={btn(C, 'danger')}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BEHAVIOUR */}
      {tab === 'behaviour' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 16 }}>
          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
          }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6, color: C.text }}>
              {editRuleId ? 'Edit behaviour rule' : 'Add behaviour rule'}
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
              Rules are mandatory. They override trained answers when they conflict.
            </p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              Rule title
            </label>
            <input
              value={ruleTitle}
              onChange={(e) => setRuleTitle(e.target.value)}
              placeholder="e.g. Always reply in Sinhala first"
              style={{ ...fieldStyle(C), marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              Category
            </label>
            <select
              value={ruleCat}
              onChange={(e) => setRuleCat(e.target.value)}
              style={{ ...fieldStyle(C), marginBottom: 12 }}
            >
              {RULE_CATS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
              What the AI must do
            </label>
            <textarea
              value={ruleBody}
              onChange={(e) => setRuleBody(e.target.value)}
              placeholder="Write a clear instruction the AI must always follow…"
              rows={6}
              style={{ ...fieldStyle(C), marginBottom: 14, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={saveRule} style={btn(C, 'primary')}>
                {editRuleId ? 'Update rule' : 'Save rule'}
              </button>
              {editRuleId && (
                <button type="button" onClick={resetRuleForm} style={btn(C)}>Cancel</button>
              )}
              <button type="button" disabled={busy} onClick={seedRules} style={btn(C)}>
                Add starter rules
              </button>
            </div>
          </div>

          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden',
          }}
          >
            <div style={{
              padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 800, color: C.text,
            }}
            >
              Active rules ({rules.length})
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {loading && <div style={{ padding: 20, color: C.muted }}>Loading…</div>}
              {!loading && !rules.length && (
                <div style={{ padding: 20, color: C.muted }}>No rules yet. Add one on the left.</div>
              )}
              {rules.map((row) => (
                <div key={row.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: C.text, flex: 1 }}>{row.title}</div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
                    }}
                    >
                      {row.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
                    {row.body}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => editRule(row)} style={btn(C)}>Edit</button>
                    <button type="button" onClick={() => removeRule(row.id)} style={btn(C, 'danger')}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TEST */}
      {tab === 'test' && (
        <div style={{
          background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, maxWidth: 720,
        }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6, color: C.text }}>Test what the AI will use</div>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
            Type a customer question. We show which trained answers would be pulled into the WhatsApp reply.
          </p>
          {!kbAllowed && (
            <div style={{
              marginBottom: 12, padding: 12, borderRadius: 10,
              background: '#F59E0B18', color: '#B45309', fontSize: 13, fontWeight: 600,
            }}
            >
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
            <button type="button" disabled={busy || !kbAllowed} onClick={runTest} style={btn(C, 'primary')}>
              Test
            </button>
          </div>

          {!!testHits.length && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: C.text }}>Matched training</div>
              {testHits.map((h, i) => (
                <div
                  key={h.id || i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{h.title || h.question}</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                    {h.body || h.snippet || h.answer}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!!testBlock && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, color: C.muted }}>
                Prompt snippet (what AI sees)
              </div>
              <pre style={{
                margin: 0,
                padding: 12,
                borderRadius: 10,
                background: C.inputBg || '#f8fafc',
                border: `1px solid ${C.border}`,
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                color: C.text,
              }}
              >
                {testBlock}
              </pre>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
