import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  FormShell, ListRow, ListShell, SectionTitle, StatusPill, TypeChip, inputStyle, ACCT,
} from './AccountingUI';
import { StatCard, IconReceipt } from '../../components/ui/PageKit';

const TYPE_COLORS = {
  asset: ['#EFF6FF', '#1D4ED8'],
  liability: ['#FEF2F2', '#B91C1C'],
  equity: ['#F5F3FF', '#6D28D9'],
  revenue: ['#ECFDF5', '#047857'],
  expense: ['#FFF7ED', '#C2410C'],
};

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

  if (!settings) {
    return <AccountingLayout title="Settings"><div style={{ padding: 16, color: '#98A2B3' }}>Loading…</div></AccountingLayout>;
  }

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

  const autoFlags = [
    ['auto_post_payments', 'Auto-post payments', ACCT.success],
    ['auto_post_expenses', 'Auto-post expenses', ACCT.danger],
    ['auto_post_payroll', 'Auto-post payroll', ACCT.warning],
  ];

  return (
    <AccountingLayout title="Settings">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Chart accounts" value={accounts.length} color={ACCT.primary} icon={<IconReceipt />} />
      </div>

      <FormShell title="Auto-post & defaults" accent={ACCT.primary} style={{ maxWidth: 560 }}>
        {autoFlags.map(([k, label, color]) => (
          <label
            key={k}
            style={{
              display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10,
              padding: '10px 12px', borderRadius: 10,
              background: settings[k] ? `${color}14` : (C.isDark ? '#172033' : '#F8FAFC'),
              border: `1px solid ${settings[k] ? `${color}44` : C.border}`,
              color: C.text, fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={!!settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.checked })} />
            {label}
            <span style={{ marginLeft: 'auto' }}>
              <StatusPill status={settings[k] ? 'posted' : 'closed'}>{settings[k] ? 'On' : 'Off'}</StatusPill>
            </span>
          </label>
        ))}

        {fields.map(([k, label]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.label, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
            <select value={settings[k] || ''} onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) || null })} style={{ ...inputStyle(C), width: '100%' }}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </div>
        ))}
        <Button onClick={save}>Save settings</Button>
      </FormShell>

      <SectionTitle color={ACCT.cyan}>Chart of accounts</SectionTitle>
      <ListShell empty="No accounts">
        {accounts.map((a) => (
          <ListRow key={a.id}>
            <div>
              <div style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>
                <span style={{ color: ACCT.primary, marginRight: 8 }}>{a.code}</span>
                {a.name}
              </div>
              {a.is_system && (
                <div style={{ marginTop: 4 }}>
                  <StatusPill status="closed">System</StatusPill>
                </div>
              )}
            </div>
            <TypeChip type={a.type} map={TYPE_COLORS} />
          </ListRow>
        ))}
      </ListShell>
    </AccountingLayout>
  );
}
