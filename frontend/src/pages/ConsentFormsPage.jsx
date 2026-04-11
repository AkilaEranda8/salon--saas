import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/* ── SVG icon helper ─────────────────────────────────────────────────── */
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  file:       'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6',
  plus:       'M12 5v14M5 12h14',
  edit:       'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  chevDown:   'M6 9l6 6 6-6',
  chevUp:     'M18 15l-6-6-6 6',
  pen:        'M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  check:      'M20 6L9 17l-5-5',
  close:      'M18 6L6 18M6 6l12 12',
  eye:        'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z',
  shield:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  users:      'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  signature:  'M3 17h4l10.5-10.5a2.121 2.121 0 00-3-3L4 14v3z M14.5 5.5l3 3',
  templates:  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  tag:        'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01',
  calendar:   'M3 9h18M8 3v4m8-4v4M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  info:       'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 8v4 M12 16h.01',
};

/* ── Category config ─────────────────────────────────────────────────── */
const CATEGORIES = ['general', 'chemical_treatment', 'skin_care', 'allergy', 'medical', 'other'];
const CAT_STYLE = {
  general:            { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  chemical_treatment: { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  skin_care:          { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  allergy:            { bg: '#FDF4FF', color: '#9333EA', border: '#E9D5FF' },
  medical:            { bg: '#FFF1F2', color: '#BE123C', border: '#FECDD3' },
  other:              { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' },
};

/* ── Form Editor Modal ───────────────────────────────────────────────── */
function FormEditorModal({ editForm, onClose, onSaved, isDark }) {
  const blank = { title: '', body_text: '', category: 'general', requires_signature: true, version: '1.0' };
  const [fData, setFData] = useState(editForm ? { ...editForm } : blank);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const set = (k) => (e) => setFData((p) => ({
    ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editForm) {
        await api.put(`/consent/forms/${editForm.id}`, fData);
        addToast('Form updated successfully', 'success');
      } else {
        await api.post('/consent/forms', fData);
        addToast('Consent form created', 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.message || 'Error saving form', 'error');
    }
    setSaving(false);
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
    borderRadius: 10, padding: '10px 13px', fontSize: 13,
    color: isDark ? '#F1F5F9' : '#111827',
    background: isDark ? '#1A1F2E' : '#FAFAFA',
    outline: 'none', fontFamily: "'Inter', sans-serif",
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
  const labelStyle = {
    fontSize: 11.5, fontWeight: 700, color: isDark ? '#94A3B8' : '#374151',
    marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          background: isDark ? '#151B2D' : '#fff',
          borderRadius: 22, width: 620, maxWidth: '96vw',
          maxHeight: '92vh', overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(15,23,42,0.28)',
          display: 'flex', flexDirection: 'column',
          border: `1px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 26px 18px',
          background: isDark
            ? 'linear-gradient(135deg,#1A2240 0%,#151B2D 80%)'
            : 'linear-gradient(135deg,#EEF2FF 0%,#F8F9FF 70%)',
          borderBottom: `1px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6366F1', marginBottom: 6 }}>
                Consent Forms
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: "'Sora','Manrope',sans-serif", letterSpacing: '-0.03em' }}>
                {editForm ? 'Edit Consent Form' : 'New Consent Form'}
              </h2>
              <p style={{ margin: '5px 0 0', fontSize: 13, color: isDark ? '#64748B' : '#64748B' }}>
                {editForm ? 'Update this template's content and settings.' : 'Create a reusable consent template for your services.'}
              </p>
            </div>
            <button onClick={onClose} style={{
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: `1px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
              borderRadius: 10, padding: 8, cursor: 'pointer',
              color: isDark ? '#94A3B8' : '#6B7280', display: 'flex',
            }}>
              <Ico d={ICONS.close} size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} style={{ padding: '22px 26px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title full-width */}
          <div>
            <label style={labelStyle}>Form Title <span style={{ color: '#EF4444' }}>*</span></label>
            <input style={inputStyle} value={fData.title} onChange={set('title')}
              required placeholder="e.g. Chemical Treatment Consent" />
          </div>

          {/* Category + Version row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={fData.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Version</label>
              <input style={inputStyle} value={fData.version} onChange={set('version')} placeholder="1.0" />
            </div>
          </div>

          {/* Requires signature */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: 12,
            background: isDark ? '#1A2240' : '#F5F3FF',
            border: `1.5px solid ${isDark ? '#3B3F6E' : '#C4B5FD'}`,
            cursor: 'pointer',
          }} onClick={() => setFData((p) => ({ ...p, requires_signature: !p.requires_signature }))}>
            <div style={{
              width: 20, height: 20, borderRadius: 6,
              background: fData.requires_signature ? '#6366F1' : (isDark ? '#2D3748' : '#E5E7EB'),
              border: `2px solid ${fData.requires_signature ? '#6366F1' : (isDark ? '#475569' : '#D1D5DB')}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}>
              {fData.requires_signature && <Ico d={ICONS.check} size={12} />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#C4B5FD' : '#5B21B6' }}>Requires digital signature</div>
              <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#7C3AED', marginTop: 1 }}>Customer must draw their signature before submitting</div>
            </div>
          </div>

          {/* Body text */}
          <div>
            <label style={labelStyle}>Form Content / Body Text <span style={{ color: '#EF4444' }}>*</span></label>
            <textarea
              style={{ ...inputStyle, height: 200, resize: 'vertical', lineHeight: 1.7 }}
              value={fData.body_text}
              onChange={set('body_text')}
              required
              placeholder="I, the undersigned, hereby consent to the following treatment procedures…"
            />
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 7,
              padding: '8px 12px', borderRadius: 8,
              background: isDark ? '#0F172A' : '#F0F9FF',
              border: `1px solid ${isDark ? '#1E3A5F' : '#BAE6FD'}`,
            }}>
              <Ico d={ICONS.info} size={13} />
              <span style={{ fontSize: 11, color: isDark ? '#64748B' : '#0369A1', lineHeight: 1.5 }}>
                Use <strong style={{ fontFamily: 'monospace' }}>{'{{customer_name}}'}</strong>, <strong style={{ fontFamily: 'monospace' }}>{'{{date}}'}</strong>, <strong style={{ fontFamily: 'monospace' }}>{'{{service_name}}'}</strong> — auto-filled at signing time.
              </span>
            </div>
          </div>

          {/* Footer buttons */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="submit" disabled={saving} style={{
              flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? '#94A3B8' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              fontFamily: "'Inter',sans-serif", boxShadow: saving ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
              transition: 'all 0.18s',
            }}>
              {saving ? 'Saving…' : editForm ? 'Update Form' : 'Create Form'}
            </button>
            <button type="button" onClick={onClose} style={{
              padding: '11px 22px', borderRadius: 12,
              border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
              background: 'transparent', cursor: 'pointer', fontSize: 13,
              color: isDark ? '#94A3B8' : '#6B7280', fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
            }}>Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ── Record Detail Modal ─────────────────────────────────────────────── */
function RecordModal({ record, onClose, isDark }) {
  const snapshot = record.form_snapshot
    ? (typeof record.form_snapshot === 'string' ? record.form_snapshot : record.form_snapshot?.body_text)
    : record.form?.body_text;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 24 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          background: isDark ? '#151B2D' : '#fff',
          borderRadius: 22, maxWidth: 700, width: '100%',
          maxHeight: '92vh', overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(15,23,42,0.30)',
          display: 'flex', flexDirection: 'column',
          border: `1px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 26px 18px',
          background: isDark
            ? 'linear-gradient(135deg,#1A2240,#151B2D)'
            : 'linear-gradient(135deg,#F0FDF4 0%,#ECFDF5 40%,#fff 100%)',
          borderBottom: `1px solid ${isDark ? '#2D3748' : '#D1FAE5'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#059669', marginBottom: 6 }}>
                Signed Consent Record
              </div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: isDark ? '#F1F5F9' : '#0F172A', fontFamily: "'Sora','Manrope',sans-serif", letterSpacing: '-0.02em' }}>
                {record.form?.title || 'Consent Record'}
              </h2>
            </div>
            <button onClick={onClose} style={{
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: `1px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
              borderRadius: 10, padding: 8, cursor: 'pointer',
              color: isDark ? '#94A3B8' : '#6B7280', display: 'flex', flexShrink: 0,
            }}>
              <Ico d={ICONS.close} size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 26px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Customer + Signed At */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{
              padding: '14px 16px', borderRadius: 12,
              background: isDark ? '#1A1F2E' : '#F8FAFF',
              border: `1.5px solid ${isDark ? '#2D3748' : '#E0E7FF'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDark ? '#475569' : '#9CA3AF', marginBottom: 6 }}>Customer</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: isDark ? '#F1F5F9' : '#101828' }}>{record.customer?.name || '—'}</div>
              <div style={{ fontSize: 12, color: isDark ? '#64748B' : '#6B7280', marginTop: 2 }}>{record.customer?.phone || ''}</div>
            </div>
            <div style={{
              padding: '14px 16px', borderRadius: 12,
              background: isDark ? '#1A1F2E' : '#F8FAFF',
              border: `1.5px solid ${isDark ? '#2D3748' : '#E0E7FF'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDark ? '#475569' : '#9CA3AF', marginBottom: 6 }}>Signed At</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#F1F5F9' : '#101828' }}>
                {record.signed_at ? new Date(record.signed_at).toLocaleDateString() : '—'}
              </div>
              <div style={{ fontSize: 11, color: isDark ? '#64748B' : '#6B7280', marginTop: 2 }}>
                {record.signed_at ? new Date(record.signed_at).toLocaleTimeString() : ''}
              </div>
            </div>
          </div>

          {/* Form content snapshot */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDark ? '#475569' : '#9CA3AF', marginBottom: 10 }}>
              Form Content at Time of Signing
            </div>
            <div style={{
              padding: '16px 18px', borderRadius: 12,
              background: isDark ? '#0F172A' : '#FAFAFA',
              border: `1.5px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
              maxHeight: 240, overflowY: 'auto',
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: isDark ? '#94A3B8' : '#374151', lineHeight: 1.8 }}>
                {snapshot || '—'}
              </pre>
            </div>
          </div>

          {/* Signature */}
          {record.signature_data ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDark ? '#475569' : '#9CA3AF', marginBottom: 10 }}>
                Digital Signature
              </div>
              <div style={{
                padding: 16, borderRadius: 12,
                background: isDark ? '#fff' : '#fff',
                border: `1.5px solid ${isDark ? '#D1FAE5' : '#D1FAE5'}`,
              }}>
                <img
                  src={record.signature_data.startsWith('data:') ? record.signature_data : `data:image/png;base64,${record.signature_data}`}
                  alt="Signature"
                  style={{ maxWidth: '100%', maxHeight: 120, display: 'block', margin: '0 auto' }}
                />
              </div>
            </div>
          ) : (
            <div style={{
              padding: '14px 16px', borderRadius: 12, textAlign: 'center',
              background: isDark ? '#1A1F2E' : '#FFFBEB',
              border: `1.5px dashed ${isDark ? '#374151' : '#FCD34D'}`,
              fontSize: 13, color: isDark ? '#92400E' : '#92400E', fontWeight: 500,
            }}>
              No signature captured for this record
            </div>
          )}

          {/* Close */}
          <button onClick={onClose} style={{
            padding: '11px 0', borderRadius: 12,
            border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
            background: 'transparent', cursor: 'pointer', fontSize: 13,
            color: isDark ? '#94A3B8' : '#6B7280', fontWeight: 600,
            fontFamily: "'Inter',sans-serif",
          }}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function ConsentFormsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { isDark } = useTheme();
  const canAdmin = ['superadmin', 'admin'].includes(user?.role);

  const [tab, setTab]                       = useState('forms');
  const [forms, setForms]                   = useState([]);
  const [records, setRecords]               = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loading, setLoading]               = useState(true);
  const [showEditor, setShowEditor]         = useState(false);
  const [editForm, setEditForm]             = useState(null);
  const [expandedForm, setExpandedForm]     = useState(null);

  const loadForms = useCallback(() => {
    api.get('/consent/forms').then((r) => setForms(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const loadRecords = useCallback(() => {
    setLoading(true);
    api.get('/consent/records')
      .then((r) => setRecords(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadForms(); loadRecords(); }, [loadForms, loadRecords]);

  const viewRecord = async (id) => {
    try {
      const r = await api.get(`/consent/records/${id}`);
      setSelectedRecord(r.data);
    } catch { addToast('Could not load record', 'error'); }
  };

  /* ── local colours ── */
  const surface  = isDark ? '#151B2D' : '#fff';
  const border   = isDark ? '#1E293B' : '#E5E7EB';
  const textMain = isDark ? '#F1F5F9' : '#101828';
  const textSub  = isDark ? '#64748B' : '#6B7280';
  const hover    = isDark ? '#1A1F2E' : '#F9FAFB';

  /* ── stat cards data ── */
  const stats = [
    { label: 'Total Templates', value: forms.length, icon: ICONS.templates, accent: '#6366F1', soft: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF' },
    { label: 'Active Forms',    value: forms.filter((f) => f.is_active).length, icon: ICONS.check, accent: '#059669', soft: isDark ? 'rgba(5,150,105,0.12)' : '#ECFDF5' },
    { label: 'Signed Records',  value: records.length, icon: ICONS.signature, accent: '#7C3AED', soft: isDark ? 'rgba(124,58,237,0.12)' : '#F5F3FF' },
    { label: 'Require Signature', value: forms.filter((f) => f.requires_signature).length, icon: ICONS.pen, accent: '#DC6803', soft: isDark ? 'rgba(220,104,3,0.12)' : '#FFFBEB' },
  ];

  return (
    <PageWrapper
      title="Digital Consent Forms"
      subtitle="Manage consent templates and view signed patient records"
      actions={
        canAdmin && tab === 'forms'
          ? (
            <button
              onClick={() => { setEditForm(null); setShowEditor(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                fontFamily: "'Inter',sans-serif",
                boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                transition: 'opacity 0.15s',
              }}
            >
              <Ico d={ICONS.plus} size={15} /> New Form
            </button>
          ) : null
      }
    >
      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            style={{
              background: surface, borderRadius: 16,
              border: `1.5px solid ${border}`,
              padding: '16px 18px',
              boxShadow: isDark ? 'none' : '0 1px 4px rgba(16,24,40,0.05)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: s.soft, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: s.accent, flexShrink: 0,
            }}>
              <Ico d={s.icon} size={18} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: textMain, fontFamily: "'Sora','Manrope',sans-serif", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: textSub, marginTop: 3, fontWeight: 500 }}>{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6,
        background: isDark ? '#1A1F2E' : '#F3F4F6',
        borderRadius: 14, padding: 5, width: 'fit-content',
      }}>
        {[
          { k: 'forms',   label: 'Form Templates', icon: ICONS.templates },
          { k: 'records', label: 'Signed Records',  icon: ICONS.signature },
        ].map(({ k, label, icon }) => {
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: active ? (isDark ? '#252F45' : '#fff') : 'transparent',
              color: active ? (isDark ? '#C4B5FD' : '#6366F1') : textSub,
              fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
              boxShadow: active ? '0 1px 4px rgba(16,24,40,0.08)' : 'none',
              transition: 'all 0.18s', fontFamily: "'Inter',sans-serif",
            }}>
              <Ico d={icon} size={14} />
              {label}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? '#6366F1' : (isDark ? '#2D3748' : '#E5E7EB'),
                color: active ? '#fff' : textSub,
                borderRadius: 999, fontSize: 10, fontWeight: 800, padding: '1px 7px',
                minWidth: 20,
              }}>
                {k === 'forms' ? forms.length : records.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Form Templates ──────────────────────────────────────────── */}
      {tab === 'forms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {forms.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{
                textAlign: 'center', padding: '52px 24px',
                background: isDark ? '#151B2D' : '#FAFBFF',
                border: `2px dashed ${isDark ? '#2D3748' : '#C7D2FE'}`,
                borderRadius: 18,
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                background: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6366F1',
              }}>
                <Ico d={ICONS.file} size={26} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: textMain, fontFamily: "'Sora',sans-serif" }}>No templates yet</div>
              <div style={{ fontSize: 13, color: textSub, marginTop: 6 }}>Create your first consent form template to get started.</div>
              {canAdmin && (
                <button
                  onClick={() => { setEditForm(null); setShowEditor(true); }}
                  style={{
                    marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '9px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    fontFamily: "'Inter',sans-serif",
                    boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                  }}
                >
                  <Ico d={ICONS.plus} size={14} /> New Form
                </button>
              )}
            </motion.div>
          ) : (
            forms.map((f, i) => {
              const catStyle = CAT_STYLE[f.category] || CAT_STYLE.other;
              const isOpen = expandedForm === f.id;
              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    background: surface, borderRadius: 16,
                    border: `1.5px solid ${isOpen ? '#6366F1' : border}`,
                    overflow: 'hidden',
                    boxShadow: isOpen
                      ? '0 4px 20px rgba(99,102,241,0.10)'
                      : isDark ? 'none' : '0 1px 4px rgba(16,24,40,0.04)',
                    transition: 'border-color 0.18s, box-shadow 0.18s',
                  }}
                >
                  {/* Card header row */}
                  <div
                    onClick={() => setExpandedForm(isOpen ? null : f.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer' }}
                  >
                    {/* Category dot / icon */}
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: isDark ? 'rgba(99,102,241,0.12)' : catStyle.bg,
                      border: `1.5px solid ${isDark ? 'rgba(99,102,241,0.2)' : catStyle.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isDark ? '#818CF8' : catStyle.color,
                    }}>
                      <Ico d={ICONS.file} size={18} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: textMain, fontFamily: "'Sora','Manrope',sans-serif", letterSpacing: '-0.02em' }}>
                        {f.title}
                        {!f.is_active && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 999 }}>Inactive</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                          background: isDark ? 'rgba(99,102,241,0.12)' : catStyle.bg,
                          color: isDark ? '#818CF8' : catStyle.color,
                          border: `1px solid ${isDark ? 'rgba(99,102,241,0.2)' : catStyle.border}`,
                          textTransform: 'capitalize',
                        }}>
                          {f.category?.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: textSub, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: isDark ? '#1A1F2E' : '#F3F4F6' }}>
                          v{f.version}
                        </span>
                        {f.requires_signature && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: isDark ? 'rgba(124,58,237,0.12)' : '#F5F3FF', color: '#7C3AED', border: `1px solid ${isDark ? 'rgba(124,58,237,0.2)' : '#DDD6FE'}` }}>
                            ✍ Signature
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      {canAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditForm(f); setShowEditor(true); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 13px', borderRadius: 9,
                            border: `1.5px solid ${isDark ? '#2D3748' : '#E5E7EB'}`,
                            background: isDark ? '#1A1F2E' : '#F9FAFB',
                            color: isDark ? '#94A3B8' : '#374151',
                            cursor: 'pointer', fontSize: 12, fontWeight: 700,
                            fontFamily: "'Inter',sans-serif",
                            transition: 'all 0.15s',
                          }}
                        >
                          <Ico d={ICONS.edit} size={13} /> Edit
                        </button>
                      )}
                      <div style={{ color: isDark ? '#475569' : '#9CA3AF' }}>
                        <Ico d={isOpen ? ICONS.chevUp : ICONS.chevDown} size={18} />
                      </div>
                    </div>
                  </div>

                  {/* Expanded body */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{
                          borderTop: `1.5px solid ${isDark ? '#1E293B' : '#F3F4F6'}`,
                          padding: '16px 20px',
                          background: isDark ? '#0F172A' : '#FAFAFA',
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDark ? '#475569' : '#9CA3AF', marginBottom: 10 }}>Form Content</div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: isDark ? '#94A3B8' : '#374151', lineHeight: 1.8 }}>
                            {f.body_text}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* ── Signed Records ──────────────────────────────────────────── */}
      {tab === 'records' && (
        loading
          ? (
            <div style={{ textAlign: 'center', padding: 52, color: textSub }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Loading records…</div>
            </div>
          )
          : records.length === 0
            ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{
                  textAlign: 'center', padding: '52px 24px',
                  background: isDark ? '#151B2D' : '#FAFBFF',
                  border: `2px dashed ${isDark ? '#2D3748' : '#C7D2FE'}`,
                  borderRadius: 18,
                }}
              >
                <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', background: isDark ? 'rgba(124,58,237,0.12)' : '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED' }}>
                  <Ico d={ICONS.signature} size={26} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: textMain, fontFamily: "'Sora',sans-serif" }}>No signed records yet</div>
                <div style={{ fontSize: 13, color: textSub, marginTop: 6 }}>Signed consent records will appear here once customers sign a form.</div>
              </motion.div>
            )
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{
                      background: isDark ? '#1A1F2E' : '#F9FAFB',
                      borderBottom: `2px solid ${border}`,
                    }}>
                      {['Customer', 'Form', 'Category', 'Signed At', 'Appointment', 'Signature', ''].map((h) => (
                        <th key={h} style={{
                          padding: '11px 14px', textAlign: 'left',
                          fontSize: 10, fontWeight: 800, letterSpacing: '0.07em',
                          textTransform: 'uppercase', color: isDark ? '#475569' : '#9CA3AF',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const catStyle = CAT_STYLE[r.form?.category] || CAT_STYLE.other;
                      return (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          style={{ borderBottom: `1px solid ${border}` }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          {/* Customer */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                                background: isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 800, color: '#6366F1',
                              }}>
                                {(r.customer?.name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: textMain, fontSize: 13 }}>{r.customer?.name || '—'}</div>
                                <div style={{ fontSize: 11, color: textSub }}>{r.customer?.phone || ''}</div>
                              </div>
                            </div>
                          </td>
                          {/* Form */}
                          <td style={{ padding: '12px 14px', color: textMain, fontWeight: 600, maxWidth: 180 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.form?.title || '—'}</div>
                          </td>
                          {/* Category */}
                          <td style={{ padding: '12px 14px' }}>
                            {r.form?.category && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                                background: isDark ? 'rgba(99,102,241,0.12)' : catStyle.bg,
                                color: isDark ? '#818CF8' : catStyle.color,
                                textTransform: 'capitalize', whiteSpace: 'nowrap',
                              }}>
                                {r.form.category.replace(/_/g, ' ')}
                              </span>
                            )}
                          </td>
                          {/* Signed At */}
                          <td style={{ padding: '12px 14px', color: textSub, fontSize: 12, whiteSpace: 'nowrap' }}>
                            {r.signed_at ? new Date(r.signed_at).toLocaleDateString() : '—'}
                            <div style={{ fontSize: 10 }}>{r.signed_at ? new Date(r.signed_at).toLocaleTimeString() : ''}</div>
                          </td>
                          {/* Appointment */}
                          <td style={{ padding: '12px 14px', color: textSub, fontSize: 12 }}>
                            {r.appointment_id ? <span style={{ fontWeight: 600 }}>#{r.appointment_id}</span> : '—'}
                          </td>
                          {/* Signature status */}
                          <td style={{ padding: '12px 14px' }}>
                            {r.signature_data
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, background: isDark ? 'rgba(5,150,105,0.12)' : '#D1FAE5', color: '#059669', borderRadius: 999, padding: '3px 10px' }}>
                                  <Ico d={ICONS.check} size={11} /> Signed
                                </span>
                              : <span style={{ fontSize: 11, color: textSub }}>Unsigned</span>
                            }
                          </td>
                          {/* Actions */}
                          <td style={{ padding: '12px 14px' }}>
                            <button
                              onClick={() => viewRecord(r.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '5px 12px', borderRadius: 8,
                                border: `1.5px solid ${isDark ? '#2D3748' : '#BFDBFE'}`,
                                background: isDark ? '#1A1F2E' : '#EFF6FF',
                                color: isDark ? '#818CF8' : '#1D4ED8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                fontFamily: "'Inter',sans-serif",
                                transition: 'all 0.15s',
                              }}
                            >
                              <Ico d={ICONS.eye} size={13} /> View
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEditor && (
          <FormEditorModal
            editForm={editForm}
            isDark={isDark}
            onClose={() => { setShowEditor(false); setEditForm(null); }}
            onSaved={() => { loadForms(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedRecord && (
          <RecordModal
            record={selectedRecord}
            isDark={isDark}
            onClose={() => setSelectedRecord(null)}
          />
        )}
      </AnimatePresence>
    </PageWrapper>
  );
}
