import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  FormShell, ListShell, StatusPill, SoftPanel, inputStyle, ACCT, SectionTitle,
  SearchField, MoneyText, TypeChip,
} from './AccountingUI';
import { StatCard, IconReceipt, IconPlus } from '../../components/ui/PageKit';

const SOURCE_COLORS = {
  payment: ['#ECFDF5', '#047857'],
  expense: ['#FFF7ED', '#C2410C'],
  bank_txn: ['#EFF6FF', '#1D4ED8'],
  bank_opening: ['#F5F3FF', '#6D28D9'],
  petty_cash: ['#FFFBEB', '#B45309'],
  commission_payout: ['#FDF2F8', '#BE185D'],
  staff_advance: ['#EEF2FF', '#4338CA'],
  ar_invoice: ['#FEF3C7', '#B45309'],
  ap_bill: ['#FEE2E2', '#B91C1C'],
  manual: ['#F1F5F9', '#475467'],
};

export default function AccountingJournalsPage() {
  const { C } = usePageTheme();
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openForm, setOpenForm] = useState(false);
  const [openId, setOpenId] = useState(null);
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
      setOpenForm(false);
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((j) => {
      if (statusFilter !== 'all' && String(j.status) !== statusFilter) return false;
      if (!needle) return true;
      const hay = `${j.id} ${j.date} ${j.memo || ''} ${j.source_type || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [list, q, statusFilter]);

  const acctName = (id) => {
    const a = accounts.find((x) => Number(x.id) === Number(id));
    return a ? `${a.code} ${a.name}` : `#${id}`;
  };

  return (
    <AccountingLayout
      title="GL Journals"
      actions={(
        <Button
          variant="primary"
          onClick={() => setOpenForm((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconPlus /> {openForm ? 'Hide form' : 'Post journal'}
        </Button>
      )}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Journals" value={list.length} color={ACCT.purple} icon={<IconReceipt />} />
        <StatCard label="Posted" value={posted} color={ACCT.success} icon={<IconReceipt />} />
        <StatCard label="Voided" value={voided} color={ACCT.danger} icon={<IconReceipt />} />
      </div>

      {openForm && (
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
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <SearchField value={q} onChange={setQ} placeholder="Search memo, source, id…" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle(C)}>
          <option value="all">All statuses</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      <SectionTitle color={ACCT.purple}>
        Journal list
        <span style={{ fontWeight: 600, color: C.muted, fontSize: 12, marginLeft: 6 }}>({filtered.length})</span>
      </SectionTitle>

      <ListShell empty="No journals" emptySub="Post a manual entry or wait for auto-posts">
        {filtered.map((j) => {
          const total = (j.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
          const expanded = openId === j.id;
          const src = String(j.source_type || 'manual').replace(/^voided:/, '');
          return (
            <div key={j.id} style={{ borderBottom: `1px solid ${C.rowBorder || C.border}` }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(expanded ? null : j.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(expanded ? null : j.id); }}
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  background: expanded ? (C.isDark ? '#172033' : '#F8FAFC') : 'transparent',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span>#{j.id}</span>
                    <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>{j.date}</span>
                    <MoneyText value={total} />
                    <TypeChip type={src} map={SOURCE_COLORS} />
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{j.memo || '—'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                  <StatusPill status={j.status} />
                  {j.status === 'posted' && (
                    <Button variant="secondary" onClick={() => voidOne(j.id)} style={{ fontSize: 12 }}>Void</Button>
                  )}
                  <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>{expanded ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded && (
                <div style={{ padding: '0 16px 14px' }}>
                  <SoftPanel accent={ACCT.purple} title="Lines" bodyStyle={{ paddingTop: 8, paddingBottom: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: C.label }}>
                          <th style={{ textAlign: 'left', padding: '6px 4px' }}>Account</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px' }}>Debit</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px' }}>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(j.lines || []).map((l) => (
                          <tr key={l.id || `${l.account_id}-${l.debit}-${l.credit}`}>
                            <td style={{ padding: '7px 4px', color: C.text, fontWeight: 600 }}>
                              {l.account ? `${l.account.code} ${l.account.name}` : acctName(l.account_id)}
                            </td>
                            <td style={{ padding: '7px 4px', textAlign: 'right', color: Number(l.debit) > 0 ? ACCT.primary : C.muted }}>
                              {Number(l.debit) > 0 ? formatLkr(l.debit) : '—'}
                            </td>
                            <td style={{ padding: '7px 4px', textAlign: 'right', color: Number(l.credit) > 0 ? ACCT.success : C.muted }}>
                              {Number(l.credit) > 0 ? formatLkr(l.credit) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SoftPanel>
                </div>
              )}
            </div>
          );
        })}
      </ListShell>
    </AccountingLayout>
  );
}
