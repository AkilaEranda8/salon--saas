import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

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

  if (!settings) return <AccountingLayout title="VAT / Tax"><div style={{ color: C.muted }}>Loading…</div></AccountingLayout>;

  return (
    <AccountingLayout title="VAT / Tax">
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, maxWidth: 480, marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: C.text, marginBottom: 12 }}>
          <input type="checkbox" checked={!!settings.vat_enabled} onChange={(e) => setSettings({ ...settings, vat_enabled: e.target.checked })} />
          VAT enabled (inclusive on sales/expenses)
        </label>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: C.label }}>VAT rate %</div>
          <input type="number" step="0.001" value={settings.vat_rate} onChange={(e) => setSettings({ ...settings, vat_rate: e.target.value })} style={inp(C)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.label }}>Registration no.</div>
          <input value={settings.registration_no || ''} onChange={(e) => setSettings({ ...settings, registration_no: e.target.value })} style={inp(C)} />
        </div>
        <Button onClick={save}>Save tax settings</Button>
      </div>
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(120px,1fr))', gap: 10 }}>
          <Card C={C} label="Output VAT" value={formatLkr(summary.outputVat)} />
          <Card C={C} label="Input VAT" value={formatLkr(summary.inputVat)} />
          <Card C={C} label="Net payable" value={formatLkr(summary.netVatPayable)} />
        </div>
      )}
    </AccountingLayout>
  );
}

function Card({ C, label, value }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: C.label, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 6 }}>{value}</div>
    </div>
  );
}
function inp(C) {
  return { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.isDark ? '#0F172A' : '#fff', color: C.text };
}
