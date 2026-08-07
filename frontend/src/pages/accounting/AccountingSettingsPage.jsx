import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

export default function AccountingSettingsPage() {
  const { C } = usePageTheme();
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState([]);

  const load = async () => {
    try {
      const [s, a] = await Promise.all([
        api.get('/accounting/settings'),
        api.get('/accounting/accounts'),
      ]);
      setSettings(s.data);
      setAccounts(a.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.put('/accounting/settings', settings);
      toast.success('Settings saved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  if (!settings) return <AccountingLayout title="Settings"><div style={{ color: C.muted }}>Loading…</div></AccountingLayout>;

  const fields = [
    ['default_cash_account_id', 'Default cash'],
    ['default_bank_account_id', 'Default bank'],
    ['default_revenue_account_id', 'Default revenue'],
    ['default_expense_account_id', 'Default expense'],
    ['default_payroll_account_id', 'Default payroll'],
    ['default_ar_account_id', 'Default AR'],
    ['default_ap_account_id', 'Default AP'],
    ['default_petty_account_id', 'Default petty cash'],
  ];

  return (
    <AccountingLayout title="Settings">
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, maxWidth: 560 }}>
        {['auto_post_payments', 'auto_post_expenses', 'auto_post_payroll'].map((k) => (
          <label key={k} style={{ display: 'flex', gap: 8, marginBottom: 10, color: C.text }}>
            <input type="checkbox" checked={!!settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.checked })} />
            {k.replace(/_/g, ' ')}
          </label>
        ))}
        {fields.map(([k, label]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.label }}>{label}</div>
            <select value={settings[k] || ''} onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) || null })} style={inp(C)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </div>
        ))}
        <Button onClick={save}>Save settings</Button>
      </div>
      <h3 style={{ color: C.text, marginTop: 20 }}>Chart of accounts</h3>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {accounts.map((a) => (
          <div key={a.id} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 13 }}>
            <strong>{a.code}</strong> {a.name} · {a.type}{a.is_system ? ' · system' : ''}
          </div>
        ))}
      </div>
    </AccountingLayout>
  );
}
function inp(C) {
  return { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.isDark ? '#0F172A' : '#fff', color: C.text };
}
