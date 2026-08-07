import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

export default function AccountingPettyCashPage() {
  const { C } = usePageTheme();
  const [balance, setBalance] = useState(0);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    type: 'expense', amount: '', date: new Date().toISOString().slice(0, 10), memo: '',
  });

  const load = async () => {
    try {
      const { data } = await api.get('/accounting/petty-cash');
      setBalance(data.balance || 0);
      setRows(data.rows || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/accounting/petty-cash', { ...form, amount: Number(form.amount) });
      toast.success('Saved');
      setForm((f) => ({ ...f, amount: '', memo: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <AccountingLayout title="Petty Cash">
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 14 }}>Float: {formatLkr(balance)}</div>
      <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inp(C)}>
          <option value="float_in">Float in</option>
          <option value="float_out">Float out</option>
          <option value="expense">Expense</option>
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp(C)} />
        <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp(C)} />
        <input placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={inp(C)} />
        <Button type="submit">Add</Button>
      </form>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}`, color: C.text }}>
            {r.date} · {r.type} · {formatLkr(r.amount)} · {r.memo || '—'}
          </div>
        ))}
        {!rows.length && <div style={{ padding: 16, color: C.muted }}>No petty cash entries.</div>}
      </div>
    </AccountingLayout>
  );
}
function inp(C) {
  return { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.isDark ? '#0F172A' : '#fff', color: C.text };
}
