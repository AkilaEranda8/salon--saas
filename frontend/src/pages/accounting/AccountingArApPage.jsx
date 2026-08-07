import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

export default function AccountingArApPage() {
  const { C } = usePageTheme();
  const [tab, setTab] = useState('ar');
  const [ar, setAr] = useState([]);
  const [ap, setAp] = useState([]);
  const [form, setForm] = useState({
    name: '', no: '', date: new Date().toISOString().slice(0, 10), amount: '',
  });

  const load = async () => {
    try {
      const [a, b] = await Promise.all([api.get('/accounting/ar'), api.get('/accounting/ap')]);
      setAr(a.data || []);
      setAp(b.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      if (tab === 'ar') {
        await api.post('/accounting/ar', {
          customer_name: form.name,
          invoice_no: form.no || `INV-${Date.now()}`,
          date: form.date,
          amount: form.amount,
        });
      } else {
        await api.post('/accounting/ap', {
          supplier_name: form.name,
          bill_no: form.no || `BILL-${Date.now()}`,
          date: form.date,
          amount: form.amount,
        });
      }
      toast.success('Created');
      setForm((f) => ({ ...f, name: '', no: '', amount: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    }
  };

  const settle = async (id) => {
    try {
      await api.post(`/accounting/${tab}/${id}/settle`);
      toast.success('Settled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Settle failed');
    }
  };

  const rows = tab === 'ar' ? ar : ap;

  return (
    <AccountingLayout title="AR / AP">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setTab('ar')} style={tabBtn(C, tab === 'ar')}>Receivable</button>
        <button type="button" onClick={() => setTab('ap')} style={tabBtn(C, tab === 'ap')}>Payable</button>
      </div>
      <form onSubmit={create} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <input placeholder={tab === 'ar' ? 'Customer' : 'Supplier'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp(C)} />
        <input placeholder="Doc no" value={form.no} onChange={(e) => setForm({ ...form, no: e.target.value })} style={inp(C)} />
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp(C)} />
        <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp(C)} />
        <Button type="submit">Add</Button>
      </form>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: C.text }}>
                {tab === 'ar' ? r.invoice_no : r.bill_no} · {tab === 'ar' ? r.customer_name : r.supplier_name}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>{r.date} · {formatLkr(r.amount)} · {r.status}</div>
            </div>
            {r.status === 'open' && <Button variant="secondary" onClick={() => settle(r.id)}>Mark paid</Button>}
          </div>
        ))}
        {!rows.length && <div style={{ padding: 16, color: C.muted }}>No documents.</div>}
      </div>
    </AccountingLayout>
  );
}

function tabBtn(C, on) {
  return { padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: on ? '#2563EB' : C.cardBg, color: on ? '#fff' : C.text, fontWeight: 600, cursor: 'pointer' };
}
function inp(C) {
  return { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.isDark ? '#0F172A' : '#fff', color: C.text };
}
