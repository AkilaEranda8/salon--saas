import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import {
  ListRow, ListShell, SectionTitle, StatusPill, SoftPanel, ACCT,
  ProgressRow, QuickLink, HeroBanner, LoadingBlock, MoneyText,
} from './AccountingUI';
import { StatCard, IconDollar, IconCalendar, IconReceipt } from '../../components/ui/PageKit';
import usePageTheme from '../../hooks/usePageTheme';
import Button from '../../components/ui/Button';

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

function journalTotal(j) {
  return (j.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
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

  const net = Number(data?.mtdNetIncome || 0);
  const rev = Number(data?.mtdRevenue || 0);
  const exp = Number(data?.mtdExpense || 0);
  const barMax = Math.max(rev, exp, Math.abs(net), 1);
  const periodOpen = String(data?.period?.status || '').toLowerCase() === 'open';
  const liquidity = Number(data?.cashBalance || 0) + Number(data?.bankBalance || 0);

  return (
    <AccountingLayout
      title="Accounting Overview"
      actions={(
        <Link to="/accounting/journals" style={{ textDecoration: 'none' }}>
          <Button variant="primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Open journals</Button>
        </Link>
      )}
    >
      {loading ? <LoadingBlock rows={5} /> : (
        <>
          <HeroBanner
            title="Books snapshot"
            subtitle={`Period ${data?.period?.period_key || '—'} · ${periodOpen ? 'Open for posting' : 'Closed'}`}
            accent={periodOpen ? ACCT.success : ACCT.warning}
            right={(
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Liquidity</div>
                <MoneyText value={liquidity} color={ACCT.success} size={22} weight={800} />
              </div>
            )}
          >
            <div style={{ marginTop: 8 }}>
              <StatusPill status={periodOpen ? 'open' : 'closed'}>
                {periodOpen ? 'Period open' : 'Period closed'}
              </StatusPill>
            </div>
          </HeroBanner>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
            <StatCard label="Cash" value={formatLkr(data?.cashBalance)} color={ACCT.success} icon={<IconCash />} />
            <StatCard label="Bank" value={formatLkr(data?.bankBalance)} color={ACCT.primary} icon={<IconBank />} />
            <StatCard label="AR Open" value={formatLkr(data?.arOpen)} color={ACCT.warning} icon={<IconReceipt />} />
            <StatCard label="AP Open" value={formatLkr(data?.apOpen)} color={ACCT.danger} icon={<IconDollar />} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <StatCard label="MTD Revenue" value={formatLkr(rev)} color={ACCT.success} icon={<IconTrend />} />
            <StatCard label="MTD Expense" value={formatLkr(exp)} color={ACCT.danger} icon={<IconDollar />} />
            <StatCard label="MTD Net" value={formatLkr(net)} color={net >= 0 ? ACCT.primary : ACCT.danger} icon={<IconTrend />} />
            <StatCard
              label="Period"
              value={`${data?.period?.period_key || '—'} · ${data?.period?.status || '—'}`}
              color={ACCT.purple}
              icon={<IconCalendar />}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            <SoftPanel accent={ACCT.primary} title="Month to date" subtitle="Revenue vs expense vs net">
              <ProgressRow label="Revenue" value={rev} max={barMax} color={ACCT.success} format={formatLkr} />
              <ProgressRow label="Expense" value={exp} max={barMax} color={ACCT.danger} format={formatLkr} />
              <ProgressRow label="Net" value={net} max={barMax} color={net >= 0 ? ACCT.primary : ACCT.danger} format={formatLkr} />
            </SoftPanel>

            <SoftPanel accent={ACCT.cyan} title="Quick actions" subtitle="Jump to common bookkeeping tasks">
              <div style={{ display: 'grid', gap: 10 }}>
                <QuickLink to="/accounting/cash-bank" label="Cash & Bank" hint="Accounts, deposits, transfers" color={ACCT.success} icon={<IconBank />} />
                <QuickLink to="/accounting/journals" label="GL Journals" hint="Post or void entries" color={ACCT.purple} icon={<IconReceipt />} />
                <QuickLink to="/accounting/reports" label="GL Reports" hint="Trial balance · P&L · Balance sheet" color={ACCT.cyan} icon={<IconTrend />} />
                <QuickLink to="/accounting/ar-ap" label="AR / AP" hint="Customer invoices & supplier bills" color={ACCT.warning} icon={<IconDollar />} />
              </div>
            </SoftPanel>
          </div>

          <SectionTitle color={ACCT.purple}>Recent journals</SectionTitle>
          <ListShell empty="No journals yet" emptySub="Payments and expenses will auto-post when enabled">
            {(data?.recentJournals || []).map((j) => (
              <ListRow key={j.id}>
                <div>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span>#{j.id}</span>
                    <span style={{ color: C.muted, fontWeight: 600, fontSize: 12 }}>{j.date}</span>
                    <MoneyText value={journalTotal(j)} color={ACCT.primary} />
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                    {j.memo || j.source_type || 'Manual'}
                  </div>
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
