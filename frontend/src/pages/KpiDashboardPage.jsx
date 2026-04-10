import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { useAuth } from '../context/AuthContext';

const Rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0');

const StatBlock = ({ label, value, sub, color }) => (
  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 18px', minWidth: 0 }}>
    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color || '#101828' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{sub}</div>}
  </div>
);

export default function KpiDashboardPage() {
  const { user } = useAuth();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState('today');
  const [branchFilter, setBranchFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/kpi/summary?period=${period}`)
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const branchList = data?.branches || [];
  const filtered   = branchFilter === 'all' ? branchList : branchList.filter((b) => String(b.branch_id) === branchFilter);
  const globalRevenue = filtered.reduce((s, b) => s + Number(b.revenue || 0), 0);
  const globalAppts   = filtered.reduce((s, b) => s + Number(b.appointments || 0), 0);
  const globalWalkins = filtered.reduce((s, b) => s + Number(b.walk_ins || 0), 0);
  const globalStaff   = filtered.reduce((s, b) => s + Number(b.active_staff || 0), 0);

  const chartData = filtered.map((b) => ({
    name: b.branch_name?.length > 14 ? b.branch_name.slice(0, 14) + '…' : b.branch_name,
    Revenue: Number(b.revenue || 0),
    Appointments: Number(b.appointments || 0),
    'Walk-ins': Number(b.walk_ins || 0),
  }));

  const PERIOD_OPTIONS = [
    { k: 'today', label: 'Today' },
    { k: 'week', label: 'This Week' },
    { k: 'month', label: 'This Month' },
    { k: 'year', label: 'This Year' },
  ];

  return (
    <PageWrapper
      title="Multi-Branch KPI Dashboard"
      subtitle="Real-time performance metrics across all branches"
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map(({ k, label }) => (
            <button key={k} onClick={() => setPeriod(k)} style={{ padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: period === k ? '#2563EB' : '#F3F4F6', color: period === k ? '#fff' : '#374151' }}>
              {label}
            </button>
          ))}
          <button onClick={load} style={{ padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #D1D5DB', background: '#fff', color: '#374151' }}>🔄 Refresh</button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280', fontSize: 14 }}>Loading KPI data…</div>
      ) : !data ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12 }}>Unable to load KPI data. Ensure branches are set up.</div>
      ) : (
        <>
          {/* Global summary */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, marginBottom: 10 }}>OVERALL SUMMARY — {PERIOD_OPTIONS.find((p) => p.k === period)?.label.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatBlock label="TOTAL REVENUE" value={Rs(globalRevenue)} color="#2563EB" />
              <StatBlock label="APPOINTMENTS" value={globalAppts} color="#059669" />
              <StatBlock label="WALK-INS" value={globalWalkins} color="#D97706" />
              <StatBlock label="ACTIVE STAFF" value={globalStaff} color="#7C3AED" />
              <StatBlock label="BRANCHES" value={filtered.length} color="#374151" />
            </div>
          </div>

          {/* Branch filter */}
          {branchList.length > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Filter:</span>
              <button onClick={() => setBranchFilter('all')} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: branchFilter === 'all' ? '#2563EB' : '#F3F4F6', color: branchFilter === 'all' ? '#fff' : '#374151' }}>All</button>
              {branchList.map((b) => (
                <button key={b.branch_id} onClick={() => setBranchFilter(String(b.branch_id))} style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: branchFilter === String(b.branch_id) ? '#2563EB' : '#F3F4F6', color: branchFilter === String(b.branch_id) ? '#fff' : '#374151' }}>{b.branch_name}</button>
              ))}
            </div>
          )}

          {/* Revenue comparison chart */}
          {chartData.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 16 }}>Revenue by Branch</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v, n) => [n === 'Revenue' ? Rs(v) : v, n]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Appointments" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Walk-ins" fill="#D97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-branch cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map((b) => {
              const utilization = pct(b.appointments, (b.active_staff || 1) * (period === 'today' ? 8 : period === 'week' ? 56 : period === 'month' ? 240 : 2880));
              return (
                <div key={b.branch_id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#101828' }}>{b.branch_name}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF' }}>Branch #{b.branch_id}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB' }}>{Rs(b.revenue)}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>Revenue</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Appointments', value: b.appointments, icon: '📅', color: '#059669' },
                      { label: 'Walk-ins', value: b.walk_ins, icon: '🚶', color: '#D97706' },
                      { label: 'Active Staff', value: b.active_staff, icon: '👤', color: '#7C3AED' },
                      { label: 'New Customers', value: b.new_customers, icon: '🆕', color: '#0891B2' },
                      { label: 'Avg Ticket', value: Rs(b.avg_ticket), icon: '🧾', color: '#374151' },
                      { label: 'Utilization', value: `${utilization}%`, icon: '⚡', color: Number(utilization) >= 70 ? '#059669' : Number(utilization) < 30 ? '#DC2626' : '#D97706' },
                    ].map(({ label, value, icon, color }) => (
                      <div key={label} style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 16 }}>{icon}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color }}>{value ?? 0}</div>
                        <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600 }}>{label.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                  {/* Top staff */}
                  {b.top_staff && b.top_staff.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 6 }}>TOP STAFF</div>
                      {b.top_staff.slice(0, 3).map((s, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px dashed #F3F4F6' }}>
                          <span>{['🥇', '🥈', '🥉'][i]} {s.name}</span>
                          <span style={{ fontWeight: 700, color: '#374151' }}>{s.appointments} appts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
