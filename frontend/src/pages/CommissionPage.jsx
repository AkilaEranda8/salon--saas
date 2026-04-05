import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import Button from '../components/ui/Button';
import { Select } from '../components/ui/FormElements';
import PageWrapper from '../components/layout/PageWrapper';
import {
  StatCard, FilterBar, DataTable,
  StaffAvatar, IconDollar, IconUsers, IconReceipt,
} from '../components/ui/PageKit';

const Rs = n => `Rs. ${Number(n || 0).toLocaleString()}`;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function CommissionPage() {
  const { user } = useAuth();
  const isAdminRole = ['superadmin','admin','manager','staff'].includes(user?.role);
  const now = new Date();
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [year, setYear]     = useState(now.getFullYear());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdminRole) {
      api.get('/branches').then(r => setBranches(Array.isArray(r.data) ? r.data : (r.data?.data ?? []))).catch(() => {});
    }
  }, [isAdminRole]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month, year };
      if (branchId) params.branchId = branchId;
      const res = await api.get('/staff/commission', { params });
      setData(Array.isArray(res.data) ? res.data : []);
    } catch { setData([]); }
    setLoading(false);
  }, [month, year, branchId]);
  useEffect(() => { load(); }, [load]);

  const totalComm  = data.reduce((s, r) => s + Number(r.totalCommission || 0), 0);
  const totalRev   = data.reduce((s, r) => s + Number(r.totalRevenue    || 0), 0);
  const totalAppts = data.reduce((s, r) => s + Number(r.appointmentCount || 0), 0);

  return (
    <PageWrapper title="Commission" subtitle="Staff commission summary by period">

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Total Commission" value={Rs(totalComm)} color="#D97706" icon={<IconDollar />} />
        <StatCard label="Total Revenue"    value={Rs(totalRev)}  color="#059669" icon={<IconReceipt />} />
        <StatCard label="Staff Count"      value={data.length}   color="#2563EB" icon={<IconUsers />} />
        <StatCard label="Total Services"   value={totalAppts}    color="#7C3AED" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>} />
      </div>

      {/* Filter Bar */}
      <FilterBar>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
          {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {isAdminRole && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Table */}
      <DataTable
        columns={[
          {
            id: 'staff',
            header: 'Staff Member',
            accessorFn: row => row.staffName,
            meta: { width: '28%' },
            cell: ({ row: { original: row } }) => (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <StaffAvatar name={row.staffName} />
                <div>
                  <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{row.staffName}</div>
                  <div style={{ fontSize:11, color:'#98A2B3' }}>{row.role || 'Staff'}</div>
                </div>
              </div>
            ),
          },
          {
            id: 'branch',
            header: 'Branch',
            accessorFn: row => row.branchName,
            meta: { width: '18%' },
            cell: ({ row: { original: row } }) => <span style={{ fontSize:13, color:'#475467' }}>{row.branchName || ''}</span>,
          },
          {
            id: 'rate',
            header: 'Comm. Rate',
            accessorFn: row => row.commissionValue,
            meta: { width: '14%' },
            cell: ({ row: { original: row } }) => row.commissionType === 'percentage'
              ? <span style={{ padding:'3px 10px', borderRadius:20, background:'#EFF6FF', color:'#2563EB', fontSize:12, fontWeight:700 }}>{row.commissionValue}%</span>
              : <span style={{ padding:'3px 10px', borderRadius:20, background:'#ECFDF5', color:'#059669', fontSize:12, fontWeight:700 }}>Rs.{Number(row.commissionValue||0).toLocaleString()}</span>,
          },
          {
            id: 'services',
            header: 'Services',
            accessorFn: row => row.appointmentCount,
            meta: { width: '12%', align: 'center' },
            cell: ({ row: { original: row } }) => <span style={{ fontWeight:700, color:'#101828', fontSize:15 }}>{row.appointmentCount || 0}</span>,
          },
          {
            id: 'revenue',
            header: 'Revenue',
            accessorFn: row => row.totalRevenue,
            meta: { width: '14%', align: 'right' },
            cell: ({ row: { original: row } }) => <span style={{ fontWeight:700, color:'#2563EB', fontFamily:"'Outfit',sans-serif", fontSize:14 }}>{Rs(row.totalRevenue)}</span>,
          },
          {
            id: 'commission',
            header: 'Commission',
            accessorFn: row => row.totalCommission,
            meta: { width: '14%', align: 'right' },
            cell: ({ row: { original: row } }) => <span style={{ fontWeight:700, color:'#D97706', fontFamily:"'Outfit',sans-serif", fontSize:14 }}>{Rs(row.totalCommission)}</span>,
          },
        ]}
        data={data}
        loading={loading}
        emptyMessage="No commission data for this period"
        emptySub="Try selecting a different month or branch"
        footerRows={
          data.length > 0 ? (
            <tr style={{ background:'#F9FAFB', borderTop:'2px solid #EAECF0' }}>
              <td style={{ padding:'13px 16px' }} colSpan={3}><span style={{ fontWeight:700, color:'#101828', fontSize:13, textTransform:'uppercase', letterSpacing:'0.04em' }}>Totals</span></td>
              <td style={{ padding:'13px 16px', textAlign:'center' }}><span style={{ fontWeight:700, color:'#101828' }}>{totalAppts}</span></td>
              <td style={{ padding:'13px 16px', textAlign:'right' }}><span style={{ fontWeight:800, color:'#059669', fontFamily:"'Outfit',sans-serif" }}>{Rs(totalRev)}</span></td>
              <td style={{ padding:'13px 16px', textAlign:'right' }}><span style={{ fontWeight:800, color:'#D97706', fontFamily:"'Outfit',sans-serif" }}>{Rs(totalComm)}</span></td>
            </tr>
          ) : null
        }
      />
    </PageWrapper>
  );
}
