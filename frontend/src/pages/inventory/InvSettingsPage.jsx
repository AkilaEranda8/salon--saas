import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { INV_API } from './invApi';

const EDITABLE_FIELDS = [
  { key: 'allow_negative_stock', label: 'Allow Negative Stock', help: 'Default off — never go below zero.' },
  { key: 'low_stock_notification', label: 'Low Stock Notification', help: 'Show low-stock alerts on dashboard.' },
];

const LOCKED_RULES = [
  { label: 'Day End Consumption', help: 'Usage stays pending and stock is deducted only after Day End Closing.' },
  { label: 'No Immediate Auto Deduction', help: 'Recording consumption never reduces stock immediately.' },
  { label: 'No Approval Workflow', help: 'Adjustments and Day End Closing apply without a separate approval step.' },
  { label: 'Consumable Only', help: 'Only Consumable products can be consumed. Equipment cannot.' },
];

export default function InvSettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`${INV_API}/settings`)
      .then((r) => setForm(r.data))
      .catch(() => toast.error('Failed to load settings'));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put(`${INV_API}/settings`, form);
      setForm(r.data);
      toast.success('Settings saved');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  if (!form) {
    return <div style={{ color: 'var(--app-text-muted, #98A2B3)', fontFamily: "'Inter',sans-serif" }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 640, display: 'grid', gap: 14 }}>
      <div style={{
        background: 'var(--app-panel, #fff)',
        border: '1px solid var(--app-border, #EAECF0)',
        borderRadius: 14,
        padding: 16,
        boxShadow: 'var(--app-shadow, 0 2px 8px rgba(16,24,40,0.06))',
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--app-text, #101828)', marginBottom: 8, fontFamily: "'Inter',sans-serif" }}>
          Locked inventory rules
        </div>
        {LOCKED_RULES.map((f, idx) => (
          <div
            key={f.label}
            style={{
              padding: '12px 0',
              borderBottom: idx === LOCKED_RULES.length - 1
                ? 'none'
                : '1px solid var(--app-border, #F2F4F7)',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--app-text, #101828)' }}>{f.label}</div>
            <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)', marginTop: 2 }}>{f.help}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--app-panel, #fff)',
        border: '1px solid var(--app-border, #EAECF0)',
        borderRadius: 14,
        padding: 16,
        boxShadow: 'var(--app-shadow, 0 2px 8px rgba(16,24,40,0.06))',
      }}>
        {EDITABLE_FIELDS.map((f, idx) => (
          <label
            key={f.key}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '14px 0',
              borderBottom: idx === EDITABLE_FIELDS.length - 1
                ? 'none'
                : '1px solid var(--app-border, #F2F4F7)',
              cursor: 'pointer',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            <input
              type="checkbox"
              checked={!!form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.checked }))}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--app-accent, #2563EB)' }}
            />
            <span>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--app-text, #101828)' }}>{f.label}</div>
              <div style={{ fontSize: 12, color: 'var(--app-text-muted, #98A2B3)', marginTop: 2 }}>{f.help}</div>
            </span>
          </label>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="primary" loading={saving} onClick={save}>Save Settings</Button>
        </div>
      </div>
    </div>
  );
}
