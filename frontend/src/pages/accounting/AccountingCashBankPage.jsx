import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

export default function AccountingCashBankPage() {
  const { C } = usePageTheme();
  const [accounts, setAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [form, setForm] = useState({
    bank_account_id: '', type: 'deposit', amount: '', date: new Date().toISOString().slice(0, 10), memo: '',
  });

  const load = async () => {
    try {
      const [a, t] = await Promise.all([
        api.get('/accounting/bank-accounts'),
        api.get('/accounting/bank-txns'),
      ]);
      setAccounts(a.data || []);
      setTxns(t.data || []);
      if (!form.bank_account_id && a.data?.[0]) {
        setForm((f) => ({ ...f, bank_account_id: String(a.data[0].id) }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/accounting/bank-txns', {
        ...form,
        bank_account_id: Number(form.bank_account_id),
        amount: Number(form.amount),
      });
      toast.success('Saved');
      setForm((f) => ({ ...f, amount: '', memo: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <AccountingLayout title="Cash & Bank">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 16 }}>
        {accounts.map((a) => (
          <div key={a.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 700, color: C.text }}>{a.name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{a.is_cash ? 'Cash' : 'Bank'}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6, color: C.text }}>{formatLkr(a.balance)}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={form.bank_account_id} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })} style={inp(C)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inp(C)}>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp(C)} />
        <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp(C)} />
        <input placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={inp(C)} />
        <Button type="submit">Add txn</Button>
      </form>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {txns.map((t) => (
          <div key={t.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}`, color: C.text }}>
            <strong>{t.date}</strong> · {t.type} · {formatLkr(t.amount)} · {t.memo || '—'}
          </div>
        ))}
        {!txns.length && <div style={{ padding: 16, color: C.muted }}>No transactions.</div>}
      </div>
    </AccountingLayout>
  );
}

function inp(C) {
  return { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.isDark ? '#0F172A' : '#fff', color: C.text };
}
