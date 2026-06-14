import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { DataTable } from '../ui/PageKit';

const Rs = n => `Rs. ${Number(n || 0).toLocaleString()}`;
const S = { fontFamily: "'Inter',sans-serif" };

const SUB_TABS = [
  { key: 'daily', label: 'Daily Manager' },
  { key: 'monthly', label: 'Monthly Manager' },
  { key: 'branch', label: 'Branch Summary' },
  { key: 'staff', label: 'Staff Contribution' },
];

function normDay(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function clampDay(day, min, max) {
  const d = normDay(day) || normDay(max) || normDay(min) || new Date().toISOString().slice(0, 10);
  if (min && d < min) return min;
  if (max && d > max) return max;
  return d;
}

function formatDayLabel(dateStr) {
  const d = normDay(dateStr);
  if (!d) return '—';
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function shiftDay(dateStr, delta) {
  const d = new Date(`${normDay(dateStr)}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function FranchiseCommissionReports({ dateFrom, dateTo }) {
  const { selectedBranchId: branchId } = useBranch();
  const [subTab, setSubTab] = useState('daily');
  const [selectedDay, setSelectedDay] = useState('');
  const [rangeLoading, setRangeLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [daySummaries, setDaySummaries] = useState([]);
  const [daily, setDaily] = useState({ summary: [], transactions: [] });
  const [monthly, setMonthly] = useState({ rows: [] });
  const [branchSum, setBranchSum] = useState({ branches: [] });
  const [staffContrib, setStaffContrib] = useState({ rows: [] });

  const rangeFrom = normDay(dateFrom) || new Date().toISOString().slice(0, 10);
  const rangeTo = normDay(dateTo) || rangeFrom;
  const reportDate = clampDay(selectedDay || rangeTo, rangeFrom, rangeTo);
  const periodMonth = parseInt(rangeFrom.slice(5, 7), 10);
  const periodYear = parseInt(rangeFrom.slice(0, 4), 10);
  const bq = useMemo(() => (branchId ? { branchId } : {}), [branchId]);
  const multiDayRange = rangeFrom !== rangeTo;

  useEffect(() => {
    setSelectedDay((prev) => clampDay(prev || rangeTo, rangeFrom, rangeTo));
  }, [rangeFrom, rangeTo]);

  /* Day-wise summary for the selected range — load once per range, not per day */
  useEffect(() => {
    if (!multiDayRange) {
      setDaySummaries([]);
      return undefined;
    }
    let cancelled = false;
    setRangeLoading(true);
    api.get('/reports/franchise/manager-daily-range', { params: { from: rangeFrom, to: rangeTo, ...bq } })
      .then((res) => {
        if (cancelled) return;
        const days = (res.data?.days || []).map((row) => ({
          ...row,
          date: normDay(row.date),
        }));
        setDaySummaries(days);
      })
      .catch(() => { if (!cancelled) setDaySummaries([]); })
      .finally(() => { if (!cancelled) setRangeLoading(false); });
    return () => { cancelled = true; };
  }, [rangeFrom, rangeTo, branchId, multiDayRange, bq]);

  /* Selected day only — does not reload monthly / branch / staff */
  useEffect(() => {
    const day = clampDay(selectedDay || rangeTo, rangeFrom, rangeTo);
    let cancelled = false;
    setDailyLoading(true);
    api.get('/reports/franchise/manager-daily', { params: { date: day, ...bq } })
      .then((res) => {
        if (cancelled) return;
        setDaily(res.data || { summary: [], transactions: [] });
      })
      .catch(() => {
        if (!cancelled) setDaily({ summary: [], transactions: [] });
      })
      .finally(() => { if (!cancelled) setDailyLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDay, rangeFrom, rangeTo, branchId, bq]);

  /* Monthly / branch / staff — load when that tab is opened or range changes */
  useEffect(() => {
    if (subTab === 'daily') return undefined;
    let cancelled = false;
    setPeriodLoading(true);
    const params = { month: periodMonth, year: periodYear, ...bq };
    const req = subTab === 'monthly'
      ? api.get('/reports/franchise/manager-monthly', { params })
      : subTab === 'branch'
        ? api.get('/reports/franchise/branch-summary', { params })
        : api.get('/reports/franchise/staff-contribution', { params });

    req
      .then((res) => {
        if (cancelled) return;
        if (subTab === 'monthly') setMonthly(res.data || { rows: [] });
        else if (subTab === 'branch') setBranchSum(res.data || { branches: [] });
        else setStaffContrib(res.data || { rows: [] });
      })
      .catch(() => {
        if (cancelled) return;
        if (subTab === 'monthly') setMonthly({ rows: [] });
        else if (subTab === 'branch') setBranchSum({ branches: [] });
        else setStaffContrib({ rows: [] });
      })
      .finally(() => { if (!cancelled) setPeriodLoading(false); });
    return () => { cancelled = true; };
  }, [subTab, periodMonth, periodYear, branchId, bq]);

  const dayNav = useMemo(() => ({
    prev: reportDate > rangeFrom ? shiftDay(reportDate, -1) : null,
    next: reportDate < rangeTo ? shiftDay(reportDate, 1) : null,
  }), [reportDate, rangeFrom, rangeTo]);

  const dailyCols = useMemo(() => [
    { id: 'managerName', header: 'Manager', accessorKey: 'managerName' },
    { id: 'branchName', header: 'Branch', accessorKey: 'branchName' },
    { id: 'workerName', header: 'Staff', accessorKey: 'workerName' },
    { id: 'customerName', header: 'Customer', accessorKey: 'customerName' },
    { id: 'serviceAmount', header: 'Service Amt', accessorKey: 'serviceAmount', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'commissionPercent', header: 'Mgr %', accessorKey: 'commissionPercent', cell: ({ getValue }) => `${Number(getValue() || 0)}%` },
    { id: 'commissionAmount', header: 'Mgr Commission', accessorKey: 'commissionAmount', cell: ({ getValue }) => <span style={{ fontWeight: 700, color: '#D97706' }}>{Rs(getValue())}</span> },
  ], []);

  const daySummaryCols = useMemo(() => [
    {
      id: 'date',
      header: 'Date',
      accessorKey: 'date',
      cell: ({ row: { original: row } }) => (
        <button
          type="button"
          onClick={() => setSelectedDay(normDay(row.date))}
          style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer',
            fontWeight: normDay(row.date) === reportDate ? 800 : 600,
            color: normDay(row.date) === reportDate ? '#B45309' : '#2563EB',
            fontSize: 13, textDecoration: normDay(row.date) === reportDate ? 'none' : 'underline',
            ...S,
          }}
        >
          {formatDayLabel(row.date)}
        </button>
      ),
    },
    { id: 'transactionCount', header: 'Payments', accessorKey: 'transactionCount', meta: { align: 'center' } },
    { id: 'totalServiceAmount', header: 'Service Total', accessorKey: 'totalServiceAmount', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'totalCommission', header: 'Mgr Commission', accessorKey: 'totalCommission', cell: ({ getValue }) => <span style={{ fontWeight: 700, color: '#D97706' }}>{Rs(getValue())}</span> },
  ], [reportDate]);

  const monthlyCols = useMemo(() => [
    { id: 'managerName', header: 'Manager', accessorKey: 'managerName' },
    { id: 'branchName', header: 'Branch', accessorKey: 'branchName' },
    { id: 'transactionCount', header: 'Payments', accessorKey: 'transactionCount' },
    { id: 'totalServiceAmount', header: 'Service Total', accessorKey: 'totalServiceAmount', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'avgPercent', header: 'Avg %', accessorKey: 'avgPercent', cell: ({ getValue }) => `${Number(getValue() || 0).toFixed(1)}%` },
    { id: 'totalCommission', header: 'Manager Commission', accessorKey: 'totalCommission', cell: ({ getValue }) => <span style={{ fontWeight: 700, color: '#D97706' }}>{Rs(getValue())}</span> },
  ], []);

  const branchCols = useMemo(() => [
    { id: 'branchName', header: 'Branch', accessorKey: 'branchName' },
    { id: 'managerCommissionPercent', header: 'Mgr %', accessorKey: 'managerCommissionPercent', cell: ({ getValue }) => getValue() != null ? `${getValue()}%` : '—' },
    { id: 'totalServiceAmount', header: 'Service Total', accessorKey: 'totalServiceAmount', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'workerCommission', header: 'Staff Commission', accessorKey: 'workerCommission', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'managerCommission', header: 'Manager Commission', accessorKey: 'managerCommission', cell: ({ getValue }) => <span style={{ fontWeight: 700, color: '#D97706' }}>{Rs(getValue())}</span> },
    { id: 'transactionCount', header: 'Transactions', accessorKey: 'transactionCount' },
  ], []);

  const staffCols = useMemo(() => [
    { id: 'staffName', header: 'Staff', accessorKey: 'staffName' },
    { id: 'role', header: 'Role', accessorKey: 'role' },
    { id: 'branchName', header: 'Branch', accessorKey: 'branchName' },
    { id: 'paymentCount', header: 'Payments', accessorKey: 'paymentCount' },
    { id: 'totalServiceAmount', header: 'Service Total', accessorKey: 'totalServiceAmount', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'staffCommission', header: 'Staff Earned', accessorKey: 'staffCommission', cell: ({ getValue }) => Rs(getValue()) },
    { id: 'managerCommissionGenerated', header: 'Mgr Commission', accessorKey: 'managerCommissionGenerated', cell: ({ getValue }) => <span style={{ fontWeight: 700, color: '#D97706' }}>{Rs(getValue())}</span> },
  ], []);

  const renderDailyFilters = () => (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E4E7EC', borderRadius: 12,
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#344054', ...S }}>
        <span style={{ fontWeight: 700 }}>Day</span>
        <input
          type="date"
          value={reportDate}
          min={rangeFrom}
          max={rangeTo}
          onChange={(e) => setSelectedDay(clampDay(e.target.value, rangeFrom, rangeTo))}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #D0D5DD', fontSize: 13, color: '#101828', ...S }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          disabled={!dayNav.prev}
          onClick={() => dayNav.prev && setSelectedDay(dayNav.prev)}
          style={navBtnStyle(!dayNav.prev)}
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={!dayNav.next}
          onClick={() => dayNav.next && setSelectedDay(dayNav.next)}
          style={navBtnStyle(!dayNav.next)}
        >
          Next →
        </button>
      </div>
      <span style={{ fontSize: 12, color: '#64748B', ...S }}>
        Range: <strong>{rangeFrom}</strong> to <strong>{rangeTo}</strong>
        {multiDayRange ? ` · ${daySummaries.length} day${daySummaries.length !== 1 ? 's' : ''} with data` : ''}
        {dailyLoading && <span style={{ color: '#D97706', marginLeft: 8 }}>Loading day…</span>}
      </span>
    </div>
  );

  const renderDailyTab = () => (
    <>
      {renderDailyFilters()}
      {multiDayRange && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#475467', marginBottom: 8, ...S }}>
            Day-wise summary — click a day to view payments
            {rangeLoading && <span style={{ fontWeight: 500, color: '#98A2B3', marginLeft: 8 }}>Updating…</span>}
          </div>
          <DataTable
            columns={daySummaryCols}
            data={daySummaries}
            loading={rangeLoading}
            pagination={false}
            emptyMessage="No manager commission in this date range"
          />
        </div>
      )}
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12, ...S }}>
        Payments for <strong>{formatDayLabel(reportDate)}</strong>
        {' '}({(daily.transactions || []).length} record{(daily.transactions || []).length !== 1 ? 's' : ''})
        {' '}— manager override % of total service amount.
      </div>
      <DataTable
        key={reportDate}
        columns={dailyCols}
        data={daily.transactions || []}
        loading={dailyLoading}
        emptyMessage="No manager commission for this day"
        emptySub="Pick another day or record paid services with staff assigned"
      />
    </>
  );

  const renderContent = () => {
    switch (subTab) {
      case 'daily':
        return renderDailyTab();
      case 'monthly':
        return periodLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748B', ...S }}>Loading monthly report…</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12, ...S }}>
              Monthly manager commission — {MONTH_LABEL(periodMonth)} {periodYear}
            </div>
            <DataTable columns={monthlyCols} data={monthly.rows || []} emptyMessage="No manager commission this month" />
          </>
        );
      case 'branch':
        return periodLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748B', ...S }}>Loading branch summary…</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12, ...S }}>
              Branch-wise staff + manager commission — {MONTH_LABEL(periodMonth)} {periodYear}
            </div>
            <DataTable columns={branchCols} data={branchSum.branches || []} emptyMessage="No branch commission data" />
          </>
        );
      case 'staff':
        return periodLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748B', ...S }}>Loading staff contribution…</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12, ...S }}>
              Staff contribution to manager override — {MONTH_LABEL(periodMonth)} {periodYear}
            </div>
            <DataTable columns={staffCols} data={staffContrib.rows || []} emptyMessage="No staff contribution data" />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#92400E', ...S }}>
        <strong>Franchise commission:</strong> Each staff has their own rate. Branch managers earn an additional override % of the <em>total service amount</em> (not from staff commission). Only staff in the manager&apos;s branch count.
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setSubTab(t.key)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: subTab === t.key ? '1.5px solid #D97706' : '1.5px solid #E4E7EC',
              background: subTab === t.key ? '#FFFBEB' : '#fff', color: subTab === t.key ? '#B45309' : '#64748B',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', ...S,
            }}>
            {t.label}
          </button>
        ))}
      </div>
      {renderContent()}
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1.5px solid #E4E7EC',
    background: '#fff',
    color: disabled ? '#D0D5DD' : '#344054',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...S,
  };
}

function MONTH_LABEL(m) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] || m;
}
