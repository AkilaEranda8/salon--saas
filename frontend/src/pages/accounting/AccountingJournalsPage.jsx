import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

export default function AccountingJournalsPage() {
  const { C } = usePageTheme();
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    memo: '',
    debitAccount: '',
    creditAccount: '',
    amount: '',
  });

  const load = async () => {
    try {
      const [j, a] = await Promise.all([
        api.get('/accounting/journals', { params: { limit: 100 } }),
        api.get('/accounting/accounts'),
      ]);
      setRows(j.data?.rows || j.data?.data || j.data || []);
      setAccounts(a.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load journals');
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!form.debitAccount || !form.creditAccount || !(amt > 0)) {
      toast.error('Fill debit, credit, and amount');
      return;
    }
    try {
      await api.post('/accounting/journals', {
        date: form.date,
        memo: form.memo,
        lines: [
          { account_id: Number(form.debitAccount), debit: amt, credit: 0 },
          { account_id: Number(form.creditAccount), debit: 0, credit: amt },
        ],
      });
      toast.success('Journal posted');
      setForm((f) => ({ ...f, memo: '', amount: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Post failed');
    }
  };

  const voidOne = async (id) => {
    if (!window.confirm('Void this journal?')) return;
    try {
      await api.post(`/accounting/journals/${id}/void`, { reason: 'Voided from UI' });
      toast.success('Voided');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Void failed');
    }
  };

  const list = Array.isArray(rows) ? rows : (rows.rows || []);

  return (
    <AccountingLayout title="GL Journals">
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 20, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp(C)} />
        <input placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={inp(C)} />
        <select value={form.debitAccount} onChange={(e) => setForm({ ...form, debitAccount: e.target.value })} style={inp(C)}>
          <option value="">Debit account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
        <select value={form.creditAccount} onChange={(e) => setForm({ ...form, creditAccount: e.target.value })} style={inp(C)}>
          <option value="">Credit account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
        </select>
        <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inp(C)} />
        <Button type="submit">Post journal</Button>
      </form>

      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        {list.map((j) => {
          const total = (j.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
          return (
            <div key={j.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, color: C.text }}>#{j.id} · {j.date} · {formatLkr(total)}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{j.memo || j.source_type || '—'} · {j.status}</div>
              </div>
              {j.status === 'posted' && <Button variant="secondary" onClick={() => voidOne(j.id)}>Void</Button>}
            </div>
          );
        })}
        {!list.length && <div style={{ padding: 16, color: C.muted }}>No journals.</div>}
      </div>
    </AccountingLayout>
  );
}

function inp(C) {
  return {
    padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.isDark ? '#0F172A' : '#fff', color: C.text, fontSize: 13,
  };
}
