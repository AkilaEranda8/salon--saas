import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import { ListRow, ListShell, SectionTitle, StatusPill, ACCT } from './AccountingUI';
import { StatCard, IconDollar, IconCalendar, IconReceipt } from '../../components/ui/PageKit';

const IconCash = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" />
  </svg>
);
const IconBank = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
  </svg>
);
const IconTrend = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);

export default function AccountingOverviewPage() {
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

  const net = Number(data?.mtdNetIncome || 0);

  return (
    <AccountingLayout title="Accounting Overview">
      {loading ? (
        <div style={{ padding: 24, color: '#98A2B3' }}>Loading books…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
            <StatCard label="Cash" value={formatLkr(data?.cashBalance)} color={ACCT.success} icon={<IconCash />} />
            <StatCard label="Bank" value={formatLkr(data?.bankBalance)} color={ACCT.primary} icon={<IconBank />} />
            <StatCard label="AR Open" value={formatLkr(data?.arOpen)} color={ACCT.warning} icon={<IconReceipt />} />
            <StatCard label="AP Open" value={formatLkr(data?.apOpen)} color={ACCT.danger} icon={<IconDollar />} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="MTD Revenue" value={formatLkr(data?.mtdRevenue)} color={ACCT.success} icon={<IconTrend />} />
            <StatCard label="MTD Expense" value={formatLkr(data?.mtdExpense)} color={ACCT.danger} icon={<IconDollar />} />
            <StatCard label="MTD Net" value={formatLkr(net)} color={net >= 0 ? ACCT.primary : ACCT.danger} icon={<IconTrend />} />
            <StatCard
              label="Period"
              value={`${data?.period?.period_key || '—'} · ${data?.period?.status || '—'}`}
              color={ACCT.purple}
              icon={<IconCalendar />}
            />
          </div>

          <SectionTitle color={ACCT.purple}>Recent journals</SectionTitle>
          <ListShell empty="No journals yet" emptySub="Payments and expenses will auto-post when enabled">
            {(data?.recentJournals || []).map((j) => (
              <ListRow key={j.id}>
                <div>
                  <div style={{ fontWeight: 700, color: '#101828', fontSize: 14 }}>
                    #{j.id} · {j.date}
                  </div>
                  <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{j.memo || j.source_type || 'Manual'}</div>
                </div>
                <StatusPill status={j.status} />
              </ListRow>
            ))}
          </ListShell>
        </>
      )}
    </AccountingLayout>
  );
}
