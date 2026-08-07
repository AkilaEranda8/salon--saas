import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import AccountingLayout, { formatLkr } from './AccountingLayout';
import usePageTheme from '../../hooks/usePageTheme';

export default function AccountingReportsPage() {
  const { C } = usePageTheme();
  const [tab, setTab] = useState('tb');
  const [data, setData] = useState(null);
  const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  useEffect(() => {
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
  }, [tab]);

  return (
    <AccountingLayout title="GL Reports">
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['tb', 'Trial Balance'], ['pl', 'P&L'], ['bs', 'Balance Sheet']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{
            padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: tab === k ? '#2563EB' : C.cardBg, color: tab === k ? '#fff' : C.text, fontWeight: 600, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>
      {!data && <div style={{ color: C.muted }}>Loading…</div>}
      {tab === 'tb' && data?.rows && (
        <Table C={C} headers={['Code', 'Name', 'Debit', 'Credit']} rows={data.rows.map((r) => [r.code, r.name, formatLkr(r.debit), formatLkr(r.credit)])} />
      )}
      {tab === 'pl' && data && (
        <>
          <h4 style={{ color: C.text }}>Revenue {formatLkr(data.revenueTotal)}</h4>
          <Table C={C} headers={['Code', 'Name', 'Amount']} rows={(data.revenue || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
          <h4 style={{ color: C.text }}>Expenses {formatLkr(data.expenseTotal)}</h4>
          <Table C={C} headers={['Code', 'Name', 'Amount']} rows={(data.expense || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
          <p style={{ fontWeight: 800, color: C.text }}>Net income: {formatLkr(data.netIncome)}</p>
        </>
      )}
      {tab === 'bs' && data && (
        <>
          <h4 style={{ color: C.text }}>Assets {formatLkr(data.assetTotal)}</h4>
          <Table C={C} headers={['Code', 'Name', 'Amount']} rows={(data.assets || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
          <h4 style={{ color: C.text }}>Liabilities {formatLkr(data.liabilityTotal)}</h4>
          <Table C={C} headers={['Code', 'Name', 'Amount']} rows={(data.liabilities || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
          <h4 style={{ color: C.text }}>Equity {formatLkr(data.equityTotal)}</h4>
          <Table C={C} headers={['Code', 'Name', 'Amount']} rows={(data.equity || []).map((r) => [r.code, r.name, formatLkr(r.amount)])} />
        </>
      )}
    </AccountingLayout>
  );
}

function Table({ C, headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{headers.map((h) => <th key={h} style={{ textAlign: 'left', padding: 10, borderBottom: `1px solid ${C.border}`, color: C.label }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: 10, borderBottom: `1px solid ${C.border}`, color: C.text }}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
