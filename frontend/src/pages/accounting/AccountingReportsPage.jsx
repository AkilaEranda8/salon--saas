import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import {
  SegmentTabs, ReportTable, SectionTitle, ACCT,
} from './AccountingUI';
import { StatCard, IconDollar, IconReceipt } from '../../components/ui/PageKit';

const IconTrend = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);

export default function AccountingReportsPage() {
  const [tab, setTab] = useState('tb');
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setData(null);
    (async () => {
      try {
        const path = tab === 'tb' ? '/accounting/reports/trial-balance'
          : tab === 'pl' ? '/accounting/reports/profit-loss'
            : '/accounting/reports/balance-sheet';
        const params = tab === 'bs' ? { asOf: to } : { from, to };
        const { data: d } = await api.get(path, { params });
        setData(d);
      } catch (err) {
        toast.error(err.response?.data?.message || 'Report failed');
      }
    })();
  }, [tab, from, to]);

  const net = Number(data?.netIncome || 0);

  return (
    <AccountingLayout title="GL Reports">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#667085', display: 'flex', gap: 6, alignItems: 'center' }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pk-filter-control" />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#667085', display: 'flex', gap: 6, alignItems: 'center' }}>
          {tab === 'bs' ? 'As of' : 'To'}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pk-filter-control" />
        </label>
      </div>
      <SegmentTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'tb', label: 'Trial Balance', color: ACCT.cyan },
          { key: 'pl', label: 'Profit & Loss', color: ACCT.success },
          { key: 'bs', label: 'Balance Sheet', color: ACCT.primary },
        ]}
      />

      {!data && <div style={{ padding: 16, color: '#98A2B3' }}>Loading report…</div>}

      {tab === 'tb' && data?.rows && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard
              label="Total Debit"
              value={formatLkr(data.rows.reduce((s, r) => s + Number(r.debit || 0), 0))}
              color={ACCT.primary}
              icon={<IconDollar />}
            />
            <StatCard
              label="Total Credit"
              value={formatLkr(data.rows.reduce((s, r) => s + Number(r.credit || 0), 0))}
              color={ACCT.purple}
              icon={<IconReceipt />}
            />
          </div>
          <ReportTable
            headers={['Code', 'Name', 'Debit', 'Credit']}
            alignRightFrom={2}
            rows={data.rows.map((r) => [r.code, r.name, formatLkr(r.debit), formatLkr(r.credit)])}
          />
        </>
      )}

      {tab === 'pl' && data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard label="Revenue" value={formatLkr(data.revenueTotal)} color={ACCT.success} icon={<IconTrend />} />
            <StatCard label="Expenses" value={formatLkr(data.expenseTotal)} color={ACCT.danger} icon={<IconDollar />} />
            <StatCard label="Net income" value={formatLkr(net)} color={net >= 0 ? ACCT.primary : ACCT.danger} icon={<IconTrend />} />
          </div>
          <SectionTitle color={ACCT.success}>Revenue</SectionTitle>
          <ReportTable
            headers={['Code', 'Name', 'Amount']}
            alignRightFrom={2}
            rows={(data.revenue || []).map((r) => [r.code, r.name, formatLkr(r.amount)])}
          />
          <SectionTitle color={ACCT.danger}>Expenses</SectionTitle>
          <ReportTable
            headers={['Code', 'Name', 'Amount']}
            alignRightFrom={2}
            rows={(data.expense || []).map((r) => [r.code, r.name, formatLkr(r.amount)])}
          />
        </>
      )}

      {tab === 'bs' && data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard label="Assets" value={formatLkr(data.assetTotal)} color={ACCT.primary} icon={<IconDollar />} />
            <StatCard label="Liabilities" value={formatLkr(data.liabilityTotal)} color={ACCT.danger} icon={<IconReceipt />} />
            <StatCard label="Equity" value={formatLkr(data.equityTotal)} color={ACCT.purple} icon={<IconTrend />} />
          </div>
          <SectionTitle color={ACCT.primary}>Assets</SectionTitle>
          <ReportTable headers={['Code', 'Name', 'Amount']} alignRightFrom={2} rows={(data.assets || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
          <SectionTitle color={ACCT.danger}>Liabilities</SectionTitle>
          <ReportTable headers={['Code', 'Name', 'Amount']} alignRightFrom={2} rows={(data.liabilities || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
          <SectionTitle color={ACCT.purple}>Equity</SectionTitle>
          <ReportTable headers={['Code', 'Name', 'Amount']} alignRightFrom={2} rows={(data.equity || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
        </>
      )}
    </AccountingLayout>
  );
}
