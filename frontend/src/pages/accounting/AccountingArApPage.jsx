import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';
import {
  ListRow, ListShell, SegmentTabs, StatusPill, inputStyle, ACCT, Field, ModalGrid,
} from './AccountingUI';
import { StatCard, IconDollar, IconUsers, IconPlus, PKModal } from '../../components/ui/PageKit';

const emptyForm = () => ({
  name: '', no: '', date: new Date().toISOString().slice(0, 10), amount: '',
});

export default function AccountingArApPage() {
  const { C } = usePageTheme();
  const [tab, setTab] = useState('ar');
  const [ar, setAr] = useState([]);
  const [ap, setAp] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    try {
      const [a, b] = await Promise.all([api.get('/accounting/ar'), api.get('/accounting/ap')]);
      setAr(a.data || []);
      setAp(b.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Load failed');
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim() || !(Number(form.amount) > 0)) {
      toast.error('Name and amount required');
      return;
    }
    setSaving(true);
    try {
      if (tab === 'ar') {
        await api.post('/accounting/ar', {
          customer_name: form.name,
          invoice_no: form.no || `INV-${Date.now()}`,
          date: form.date,
          amount: form.amount,
        });
      } else {
        await api.post('/accounting/ap', {
          supplier_name: form.name,
          bill_no: form.no || `BILL-${Date.now()}`,
          date: form.date,
          amount: form.amount,
        });
      }
      toast.success('Created');
      setForm(emptyForm());
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const settle = async (id) => {
    try {
      await api.post(`/accounting/${tab}/${id}/settle`);
      toast.success('Settled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Settle failed');
    }
  };

  const rows = tab === 'ar' ? ar : ap;
  const openAmt = rows.filter((r) => r.status === 'open').reduce((s, r) => s + Number(r.amount || 0), 0);
  const openCount = rows.filter((r) => r.status === 'open').length;

  return (
    <AccountingLayout
      title="AR / AP"
      actions={(
        <Button
          variant="primary"
          onClick={() => { setForm(emptyForm()); setOpen(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconPlus /> {tab === 'ar' ? 'Add invoice' : 'Add bill'}
        </Button>
      )}
    >
      <SegmentTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'ar', label: 'Receivable (AR)', color: ACCT.warning },
          { key: 'ap', label: 'Payable (AP)', color: ACCT.danger },
        ]}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard
          label={tab === 'ar' ? 'Open AR' : 'Open AP'}
          value={formatLkr(openAmt)}
          color={tab === 'ar' ? ACCT.warning : ACCT.danger}
          icon={<IconDollar />}
        />
        <StatCard label="Open docs" value={openCount} color={ACCT.primary} icon={<IconUsers />} />
        <StatCard label="Total docs" value={rows.length} color={ACCT.slate} icon={<IconUsers />} />
      </div>

      <ListShell empty="No documents" emptySub={`Click Add ${tab === 'ar' ? 'invoice' : 'bill'} to create one`}>
        {rows.map((r) => (
          <ListRow key={r.id}>
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>
                {tab === 'ar' ? r.invoice_no : r.bill_no} · {tab === 'ar' ? r.customer_name : r.supplier_name}
              </div>
              <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>
                {r.date} · <span style={{ fontWeight: 700, color: tab === 'ar' ? ACCT.warning : ACCT.danger }}>{formatLkr(r.amount)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusPill status={r.status} />
              {r.status === 'open' && (
                <Button variant="secondary" onClick={() => settle(r.id)} style={{ fontSize: 12 }}>Mark paid</Button>
              )}
            </div>
          </ListRow>
        ))}
      </ListShell>

      <PKModal
        open={open}
        onClose={() => setOpen(false)}
        title={tab === 'ar' ? 'New customer invoice' : 'New supplier bill'}
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={create}>
              {tab === 'ar' ? 'Add invoice' : 'Add bill'}
            </Button>
          </>
        )}
      >
        <ModalGrid>
          <Field label={tab === 'ar' ? 'Customer name' : 'Supplier name'} required full>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} placeholder={tab === 'ar' ? 'Customer' : 'Supplier'} />
          </Field>
          <Field label="Doc no (optional)">
            <input value={form.no} onChange={(e) => setForm({ ...form, no: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} placeholder="Auto if blank" />
          </Field>
          <Field label="Date" required>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} />
          </Field>
          <Field label="Amount" required full>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ ...inputStyle(C), width: '100%' }} placeholder="0.00" />
          </Field>
        </ModalGrid>
      </PKModal>
    </AccountingLayout>
  );
}
