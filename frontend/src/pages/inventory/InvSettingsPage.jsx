import { useEffect, useState } from 'react';
import api from '../../api/axios';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { INV_API } from './invApi';

const FIELDS = [
  { key: 'enable_day_end_consumption', label: 'Enable Day End Consumption', help: 'Usage stays pending until manager confirms day-end deduction.' },
  { key: 'enable_auto_deduction', label: 'Enable Auto Deduction', help: 'If on (and day-end off), consumption reduces stock immediately.' },
  { key: 'allow_negative_stock', label: 'Allow Negative Stock', help: 'Default off — never go below zero.' },
  { key: 'manager_approval_required', label: 'Manager Approval for Adjustments', help: 'Staff adjustments stay pending until approved.' },
  { key: 'low_stock_notification', label: 'Low Stock Notification', help: 'Show low-stock alerts on dashboard.' },
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

  if (!form) return <div style={{ color: '#98A2B3' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, padding: 16 }}>
        {FIELDS.map((f) => (
          <label key={f.key} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            padding: '14px 0', borderBottom: '1px solid #F2F4F7', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={!!form[f.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.checked }))}
              style={{ marginTop: 3, width: 16, height: 16 }}
            />
            <span>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{f.help}</div>
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
