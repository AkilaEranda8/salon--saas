import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  FormShell, ListRow, ListShell, StatusPill, SoftPanel, inputStyle, ACCT, SectionTitle,
} from './AccountingUI';
import { StatCard, IconDollar, IconPlus } from '../../components/ui/PageKit';

const IconBank = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);

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

  const cashTotal = accounts.filter((a) => a.is_cash).reduce((s, a) => s + Number(a.balance || 0), 0);
  const bankTotal = accounts.filter((a) => !a.is_cash).reduce((s, a) => s + Number(a.balance || 0), 0);

  return (
    <AccountingLayout title="Cash & Bank">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Cash total" value={formatLkr(cashTotal)} color={ACCT.success} icon={<IconDollar />} />
        <StatCard label="Bank total" value={formatLkr(bankTotal)} color={ACCT.primary} icon={<IconBank />} />
        <StatCard label="Accounts" value={accounts.length} color={ACCT.cyan} icon={<IconBank />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
        {accounts.map((a) => (
          <SoftPanel
            key={a.id}
            accent={a.is_cash ? ACCT.success : ACCT.primary}
            bodyStyle={{ paddingTop: 12 }}
          >
            <div style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>{a.name}</div>
            <div style={{ marginTop: 6 }}>
              <StatusPill status={a.is_cash ? 'deposit' : 'open'}>{a.is_cash ? 'Cash' : 'Bank'}</StatusPill>
            </div>
            <div style={{
              fontSize: 20, fontWeight: 800, marginTop: 10,
              color: a.is_cash ? ACCT.success : ACCT.primary,
            }}>{formatLkr(a.balance)}</div>
          </SoftPanel>
        ))}
      </div>

      <FormShell title="Add bank / cash transaction" accent={ACCT.success}>
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <select value={form.bank_account_id} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })} style={inputStyle(C)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle(C)}>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle(C)} />
          <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle(C)} />
          <input placeholder="Memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ ...inputStyle(C), minWidth: 140 }} />
          <Button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconPlus /> Add txn</Button>
        </form>
      </FormShell>

      <SectionTitle color={ACCT.success}>Recent transactions</SectionTitle>
      <ListShell empty="No transactions" emptySub="Record a deposit or withdrawal above">
        {txns.map((t) => (
          <ListRow key={t.id}>
            <div>
              <div style={{ fontWeight: 700, color: '#101828' }}>{t.date} · {formatLkr(t.amount)}</div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{t.memo || '—'}</div>
            </div>
            <StatusPill status={t.type} />
          </ListRow>
        ))}
      </ListShell>
    </AccountingLayout>
  );
}
