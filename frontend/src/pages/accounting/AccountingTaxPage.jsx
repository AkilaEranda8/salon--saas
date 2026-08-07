import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import { FormShell, SoftPanel, StatusPill, inputStyle, ACCT } from './AccountingUI';
import { StatCard, IconDollar, IconReceipt } from '../../components/ui/PageKit';

export default function AccountingTaxPage() {
  const { C } = usePageTheme();
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);

  const load = async () => {
    try {
      const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      const [s, sum] = await Promise.all([
        api.get('/accounting/tax'),
        api.get('/accounting/tax/summary', { params: { from, to } }),
      ]);
      setSettings(s.data);
      setSummary(sum.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.put('/accounting/tax', {
        vat_enabled: !!settings.vat_enabled,
        vat_rate: Number(settings.vat_rate),
        registration_no: settings.registration_no,
      });
      toast.success('Saved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
  };

  if (!settings) {
    return <AccountingLayout title="VAT / Tax"><div style={{ padding: 16, color: '#98A2B3' }}>Loading…</div></AccountingLayout>;
  }

  return (
    <AccountingLayout title="VAT / Tax">
      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatCard label="Output VAT" value={formatLkr(summary.outputVat)} color={ACCT.danger} icon={<IconReceipt />} />
          <StatCard label="Input VAT" value={formatLkr(summary.inputVat)} color={ACCT.success} icon={<IconDollar />} />
          <StatCard label="Net payable" value={formatLkr(summary.netVatPayable)} color={ACCT.warning} icon={<IconDollar />} />
        </div>
      )}

      <FormShell title="Tax settings" accent={ACCT.danger} style={{ maxWidth: 520 }}>
        <label style={{
          display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14,
          padding: '10px 12px', borderRadius: 10,
          background: settings.vat_enabled ? '#FEF2F2' : (C.isDark ? '#172033' : '#F8FAFC'),
          border: `1px solid ${settings.vat_enabled ? '#FECACA' : C.border}`,
          color: C.text, fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={!!settings.vat_enabled} onChange={(e) => setSettings({ ...settings, vat_enabled: e.target.checked })} />
          VAT enabled (inclusive on sales / expenses)
          <span style={{ marginLeft: 'auto' }}>
            <StatusPill status={settings.vat_enabled ? 'posted' : 'closed'}>
              {settings.vat_enabled ? 'On' : 'Off'}
            </StatusPill>
          </span>
        </label>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.label, marginBottom: 4, textTransform: 'uppercase' }}>VAT rate %</div>
          <input type="number" step="0.001" value={settings.vat_rate} onChange={(e) => setSettings({ ...settings, vat_rate: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.label, marginBottom: 4, textTransform: 'uppercase' }}>Registration no.</div>
          <input value={settings.registration_no || ''} onChange={(e) => setSettings({ ...settings, registration_no: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
        </div>
        <Button onClick={save}>Save tax settings</Button>
      </FormShell>

      <SoftPanel accent={ACCT.warning} title="This month" subtitle="Output − Input = net VAT payable">
        <div style={{ fontSize: 13, color: C.muted }}>
          Figures above update when journals with VAT lines are posted for the current month.
        </div>
      </SoftPanel>
    </AccountingLayout>
  );
}
