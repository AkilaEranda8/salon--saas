import React, { useEffect, useState, useCallback } from 'react';
import api from '../../api/axios';
import { useTheme } from '../../context/ThemeContext';

/* ── Icons ───────────────────────────────────────────────────────────── */
const Ico = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  plus:    'M12 5v14M5 12h14',
  edit:    'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:   'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  check:   'M20 6L9 17l-5-5',
  star:    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  unlock:  'M8 11V7a4 4 0 018 0M12 15v2M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z',
  tag:     'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  arrow:   'M5 12h14M12 5l7 7-7 7',
};

/* ── Plan accent colors ──────────────────────────────────────────────── */
const PLAN_THEME = {
  trial:      { accent: '#64748B', grad: 'linear-gradient(135deg,#1e293b,#334155)', badge: '#F1F5F9', badgeText: '#1E293B' },
  basic:      { accent: '#2563EB', grad: 'linear-gradient(135deg,#1E3A5F,#2563EB)', badge: '#DBEAFE', badgeText: '#1E40AF' },
  pro:        { accent: '#7C3AED', grad: 'linear-gradient(135deg,#4C1D95,#7C3AED)', badge: '#EDE9FE', badgeText: '#5B21B6' },
  enterprise: { accent: '#059669', grad: 'linear-gradient(135deg,#064E3B,#059669)', badge: '#D1FAE5', badgeText: '#065F46' },
};
function planTheme(key) {
  return PLAN_THEME[key] ?? { accent: '#6366F1', grad: 'linear-gradient(135deg,#312E81,#6366F1)', badge: '#EEF2FF', badgeText: '#3730A3' };
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function fmt(n) { return n === -1 ? '∞' : n; }

const EMPTY_FORM = {
  key: '',
  label: '',
  price_display: '',
  price_period: '/mo',
  tagline: '',
  max_branches: 1,
  max_staff: 10,
  max_services: 50,
  trial_days: 0,
  features: '',
  is_popular: false,
  is_active: true,
  sort_order: 0,
  offer_active: false,
  offer_label: '',
  offer_price_display: '',
  offer_badge: '',
  offer_ends_at: '',
};

/* ── Modal ───────────────────────────────────────────────────────────── */
function PlanModal({ plan, onClose, onSaved }) {
  const isEdit = !!plan;
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          ...plan,
          features: (plan.features || []).join('\n'),
          offer_active: plan.offer_active || false,
          offer_label: plan.offer_label || '',
          offer_price_display: plan.offer_price_display || '',
          offer_badge: plan.offer_badge || '',
          offer_ends_at: plan.offer_ends_at ? plan.offer_ends_at.slice(0, 16) : '',
        }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSave = async () => {
    setErr('');
    if (!form.key || !form.label) { setErr('Key and Label are required.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        key: String(form.key).toLowerCase().replace(/\s+/g, '_'),
        max_branches:  Number(form.max_branches),
        max_staff:     Number(form.max_staff),
        max_services:  Number(form.max_services),
        trial_days:    Number(form.trial_days),
        sort_order:    Number(form.sort_order),
        features: form.features
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        offer_active:        Boolean(form.offer_active),
        offer_label:         form.offer_label || null,
        offer_price_display: form.offer_price_display || null,
        offer_badge:         form.offer_badge || null,
        offer_ends_at:       form.offer_ends_at || null,
      };
      if (isEdit) {
        await api.patch(`/platform/plans/${plan.id}`, payload);
      } else {
        await api.post('/platform/plans', payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    border: '1.5px solid #E5E7EB', borderRadius: 9,
    padding: '9px 12px', fontSize: 13, color: '#111827',
    outline: 'none', background: '#FAFAFA',
    transition: 'border-color 0.15s',
  };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5, display: 'block' };
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 22, width: 600, maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 40px 100px rgba(15,23,42,0.22)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', background: 'linear-gradient(135deg,#EEF2FF 0%,#fff 70%)', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#6366F1' }}>Plans Management</div>
          <div style={{ marginTop: 5, fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{isEdit ? `Edit — ${plan.label}` : 'New Plan'}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#64748B' }}>{isEdit ? 'Update plan details, pricing and limits.' : 'Create a new subscription plan.'}</div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'grid', gap: 14 }}>
          {/* Row 1: key + label */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Plan Key <span style={{ color: '#EF4444' }}>*</span></label>
              <input style={inputStyle} value={form.key} onChange={set('key')} placeholder="e.g. pro" disabled={isEdit} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>Lowercase, no spaces (e.g. basic, pro)</span>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Display Label <span style={{ color: '#EF4444' }}>*</span></label>
              <input style={inputStyle} value={form.label} onChange={set('label')} placeholder="e.g. Pro" />
            </div>
          </div>

          {/* Row 2: price + period */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Price Display</label>
              <input style={inputStyle} value={form.price_display} onChange={set('price_display')} placeholder="e.g. LKR 2,900" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Period</label>
              <input style={inputStyle} value={form.price_period} onChange={set('price_period')} placeholder="/mo" />
            </div>
          </div>

          {/* Row 3: tagline */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Tagline</label>
            <input style={inputStyle} value={form.tagline} onChange={set('tagline')} placeholder="e.g. Perfect for single-location salons" />
          </div>

          {/* Row 4: limits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Max Branches</label>
              <input style={inputStyle} type="number" value={form.max_branches} onChange={set('max_branches')} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>-1 = unlimited</span>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Max Staff</label>
              <input style={inputStyle} type="number" value={form.max_staff} onChange={set('max_staff')} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>-1 = unlimited</span>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Max Services</label>
              <input style={inputStyle} type="number" value={form.max_services} onChange={set('max_services')} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>-1 = unlimited</span>
            </div>
          </div>

          {/* Row 5: trial days + sort order */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Trial Days</label>
              <input style={inputStyle} type="number" value={form.trial_days} onChange={set('trial_days')} placeholder="0" />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>0 = no trial</span>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Sort Order</label>
              <input style={inputStyle} type="number" value={form.sort_order} onChange={set('sort_order')} />
            </div>
          </div>

          {/* Features */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Features <span style={{ fontWeight: 400, color: '#94A3B8' }}>(one per line)</span></label>
            <textarea
              style={{ ...inputStyle, height: 100, resize: 'vertical', fontFamily: 'inherit' }}
              value={form.features}
              onChange={set('features')}
              placeholder={'1 branch\n10 staff members\n50 services'}
            />
          </div>

          {/* Checkboxes */}
          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_popular} onChange={set('is_popular')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              Mark as Popular
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              Active (visible to tenants)
            </label>
          </div>

          {/* ── Offer / Promotion Section ── */}
          <div style={{ borderTop: '1.5px dashed #E5E7EB', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🏷️</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Offer / Promotion</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: form.offer_active ? '#059669' : '#94A3B8', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.offer_active} onChange={set('offer_active')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                {form.offer_active ? 'Offer ON' : 'Offer OFF'}
              </label>
            </div>

            {form.offer_active && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Offer Badge</label>
                    <input style={inputStyle} value={form.offer_badge} onChange={set('offer_badge')} placeholder="e.g. 30% OFF" />
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>Badge shown on plan card</span>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Offer Price</label>
                    <input style={inputStyle} value={form.offer_price_display} onChange={set('offer_price_display')} placeholder="e.g. LKR 1,990" />
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>Discounted price to display</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Offer Label</label>
                    <input style={inputStyle} value={form.offer_label} onChange={set('offer_label')} placeholder="e.g. New Year Special" />
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>Description shown under badge</span>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Offer Ends At</label>
                    <input style={inputStyle} type="datetime-local" value={form.offer_ends_at} onChange={set('offer_ends_at')} />
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>Leave empty for no expiry</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {err && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, fontSize: 13, color: '#DC2626' }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#FAFAFA' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: saving ? '#A5B4FC' : '#6366F1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Plan Card ───────────────────────────────────────────────────────── */
function PlanCard({ plan, dark, onEdit, onDelete, onToggle }) {
  const theme = planTheme(plan.key);
  const [delConfirm, setDelConfirm] = useState(false);

  return (
    <div style={{
      borderRadius: 20,
      border: `1.5px solid ${dark ? '#334155' : '#E5E7EB'}`,
      background: dark ? '#111827' : '#fff',
      boxShadow: dark ? '0 12px 30px rgba(2,6,23,0.35)' : '0 8px 24px rgba(15,23,42,0.07)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      opacity: plan.is_active ? 1 : 0.6,
      transition: 'opacity 0.2s',
    }}>
      {/* Card header gradient */}
      <div style={{ background: theme.grad, padding: '18px 20px 16px', color: '#fff', position: 'relative' }}>
        {/* Offer badge */}
        {plan.offer_active && plan.offer_badge && (
          <div style={{
            position: 'absolute', top: -1, right: 16,
            background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
            color: '#fff', fontSize: 11, fontWeight: 800,
            padding: '4px 14px 6px', borderRadius: '0 0 10px 10px',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            🔥 {plan.offer_badge}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>
              {plan.key}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 3 }}>{plan.label}</div>
            {plan.tagline && <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{plan.tagline}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {plan.is_popular && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(255,255,255,0.2)', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                <Ico d={ICONS.star} size={12} /> Popular
              </span>
            )}
            {!plan.is_active && (
              <span style={{ padding: '3px 10px', background: 'rgba(239,68,68,0.3)', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#FCA5A5' }}>
                Inactive
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {plan.offer_active && plan.offer_price_display ? (
            <>
              <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{plan.offer_price_display}</span>
              <span style={{ fontSize: 15, opacity: 0.6, textDecoration: 'line-through' }}>{plan.price_display || '—'}</span>
              <span style={{ fontSize: 13, opacity: 0.75 }}>{plan.price_period}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{plan.price_display || '—'}</span>
              <span style={{ fontSize: 13, opacity: 0.75, marginLeft: 4 }}>{plan.price_period}</span>
            </>
          )}
        </div>
        {plan.offer_active && plan.offer_label && (
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#FCD34D', display: 'flex', alignItems: 'center', gap: 5 }}>
            🏷️ {plan.offer_label}
            {plan.offer_ends_at && (
              <span style={{ opacity: 0.8, fontWeight: 500 }}>
                · Ends {new Date(plan.offer_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )}
        {plan.trial_days > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>✓ {plan.trial_days}-day free trial</div>
        )}
      </div>

      {/* Limits */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${dark ? '#1E293B' : '#F1F5F9'}` }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Branches', value: fmt(plan.max_branches) },
            { label: 'Staff',    value: fmt(plan.max_staff) },
            { label: 'Services', value: fmt(plan.max_services) },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', padding: '8px 6px', background: dark ? '#0F172A' : '#F8FAFC', borderRadius: 10, border: `1px solid ${dark ? '#334155' : '#E5E7EB'}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: theme.accent }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      {plan.features?.length > 0 && (
        <div style={{ padding: '12px 20px', flex: 1 }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plan.features.map((f, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: dark ? '#CBD5E1' : '#374151' }}>
                <span style={{ color: theme.accent, flexShrink: 0 }}><Ico d={ICONS.check} size={13} /></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '12px 20px', borderTop: `1px solid ${dark ? '#1E293B' : '#F1F5F9'}`, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          onClick={() => onToggle(plan)}
          title={plan.is_active ? 'Deactivate' : 'Activate'}
          style={{ padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${dark ? '#334155' : '#E5E7EB'}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: plan.is_active ? '#DC2626' : '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {plan.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          onClick={() => onEdit(plan)}
          style={{ padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${dark ? '#334155' : '#E5E7EB'}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: dark ? '#E2E8F0' : '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Ico d={ICONS.edit} size={13} /> Edit
        </button>
        {delConfirm ? (
          <>
            <button onClick={() => setDelConfirm(false)} style={{ padding: '7px 12px', borderRadius: 9, border: '1.5px solid #E5E7EB', background: '#fff', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onDelete(plan)} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#EF4444', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Confirm Delete</button>
          </>
        ) : (
          <button
            onClick={() => setDelConfirm(true)}
            style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#FEE2E2', fontSize: 12, fontWeight: 700, color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Ico d={ICONS.trash} size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function PlatformPlansPage() {
  const { isDark } = useTheme();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editPlan, setEditPlan] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/platform/plans');
      setPlans(data);
    } catch {
      showToast('Failed to load plans.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (plan) => { setEditPlan(plan); setShowModal(true); };
  const handleAdd  = () => { setEditPlan(null); setShowModal(true); };

  const handleDelete = async (plan) => {
    try {
      await api.delete(`/platform/plans/${plan.id}`);
      showToast(`Plan "${plan.label}" deleted.`);
      load();
    } catch (e) {
      showToast(e.response?.data?.message || 'Delete failed.', 'error');
    }
  };

  const handleToggle = async (plan) => {
    try {
      await api.patch(`/platform/plans/${plan.id}`, { is_active: !plan.is_active });
      showToast(`Plan "${plan.label}" ${plan.is_active ? 'deactivated' : 'activated'}.`);
      load();
    } catch (e) {
      showToast(e.response?.data?.message || 'Update failed.', 'error');
    }
  };

  const txt  = (v) => isDark ? '#F1F5F9' : v;
  const sub  = isDark ? '#94A3B8' : '#64748B';
  const bg   = isDark ? '#0F172A' : '#F8F7F4';
  const card = isDark ? '#111827' : '#FFFFFF';
  const bdr  = isDark ? '#334155' : '#E5E7EB';

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: '28px 28px 60px', fontFamily: "'Inter', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 2000,
          padding: '12px 20px', borderRadius: 12,
          background: toast.type === 'error' ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${toast.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
          color: toast.type === 'error' ? '#DC2626' : '#166534',
          fontSize: 13, fontWeight: 700,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#6366F1', marginBottom: 5 }}>
            Platform Management
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: txt('#0F172A'), lineHeight: 1.1 }}>Plans</div>
          <div style={{ marginTop: 6, fontSize: 13, color: sub }}>
            Manage subscription plans shown to tenants on the Billing page.
          </div>
        </div>
        <button
          onClick={handleAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
          }}
        >
          <Ico d={ICONS.plus} size={15} /> Add Plan
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Plans',  value: plans.length,                       accent: '#6366F1' },
          { label: 'Active',       value: plans.filter(p => p.is_active).length, accent: '#059669' },
          { label: 'Inactive',     value: plans.filter(p => !p.is_active).length, accent: '#DC2626' },
          { label: 'Popular',      value: plans.filter(p => p.is_popular).length, accent: '#F59E0B' },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{ flex: '1 1 140px', minWidth: 130, borderRadius: 16, background: card, border: `1px solid ${bdr}`, padding: '14px 18px', boxShadow: isDark ? '0 8px 24px rgba(2,6,23,0.3)' : '0 4px 14px rgba(15,23,42,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.75, color: sub }}>{label}</div>
            <div style={{ marginTop: 7, fontSize: 26, fontWeight: 900, lineHeight: 1, color: accent }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Plan Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: sub, fontSize: 14 }}>Loading plans…</div>
      ) : plans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: txt('#0F172A'), marginBottom: 8 }}>No plans yet</div>
          <div style={{ fontSize: 13, color: sub, marginBottom: 20 }}>Click "Add Plan" to create your first subscription plan.</div>
          <button onClick={handleAdd} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Add First Plan
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              dark={isDark}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <PlanModal
          plan={editPlan}
          onClose={() => { setShowModal(false); setEditPlan(null); }}
          onSaved={() => { load(); showToast(editPlan ? 'Plan updated.' : 'Plan created.'); }}
        />
      )}
    </div>
  );
}
