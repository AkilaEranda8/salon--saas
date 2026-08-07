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

const emptyAcct = {
  name: '',
  bank_name: '',
  account_number: '',
  is_cash: false,
  gl_account_id: '',
  opening_balance: '0',
};

export default function AccountingCashBankPage() {
  const { C } = usePageTheme();
  const [accounts, setAccounts] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [acctForm, setAcctForm] = useState(emptyAcct);
  const [savingAcct, setSavingAcct] = useState(false);
  const [form, setForm] = useState({
    bank_account_id: '', type: 'deposit', amount: '', date: new Date().toISOString().slice(0, 10), memo: '',
  });

  const load = async () => {
    try {
      const [a, t, gl] = await Promise.all([
        api.get('/accounting/bank-accounts'),
        api.get('/accounting/bank-txns'),
        api.get('/accounting/accounts'),
      ]);
      const bankRows = a.data || [];
      setAccounts(bankRows);
      setTxns(t.data || []);
      const assets = (gl.data || []).filter((x) => x.type === 'asset' && x.is_active !== false);
      setGlAccounts(assets.length ? assets : (gl.data || []));
      setForm((f) => {
        if (f.bank_account_id || !bankRows[0]) return f;
        return { ...f, bank_account_id: String(bankRows[0].id) };
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const submitAccount = async (e) => {
    e.preventDefault();
    if (!acctForm.name.trim()) {
      toast.error('Account name is required');
      return;
    }
    setSavingAcct(true);
    try {
      const { data: created } = await api.post('/accounting/bank-accounts', {
        name: acctForm.name.trim(),
        bank_name: acctForm.bank_name.trim() || null,
        account_number: acctForm.account_number.trim() || null,
        is_cash: !!acctForm.is_cash,
        gl_account_id: acctForm.gl_account_id ? Number(acctForm.gl_account_id) : null,
        opening_balance: Number(acctForm.opening_balance || 0),
      });
      toast.success('Bank account added');
      setAcctForm(emptyAcct);
      setForm((f) => ({ ...f, bank_account_id: String(created.id) }));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add account');
    } finally {
      setSavingAcct(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.bank_account_id) {
      toast.error('Add a bank account first');
      return;
    }
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

  const defaultGlHint = acctForm.is_cash
    ? glAccounts.find((g) => g.code === '1000')
    : glAccounts.find((g) => g.code === '1010');

  return (
    <AccountingLayout title="Cash & Bank">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Cash total" value={formatLkr(cashTotal)} color={ACCT.success} icon={<IconDollar />} />
        <StatCard label="Bank total" value={formatLkr(bankTotal)} color={ACCT.primary} icon={<IconBank />} />
        <StatCard label="Accounts" value={accounts.length} color={ACCT.cyan} icon={<IconBank />} />
      </div>

      <FormShell title="Add bank / cash account" accent={ACCT.primary}>
        <form onSubmit={submitAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
          <label style={lab(C)}>
            Account name *
            <input
              placeholder="e.g. HNB Current"
              value={acctForm.name}
              onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })}
              style={inputStyle(C)}
              required
            />
          </label>
          <label style={lab(C)}>
            Type
            <select
              value={acctForm.is_cash ? 'cash' : 'bank'}
              onChange={(e) => setAcctForm({ ...acctForm, is_cash: e.target.value === 'cash' })}
              style={inputStyle(C)}
            >
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          {!acctForm.is_cash && (
            <>
              <label style={lab(C)}>
                Bank name
                <input
                  placeholder="e.g. HNB"
                  value={acctForm.bank_name}
                  onChange={(e) => setAcctForm({ ...acctForm, bank_name: e.target.value })}
                  style={inputStyle(C)}
                />
              </label>
              <label style={lab(C)}>
                Account number
                <input
                  placeholder="Optional"
                  value={acctForm.account_number}
                  onChange={(e) => setAcctForm({ ...acctForm, account_number: e.target.value })}
                  style={inputStyle(C)}
                />
              </label>
            </>
          )}
          <label style={lab(C)}>
            Link GL account
            <select
              value={acctForm.gl_account_id}
              onChange={(e) => setAcctForm({ ...acctForm, gl_account_id: e.target.value })}
              style={inputStyle(C)}
            >
              <option value="">
                {defaultGlHint ? `Default · ${defaultGlHint.code} ${defaultGlHint.name}` : 'Use system default'}
              </option>
              {glAccounts.map((g) => (
                <option key={g.id} value={g.id}>{g.code} {g.name}</option>
              ))}
            </select>
          </label>
          <label style={lab(C)}>
            Opening balance
            <input
              type="number"
              step="0.01"
              value={acctForm.opening_balance}
              onChange={(e) => setAcctForm({ ...acctForm, opening_balance: e.target.value })}
              style={inputStyle(C)}
            />
          </label>
          <Button type="submit" disabled={savingAcct} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}>
            <IconPlus /> {savingAcct ? 'Saving…' : 'Add account'}
          </Button>
        </form>
      </FormShell>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
        {accounts.map((a) => (
          <SoftPanel
            key={a.id}
            accent={a.is_cash ? ACCT.success : ACCT.primary}
            bodyStyle={{ paddingTop: 12 }}
          >
            <div style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>{a.name}</div>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <StatusPill status={a.is_cash ? 'deposit' : 'open'}>{a.is_cash ? 'Cash' : 'Bank'}</StatusPill>
            </div>
            {(a.bank_name || a.account_number) && (
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 6 }}>
                {[a.bank_name, a.account_number].filter(Boolean).join(' · ')}
              </div>
            )}
            <div style={{
              fontSize: 20, fontWeight: 800, marginTop: 10,
              color: a.is_cash ? ACCT.success : ACCT.primary,
            }}>{formatLkr(a.balance)}</div>
          </SoftPanel>
        ))}
        {!accounts.length && (
          <div style={{ gridColumn: '1 / -1', padding: 16, color: '#98A2B3', fontSize: 13 }}>
            No cash/bank accounts yet — add one above.
          </div>
        )}
      </div>

      <FormShell title="Add bank / cash transaction" accent={ACCT.success}>
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <select value={form.bank_account_id} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })} style={inputStyle(C)} required>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle(C)}>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle(C)} />
          <input type="number" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle(C)} required />
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

function lab(C) {
  return { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: C.label };
}
