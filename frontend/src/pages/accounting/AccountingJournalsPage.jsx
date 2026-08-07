import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  FormShell, ListRow, ListShell, StatusPill, inputStyle, ACCT, SectionTitle,
} from './AccountingUI';
import { StatCard, IconReceipt, IconPlus } from '../../components/ui/PageKit';

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
  const posted = list.filter((j) => j.status === 'posted').length;
  const voided = list.filter((j) => j.status === 'voided' || j.status === 'void').length;

  return (
    <AccountingLayout title="GL Journals">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Journals" value={list.length} color={ACCT.purple} icon={<IconReceipt />} />
        <StatCard label="Posted" value={posted} color={ACCT.success} icon={<IconReceipt />} />
        <StatCard label="Voided" value={voided} color={ACCT.danger} icon={<IconReceipt />} />
      </div>

      <FormShell title="Post manual journal" accent={ACCT.purple}>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.label }}>
            Date
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle(C)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.label }}>
            Memo
            <input placeholder="What is this for?" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={inputStyle(C)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.label }}>
            Debit
            <select value={form.debitAccount} onChange={(e) => setForm({ ...form, debitAccount: e.target.value })} style={inputStyle(C)}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.label }}>
            Credit
            <select value={form.creditAccount} onChange={(e) => setForm({ ...form, creditAccount: e.target.value })} style={inputStyle(C)}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.label }}>
            Amount
            <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle(C)} />
          </label>
          <Button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
            <IconPlus /> Post journal
          </Button>
        </form>
      </FormShell>

      <SectionTitle color={ACCT.purple}>Journal list</SectionTitle>
      <ListShell empty="No journals" emptySub="Post a manual entry or wait for auto-posts">
        {list.map((j) => {
          const total = (j.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
          return (
            <ListRow key={j.id}>
              <div>
                <div style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>
                  #{j.id} · {j.date} · <span style={{ color: ACCT.primary }}>{formatLkr(total)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{j.memo || j.source_type || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusPill status={j.status} />
                {j.status === 'posted' && (
                  <Button variant="secondary" onClick={() => voidOne(j.id)} style={{ fontSize: 12 }}>Void</Button>
                )}
              </div>
            </ListRow>
          );
        })}
      </ListShell>
    </AccountingLayout>
  );
}
