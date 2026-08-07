import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  FormShell, ListRow, ListShell, StatusPill, inputStyle, ACCT, SectionTitle,
} from './AccountingUI';
import { StatCard, IconDollar, IconPlus } from '../../components/ui/PageKit';

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

  const expenses = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <AccountingLayout title="Petty Cash">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Float balance" value={formatLkr(balance)} color="#EA580C" icon={<IconDollar />} />
        <StatCard label="Entries" value={rows.length} color={ACCT.primary} icon={<IconDollar />} />
        <StatCard label="Expense total" value={formatLkr(expenses)} color={ACCT.danger} icon={<IconDollar />} />
      </div>

      <FormShell title="Record petty cash movement" accent="#EA580C">
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle(C)}>
            <option value="float_in">Float in</option>
            <option value="float_out">Float out</option>
            <option value="expense">Expense</option>
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle(C)} />
          <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle(C)} />
          <input placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ ...inputStyle(C), minWidth: 140 }} />
          <Button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPlus /> Add</Button>
        </form>
      </FormShell>

      <SectionTitle color="#EA580C">Petty cash log</SectionTitle>
      <ListShell empty="No petty cash entries" emptySub="Add a float or expense above">
        {rows.map((r) => (
          <ListRow key={r.id}>
            <div>
              <div style={{ fontWeight: 700, color: '#101828' }}>
                {r.date} · <span style={{ color: r.type === 'expense' ? ACCT.danger : ACCT.success }}>{formatLkr(r.amount)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{r.memo || '—'}</div>
            </div>
            <StatusPill status={r.type} />
          </ListRow>
        ))}
      </ListShell>
    </AccountingLayout>
  );
}
