import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  ListRow, ListShell, StatusPill, SoftPanel, inputStyle, ACCT, SectionTitle,
  HeroBanner, MoneyText, Field, ModalGrid,
} from './AccountingUI';
import { StatCard, IconDollar, IconPlus, PKModal } from '../../components/ui/PageKit';

const IconBank = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);

const emptyAcct = {
  name: '', bank_name: '', account_number: '', is_cash: false, gl_account_id: '', opening_balance: '0',
};

const emptyTxn = () => ({
  bank_account_id: '',
  type: 'deposit',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  memo: '',
  counterparty_gl_account_id: '',
  transfer_bank_account_id: '',
});

export default function AccountingCashBankPage() {
  const { C } = usePageTheme();
  const [accounts, setAccounts] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [showAcctForm, setShowAcctForm] = useState(false);
  const [showTxnForm, setShowTxnForm] = useState(false);
  const [acctForm, setAcctForm] = useState(emptyAcct);
  const [savingAcct, setSavingAcct] = useState(false);
  const [savingTxn, setSavingTxn] = useState(false);
  const [form, setForm] = useState(emptyTxn());

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
      setGlAccounts(gl.data || []);
      setForm((f) => {
        if (f.bank_account_id || !bankRows[0]) return f;
        return { ...f, bank_account_id: String(bankRows[0].id) };
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const openAcctModal = () => {
    setAcctForm(emptyAcct);
    setShowAcctForm(true);
  };
  const openTxnModal = () => {
    setForm({
      ...emptyTxn(),
      bank_account_id: accounts[0] ? String(accounts[0].id) : '',
    });
    setShowTxnForm(true);
  };

  const submitAccount = async () => {
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
      setShowAcctForm(false);
      setForm((f) => ({ ...f, bank_account_id: String(created.id) }));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add account');
    } finally {
      setSavingAcct(false);
    }
  };

  const submitTxn = async () => {
    if (!form.bank_account_id) {
      toast.error('Add a bank account first');
      return;
    }
    if (form.type === 'transfer' && !form.transfer_bank_account_id) {
      toast.error('Select destination account');
      return;
    }
    if (!(Number(form.amount) > 0)) {
      toast.error('Enter amount');
      return;
    }
    setSavingTxn(true);
    try {
      await api.post('/accounting/bank-txns', {
        bank_account_id: Number(form.bank_account_id),
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        memo: form.memo,
        counterparty_gl_account_id: form.counterparty_gl_account_id
          ? Number(form.counterparty_gl_account_id) : null,
        transfer_bank_account_id: form.transfer_bank_account_id
          ? Number(form.transfer_bank_account_id) : null,
      });
      toast.success('Saved');
      setShowTxnForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSavingTxn(false);
    }
  };

  const cashTotal = accounts.filter((a) => a.is_cash).reduce((s, a) => s + Number(a.balance || 0), 0);
  const bankTotal = accounts.filter((a) => !a.is_cash).reduce((s, a) => s + Number(a.balance || 0), 0);

  return (
    <AccountingLayout
      title="Cash & Bank"
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={openAcctModal} style={{ fontSize: 12 }}>Add account</Button>
          <Button variant="primary" onClick={openTxnModal} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <IconPlus /> Add txn
          </Button>
        </div>
      )}
    >
      <HeroBanner
        title="Liquidity"
        subtitle="Cash drawer + bank accounts"
        accent={ACCT.success}
        right={<MoneyText value={cashTotal + bankTotal} color={ACCT.success} size={22} weight={800} />}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Cash total" value={formatLkr(cashTotal)} color={ACCT.success} icon={<IconDollar />} />
        <StatCard label="Bank total" value={formatLkr(bankTotal)} color={ACCT.primary} icon={<IconBank />} />
        <StatCard label="Accounts" value={accounts.length} color={ACCT.cyan} icon={<IconBank />} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
        {accounts.map((a) => (
          <SoftPanel key={a.id} accent={a.is_cash ? ACCT.success : ACCT.primary} bodyStyle={{ paddingTop: 12 }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{a.name}</div>
            <div style={{ marginTop: 6 }}>
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
            No cash/bank accounts yet — click Add account.
          </div>
        )}
      </div>

      <SectionTitle color={ACCT.success}>Recent transactions</SectionTitle>
      <ListShell empty="No transactions" emptySub="Click Add txn to record a deposit, withdrawal, or transfer">
        {txns.map((t) => (
          <ListRow key={t.id}>
            <div>
              <div style={{ fontWeight: 700, color: C.text }}>{t.date} · {formatLkr(t.amount)}</div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{t.memo || '—'}</div>
            </div>
            <StatusPill status={t.type} />
          </ListRow>
        ))}
      </ListShell>

      <PKModal
        open={showAcctForm}
        onClose={() => setShowAcctForm(false)}
        title="Add bank / cash account"
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowAcctForm(false)}>Cancel</Button>
            <Button variant="primary" loading={savingAcct} onClick={submitAccount}>Add account</Button>
          </>
        )}
      >
        <ModalGrid>
          <Field label="Account name" required full>
            <input placeholder="e.g. HNB Current" value={acctForm.name} onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          <Field label="Type" required>
            <select value={acctForm.is_cash ? 'cash' : 'bank'} onChange={(e) => setAcctForm({ ...acctForm, is_cash: e.target.value === 'cash' })} style={{ ...inputStyle(C), width: '100%' }}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </Field>
          <Field label="Opening balance">
            <input type="number" step="0.01" value={acctForm.opening_balance} onChange={(e) => setAcctForm({ ...acctForm, opening_balance: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          {!acctForm.is_cash && (
            <>
              <Field label="Bank name">
                <input placeholder="e.g. HNB" value={acctForm.bank_name} onChange={(e) => setAcctForm({ ...acctForm, bank_name: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
              </Field>
              <Field label="Account number">
                <input placeholder="Optional" value={acctForm.account_number} onChange={(e) => setAcctForm({ ...acctForm, account_number: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
              </Field>
            </>
          )}
          <Field label="Link GL (optional)" full>
            <select value={acctForm.gl_account_id} onChange={(e) => setAcctForm({ ...acctForm, gl_account_id: e.target.value })} style={{ ...inputStyle(C), width: '100%' }}>
              <option value="">Auto-create unique GL</option>
              {glAccounts.filter((g) => g.type === 'asset').map((g) => (
                <option key={g.id} value={g.id}>{g.code} {g.name}</option>
              ))}
            </select>
          </Field>
        </ModalGrid>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>
          Opening balance posts to Owner Equity. Leave GL blank for a unique ledger.
        </div>
      </PKModal>

      <PKModal
        open={showTxnForm}
        onClose={() => setShowTxnForm(false)}
        title="Add bank / cash transaction"
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowTxnForm(false)}>Cancel</Button>
            <Button variant="primary" loading={savingTxn} onClick={submitTxn}>Save txn</Button>
          </>
        )}
      >
        <ModalGrid>
          <Field label="Account" required>
            <select value={form.bank_account_id} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })} style={{ ...inputStyle(C), width: '100%' }}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Type" required>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ ...inputStyle(C), width: '100%' }}>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="transfer">Transfer</option>
            </select>
          </Field>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          <Field label="Amount" required>
            <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          {form.type === 'transfer' ? (
            <Field label="To account" required full>
              <select value={form.transfer_bank_account_id} onChange={(e) => setForm({ ...form, transfer_bank_account_id: e.target.value })} style={{ ...inputStyle(C), width: '100%' }}>
                <option value="">Select destination</option>
                {accounts.filter((a) => String(a.id) !== String(form.bank_account_id)).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Counterparty GL" full>
              <select value={form.counterparty_gl_account_id} onChange={(e) => setForm({ ...form, counterparty_gl_account_id: e.target.value })} style={{ ...inputStyle(C), width: '100%' }}>
                <option value="">
                  {form.type === 'deposit' ? 'Owner Equity (default)' : 'Expense (default)'}
                </option>
                {glAccounts.map((g) => (
                  <option key={g.id} value={g.id}>{g.code} {g.name} ({g.type})</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Memo" full>
            <input placeholder="Optional note" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
        </ModalGrid>
      </PKModal>
    </AccountingLayout>
  );
}
