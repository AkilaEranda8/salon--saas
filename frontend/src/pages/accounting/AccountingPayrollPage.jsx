import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';

export default function AccountingPayrollPage() {
  const { C } = usePageTheme();
  const [data, setData] = useState({ payouts: [], advances: [] });

  useEffect(() => {
    (async () => {
      try {
        const { data: d } = await api.get('/accounting/payroll-summary');
        setData(d);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Load failed');
      }
    })();
  }, []);

  return (
    <AccountingLayout title="Payroll">
      <h3 style={{ color: C.text }}>Commission payouts</h3>
      <List C={C} rows={data.payouts} label={(r) => `${r.date} · ${formatLkr(r.amount)} · staff #${r.staff_id}`} />
      <h3 style={{ color: C.text, marginTop: 16 }}>Staff advances</h3>
      <List C={C} rows={data.advances} label={(r) => `${r.date} · ${formatLkr(r.amount)} · ${r.status}`} />
    </AccountingLayout>
  );
}

function List({ C, rows, label }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      {(rows || []).map((r) => (
        <div key={r.id} style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: C.text }}>{label(r)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: r.gl_posted ? '#059669' : '#D97706' }}>
            {r.gl_posted ? 'GL posted' : 'Not in GL'}
          </span>
        </div>
      ))}
      {!rows?.length && <div style={{ padding: 16, color: C.muted }}>None.</div>}
    </div>
  );
}
