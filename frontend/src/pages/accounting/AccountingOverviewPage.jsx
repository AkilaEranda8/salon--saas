import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';

function Kpi({ label, value, C }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.label, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default function AccountingOverviewPage() {
  const { C } = usePageTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: d } = await api.get('/accounting/overview');
        setData(d);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to load overview');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AccountingLayout title="Accounting Overview">
      {loading ? <div style={{ color: C.muted }}>Loading…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
            <Kpi C={C} label="Cash" value={formatLkr(data?.cashBalance)} />
            <Kpi C={C} label="Bank" value={formatLkr(data?.bankBalance)} />
            <Kpi C={C} label="AR Open" value={formatLkr(data?.arOpen)} />
            <Kpi C={C} label="AP Open" value={formatLkr(data?.apOpen)} />
            <Kpi C={C} label="MTD Revenue" value={formatLkr(data?.mtdRevenue)} />
            <Kpi C={C} label="MTD Expense" value={formatLkr(data?.mtdExpense)} />
            <Kpi C={C} label="MTD Net" value={formatLkr(data?.mtdNetIncome)} />
            <Kpi C={C} label="Period" value={`${data?.period?.period_key || '—'} (${data?.period?.status || '—'})`} />
          </div>
          <h3 style={{ margin: '0 0 10px', color: C.text }}>Recent journals</h3>
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {(data?.recentJournals || []).map((j) => (
              <div key={j.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: C.text }}>#{j.id} · {j.date}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{j.memo || j.source_type || 'Manual'}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: j.status === 'posted' ? '#059669' : C.muted }}>{j.status}</span>
              </div>
            ))}
            {!data?.recentJournals?.length && <div style={{ padding: 16, color: C.muted }}>No journals yet.</div>}
          </div>
        </>
      )}
    </AccountingLayout>
  );
}
