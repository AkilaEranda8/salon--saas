import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import { StatCard } from '../components/ui/PageKit';
import { useAuth } from '../context/AuthContext';

const Rs  = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0');

/* ── Revenue bar (hero) ─────────────────────────────────────────────────── */
const RevenueBar = ({ current, target }) => {
  const p = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div style={{ marginTop: 16, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>
          Revenue progress
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: "'Inter', sans-serif" }}>
          {Rs(current)}
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${p}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ height: '100%', background: 'rgba(255,255,255,0.85)', borderRadius: 99 }}
        />
      </div>
    </div>
  );
};

/* ── Utilization mini-bar ─────────────────────────────────────────────── */
const UtilBar = ({ value, color }) => (
  <div style={{ height: 5, background: '#F2F4F7', borderRadius: 99, overflow: 'hidden', marginTop: 4, width: '100%' }}>
    <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
  </div>
);

const PERIOD_OPTIONS = [
  { k: 'today', label: 'Today' },
  { k: 'week', label: 'This Week' },
  { k: 'month', label: 'This Month' },
  { k: 'year', label: 'This Year' },
];

/* ── Rank badges ── */
const RANK = ['1st', '2nd', '3rd'];
const RANK_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];

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

  const branchList  = data?.branches || [];
  const filtered    = branchFilter === 'all' ? branchList : branchList.filter((b) => String(b.branch_id) === branchFilter);
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

  return (
    <PageWrapper
      title="Multi-Branch KPI Dashboard"
      subtitle="Real-time performance metrics across all branches"
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map(({ k, label }) => (
            <button key={k} onClick={() => setPeriod(k)} style={{
              padding: '7px 18px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              background: period === k ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F9FAFB',
              color: period === k ? '#fff' : '#667085',
              border: period === k ? 'none' : '1.5px solid #EAECF0',
              boxShadow: period === k ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
              transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
            }}>
              {label}
            </button>
          ))}
          <button onClick={load} style={{
            padding: '7px 18px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: '1.5px solid #EAECF0', background: '#fff', color: '#344054',
            fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
          }}>
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#98A2B3', fontSize: 14, fontFamily: "'Inter', sans-serif" }}>Loading KPI data…</div>
      ) : !data ? (
        <div style={{
          textAlign: 'center', padding: 60, color: '#98A2B3',
          border: '2px dashed #E5E7EB', borderRadius: 14,
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#667085' }}>Unable to load KPI data</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Ensure branches are set up and the KPI service is running.</div>
        </div>
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <StatCard label="Revenue"     value={Rs(globalRevenue)} color="#2563EB" />
            <StatCard label="Appointments" value={globalAppts}       color="#059669" />
            <StatCard label="Walk-ins"    value={globalWalkins}     color="#D97706" />
            <StatCard label="Staff"       value={globalStaff}       color="#7C3AED" />
            <StatCard label="Branches"    value={filtered.length}   color="#6366F1" />
          </div>

          {/* ── Hero Card ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E40AF 50%, #2563EB 100%)',
              borderRadius: 18, padding: '28px 32px',
              boxShadow: '0 8px 32px rgba(37,99,235,0.22)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -30, right: 80, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, position: 'relative' }}>
              <div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'rgba(255,255,255,0.18)', color: '#fff',
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.07em',
                  textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99,
                  border: '1px solid rgba(255,255,255,0.25)',
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {PERIOD_OPTIONS.find((p) => p.k === period)?.label || 'Today'}
                </span>
                <h2 style={{
                  margin: '12px 0 2px', fontSize: 28, fontWeight: 900, color: '#fff',
                  lineHeight: 1.1, fontFamily: "'Sora', 'Manrope', sans-serif", letterSpacing: '-0.5px',
                }}>
                  {Rs(globalRevenue)}
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontFamily: "'Inter', sans-serif" }}>
                  {globalAppts} appointments across {filtered.length} {filtered.length === 1 ? 'branch' : 'branches'}
                </p>
                <RevenueBar current={globalRevenue} target={globalRevenue * 1.3} />
              </div>
              <div style={{
                background: globalRevenue > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.15)',
                border: globalRevenue > 0 ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.3)',
                borderRadius: 99, padding: '6px 16px',
                fontSize: 12, fontWeight: 700, color: '#fff',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                fontFamily: "'Inter', sans-serif",
              }}>
                {globalRevenue > 0 ? 'Active' : 'No Data'}
              </div>
            </div>
          </motion.div>

          {/* ── Branch Filter ── */}
          {branchList.length > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#344054', fontFamily: "'Inter', sans-serif" }}>Branch:</span>
              <button onClick={() => setBranchFilter('all')} style={{
                padding: '6px 16px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: branchFilter === 'all' ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F9FAFB',
                color: branchFilter === 'all' ? '#fff' : '#667085',
                border: branchFilter === 'all' ? 'none' : '1.5px solid #EAECF0',
                boxShadow: branchFilter === 'all' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
              }}>All</button>
              {branchList.map((b) => (
                <button key={b.branch_id} onClick={() => setBranchFilter(String(b.branch_id))} style={{
                  padding: '6px 16px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: branchFilter === String(b.branch_id) ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F9FAFB',
                  color: branchFilter === String(b.branch_id) ? '#fff' : '#667085',
                  border: branchFilter === String(b.branch_id) ? 'none' : '1.5px solid #EAECF0',
                  boxShadow: branchFilter === String(b.branch_id) ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                  transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
                }}>{b.branch_name}</button>
              ))}
            </div>
          )}

          {/* ── Revenue Chart ── */}
          {chartData.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              style={{
                background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: '24px 20px',
                boxShadow: '0 2px 8px rgba(16,24,40,0.06)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: '#101828', marginBottom: 18, fontFamily: "'Sora', 'Manrope', sans-serif" }}>
                Revenue by Branch
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#667085', fontFamily: "'Inter', sans-serif" }} />
                  <YAxis tick={{ fontSize: 11, fill: '#667085', fontFamily: "'Inter', sans-serif" }} tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v, n) => [n === 'Revenue' ? Rs(v) : v, n]}
                    contentStyle={{
                      borderRadius: 10, border: '1.5px solid #EAECF0', boxShadow: '0 4px 16px rgba(16,24,40,0.1)',
                      fontFamily: "'Inter', sans-serif", fontSize: 12,
                    }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12, fontFamily: "'Inter', sans-serif" }} />
                  <Bar dataKey="Revenue" fill="#2563EB" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Appointments" fill="#059669" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Walk-ins" fill="#D97706" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* ── Per-branch Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filtered.map((b, idx) => {
              const utilization = Number(pct(b.appointments, (b.active_staff || 1) * (period === 'today' ? 8 : period === 'week' ? 56 : period === 'month' ? 240 : 2880)));
              const utilColor = utilization >= 70 ? '#059669' : utilization < 30 ? '#EF4444' : '#D97706';
              return (
                <motion.div
                  key={b.branch_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                  whileHover={{ translateY: -3 }}
                  style={{
                    background: '#fff', border: '1.5px solid #EAECF0', borderRadius: 16, padding: 22,
                    boxShadow: '0 2px 8px rgba(16,24,40,0.06)',
                    transition: 'box-shadow 0.15s, transform 0.15s',
                    cursor: 'default',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#101828', fontFamily: "'Sora', 'Manrope', sans-serif" }}>{b.branch_name}</div>
                      <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>Branch #{b.branch_id}</div>
                    </div>
                    <div style={{
                      background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                      border: '1.5px solid #BFDBFE', borderRadius: 12, padding: '8px 14px',
                      textAlign: 'right',
                    }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#1D4ED8', fontFamily: "'Sora', 'Manrope', sans-serif" }}>{Rs(b.revenue)}</div>
                      <div style={{ fontSize: 10, color: '#3B82F6', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>Revenue</div>
                    </div>
                  </div>

                  {/* KPI grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Appointments', value: b.appointments, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                      { label: 'Walk-ins',     value: b.walk_ins,     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                      { label: 'Staff',        value: b.active_staff, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
                      { label: 'New Customers', value: b.new_customers, color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
                      { label: 'Avg Ticket',   value: Rs(b.avg_ticket), color: '#374151', bg: '#F9FAFB', border: '#EAECF0' },
                      { label: 'Utilization',  value: `${utilization}%`, color: utilColor, bg: '#F9FAFB', border: '#EAECF0', util: utilization, utilColor },
                    ].map(({ label, value, color, bg, border, util, utilColor: uc }) => (
                      <div key={label} style={{
                        background: bg, borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                        border: `1px solid ${border}`,
                      }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color, fontFamily: "'Inter', sans-serif" }}>{value ?? 0}</div>
                        <div style={{ fontSize: 9.5, color: '#98A2B3', fontWeight: 700, marginTop: 2, fontFamily: "'Inter', sans-serif", textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                        {util !== undefined && <UtilBar value={util} color={uc} />}
                      </div>
                    ))}
                  </div>

                  {/* Top staff */}
                  {b.top_staff && b.top_staff.length > 0 && (
                    <div style={{ marginTop: 14, borderTop: '1.5px solid #F2F4F7', paddingTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#98A2B3', marginBottom: 8, letterSpacing: '0.06em', fontFamily: "'Inter', sans-serif" }}>TOP PERFORMERS</div>
                      {b.top_staff.slice(0, 3).map((s, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontSize: 12.5, padding: '6px 0', borderBottom: i < Math.min(b.top_staff.length, 3) - 1 ? '1px solid #F9FAFB' : 'none',
                          fontFamily: "'Inter', sans-serif",
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: 6,
                              background: `${RANK_COLORS[i]}18`,
                              border: `1.5px solid ${RANK_COLORS[i]}35`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 800, color: RANK_COLORS[i],
                            }}>{RANK[i]}</span>
                            <span style={{ fontWeight: 600, color: '#344054' }}>{s.name}</span>
                          </span>
                          <span style={{
                            fontWeight: 700, color: '#344054',
                            background: '#F2F4F7', borderRadius: 6, padding: '2px 8px', fontSize: 11,
                          }}>{s.appointments} appts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* ── Empty state ── */}
          {filtered.length === 0 && (
            <div style={{
              textAlign: 'center', padding: 60, color: '#98A2B3',
              border: '2px dashed #E5E7EB', borderRadius: 14,
              fontFamily: "'Inter', sans-serif",
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#667085' }}>No branch data</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Select a different filter or check that branches are active.</div>
            </div>
          )}
        </>
      )}

      {/* ── Footer ── */}
      <p style={{ margin: 0, fontSize: 12, color: '#98A2B3', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        KPI data refreshes every time you change the period or click Refresh.
      </p>
    </PageWrapper>
  );
}
