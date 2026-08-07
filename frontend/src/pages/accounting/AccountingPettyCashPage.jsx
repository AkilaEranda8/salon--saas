import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  ListRow, ListShell, StatusPill, inputStyle, ACCT, SectionTitle, Field, ModalGrid,
} from './AccountingUI';
import { StatCard, IconDollar, IconPlus, PKModal } from '../../components/ui/PageKit';

const emptyForm = () => ({
  type: 'expense', amount: '', date: new Date().toISOString().slice(0, 10), memo: '',
});

export default function AccountingPettyCashPage() {
  const { C } = usePageTheme();
  const [balance, setBalance] = useState(0);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

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

  const submit = async () => {
    if (!(Number(form.amount) > 0)) {
      toast.error('Enter amount');
      return;
    }
    setSaving(true);
    try {
      await api.post('/accounting/petty-cash', { ...form, amount: Number(form.amount) });
      toast.success('Saved');
      setForm(emptyForm());
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const expenses = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <AccountingLayout
      title="Petty Cash"
      actions={(
        <Button variant="primary" onClick={() => { setForm(emptyForm()); setOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconPlus /> Add entry
        </Button>
      )}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Float balance" value={formatLkr(balance)} color="#EA580C" icon={<IconDollar />} />
        <StatCard label="Entries" value={rows.length} color={ACCT.primary} icon={<IconDollar />} />
        <StatCard label="Expense total" value={formatLkr(expenses)} color={ACCT.danger} icon={<IconDollar />} />
      </div>

      <SectionTitle color="#EA580C">Petty cash log</SectionTitle>
      <ListShell empty="No petty cash entries" emptySub="Click Add entry to record float or expense">
        {rows.map((r) => (
          <ListRow key={r.id}>
            <div>
              <div style={{ fontWeight: 700, color: C.text }}>
                {r.date} · <span style={{ color: r.type === 'expense' ? ACCT.danger : ACCT.success }}>{formatLkr(r.amount)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{r.memo || '—'}</div>
            </div>
            <StatusPill status={r.type} />
          </ListRow>
        ))}
      </ListShell>

      <PKModal
        open={open}
        onClose={() => setOpen(false)}
        title="Record petty cash movement"
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={submit}>Save entry</Button>
          </>
        )}
      >
        <ModalGrid>
          <Field label="Type" required>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ ...inputStyle(C), width: '100%' }}>
              <option value="float_in">Float in</option>
              <option value="float_out">Float out</option>
              <option value="expense">Expense</option>
            </select>
          </Field>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          <Field label="Amount" required>
            <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          <Field label="Memo" full>
            <input placeholder="Optional note" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
        </ModalGrid>
      </PKModal>
    </AccountingLayout>
  );
}
