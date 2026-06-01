import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import PageWrapper from '../components/layout/PageWrapper';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { PKModal as Modal, StatCard, StaffAvatar, ActionBtn, FilterBar, DataTable, IconEye, IconStop, IconClock, IconCalendar, IconUsers } from '../components/ui/PageKit';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function nextCountdown(nextDate) {
  if (!nextDate) return null;
  const diff = Math.ceil((new Date(nextDate) - Date.now()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0)  return `${Math.abs(diff)}d ago`;
  return `in ${diff}d`;
}

export default function RecurringPage() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const isAdmin   = ['superadmin','admin'].includes(user?.role);
  const [branches,  setBranches]  = useState([]);
  const [branchId,  setBranchId]  = useState('');
  const [chains,    setChains]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [viewChain, setViewChain] = useState(null);
  const [stopId,    setStopId]    = useState(null);
  const [stopping,  setStopping]  = useState(false);

  useEffect(() => {
    if (isAdmin) api.get('/branches').then(r => setBranches(r.data || [])).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = branchId ? `?branchId=${branchId}` : '';
      const res = await api.get(`/appointments/recurring${params}`);
      setChains(res.data || []);
    } catch { toast('Failed to load recurring appointments.', 'error'); }
    setLoading(false);
  }, [branchId]);
  useEffect(() => { load(); }, [load]);

  const handleStop = async () => {
    if (!stopId) return;
    setStopping(true);
    try {
      await api.patch(`/appointments/${stopId}/stop-recurring`);
      toast('Recurring series stopped.', 'success');
      setStopId(null); load();
    } catch { toast('Failed to stop recurring series.', 'error'); }
    setStopping(false);
  };

  const active   = chains.filter(c => !c.stopped).length;
  const total    = chains.reduce((s, c) => s + (c.count || 0), 0);
  const thisWeek = chains.filter(c => {
    if (!c.next_date) return false;
    const diff = Math.ceil((new Date(c.next_date) - Date.now()) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;

  return (
    <PageWrapper title="Recurring Appointments" subtitle="Auto-booking chains"
      actions={isAdmin && branches.length > 0 && (
        <select value={branchId} onChange={e => setBranchId(e.target.value)}
          style={{ padding:'7px 12px', borderRadius:9, border:'1.5px solid #E4E7EC', fontSize:13, fontFamily:"'Inter',sans-serif", outline:'none', color:'#344054', background:'#fff' }}>
          <option value="">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}>

      {/* Stat Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        <StatCard label="Active Series"      value={active}   color="#2563EB" icon={<IconCalendar />} />
        <StatCard label="Total Auto-created" value={total}    color="#7C3AED" icon={<IconUsers />} />
        <StatCard label="This Week"          value={thisWeek} color="#0891B2" icon={<IconClock />} />
      </div>

      {/* Table */}
      <DataTable
        columns={[
          { id:'customer', header:'Customer', meta:{ width:'18%' },
            accessorFn: r => r.customer ? `${r.customer.first_name||''} ${r.customer.last_name||''}`.trim() : '',
            cell: ({ getValue }) => (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <StaffAvatar name={getValue()} size={32} />
                <div style={{ fontWeight:600, color:'#101828', fontSize:14 }}>{getValue()}</div>
              </div>
            )
          },
          { id:'service', header:'Service', meta:{ width:'14%' },
            accessorFn: r => r.service?.name || '',
            cell: ({ getValue }) => <span style={{ fontSize:13, color:'#344054' }}>{getValue()}</span>
          },
          { id:'staff', header:'Staff', meta:{ width:'14%' },
            accessorFn: r => r.staff ? `${r.staff.first_name||''} ${r.staff.last_name||''}`.trim() : '',
            cell: ({ getValue }) => <span style={{ fontSize:13, color:'#344054' }}>{getValue()}</span>
          },
          { id:'schedule', header:'Schedule', meta:{ width:'14%' },
            accessorFn: r => r.next_date ? DAYS[new Date(r.next_date).getDay()] : '',
            cell: ({ row }) => {
              const c = row.original;
              const day = c.next_date ? DAYS[new Date(c.next_date).getDay()] : '';
              const timeStr = c.appointment_time ? c.appointment_time.slice(0,5) : '';
              return (
                <>
                  <div style={{ fontSize:13, fontWeight:600, color:'#101828' }}>Every {day}</div>
                  <div style={{ fontSize:12, color:'#98A2B3' }}>{timeStr}</div>
                </>
              );
            }
          },
          { id:'branch', header:'Branch', meta:{ width:'12%' },
            accessorFn: r => r.branch?.name || '',
            cell: ({ getValue }) => <span style={{ fontSize:13, color:'#64748B' }}>{getValue()}</span>
          },
          { id:'nextBooking', header:'Next Booking', meta:{ width:'14%' },
            accessorFn: r => r.next_date || '',
            cell: ({ row }) => {
              const c = row.original;
              if (!c.next_date) return <span style={{ color:'#98A2B3', fontSize:13 }}></span>;
              const countdown = nextCountdown(c.next_date);
              return (
                <>
                  <div style={{ fontSize:13, fontWeight:600, color:'#101828' }}>
                    {new Date(c.next_date).toLocaleDateString('en-US',{day:'numeric',month:'short'})}
                  </div>
                  <div style={{ fontSize:11, marginTop:2, color:countdown&&countdown.startsWith('in')?'#16A34A':'#98A2B3' }}>{countdown}</div>
                </>
              );
            }
          },
          { id:'series', header:'Series', meta:{ width:'8%', align:'center' },
            accessorFn: r => r.count || 0,
            cell: ({ getValue }) => <span style={{ padding:'3px 10px', borderRadius:10, fontSize:12, fontWeight:700, background:'#F0FDF4', color:'#16A34A' }}>{getValue()}</span>
          },
          { id:'actions', header:'Actions', meta:{ width:'6%', align:'center' },
            cell: ({ row }) => {
              const c = row.original;
              return (
                <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                  <ActionBtn onClick={() => setViewChain(c)} title="View history" color="#2563EB"><IconEye /></ActionBtn>
                  {!c.stopped && <ActionBtn onClick={() => setStopId(c.id)} title="Stop recurring" color="#DC2626"><IconStop /></ActionBtn>}
                </div>
              );
            }
          },
        ]}
        data={chains}
        loading={loading}
        emptyMessage="No recurring appointments found"
        emptySub="Recurring chains appear when appointments are set to repeat"
        searchableColumns={[
          { id: 'customer', title: 'Customer' },
          { id: 'service', title: 'Service' },
        ]}
      />

      {/* View History Modal */}
      {viewChain && (
        <Modal open title="Recurring History" onClose={() => setViewChain(null)} size="md"
          footer={<Button variant="secondary" onClick={() => setViewChain(null)}>Close</Button>}>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            {[['Customer', viewChain.customer], ['Service', {name:viewChain.service?.name}], ['Staff', viewChain.staff], ['Branch', viewChain.branch]].map(([k, obj]) => (
              <div key={k} style={{ display:'flex', gap:8, fontSize:14 }}>
                <span style={{ fontWeight:600, color:'#98A2B3', width:80 }}>{k}:</span>
                <span style={{ color:'#101828' }}>{obj ? (obj.name || `${obj.first_name||''} ${obj.last_name||''}`.trim()) : ''}</span>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, fontSize:14 }}>
              <span style={{ fontWeight:600, color:'#98A2B3', width:80 }}>Schedule:</span>
              <span style={{ color:'#101828' }}>Every {viewChain.next_date ? DAYS[new Date(viewChain.next_date).getDay()] : '?'} at {(viewChain.appointment_time||'').slice(0,5)}</span>
            </div>
            <div style={{ display:'flex', gap:8, fontSize:14 }}>
              <span style={{ fontWeight:600, color:'#98A2B3', width:80 }}>Series:</span>
              <span style={{ color:'#101828' }}>{viewChain.count||0} booking{viewChain.count!==1?'s':''} created</span>
            </div>
          </div>
          {viewChain.appointments?.length > 0 && (
            <>
              <div style={{ fontWeight:700, marginBottom:8, fontSize:11, color:'#98A2B3', textTransform:'uppercase', letterSpacing:'0.05em' }}>Booking History</div>
              <div style={{ borderRadius:10, border:'1px solid #EAECF0', overflow:'hidden' }}>
                {viewChain.appointments.slice(0,10).map((a, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', borderTop:i>0?'1px solid #F2F4F7':'none', fontSize:13, background:i%2===0?'#fff':'#FAFAFA' }}>
                    <span style={{ color:'#344054' }}>{new Date(a.appointment_date).toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'})}</span>
                    <span style={{ fontWeight:600, color:{confirmed:'#2563EB',completed:'#16A34A',cancelled:'#DC2626',pending:'#D97706'}[a.status]||'#64748B' }}>{a.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Stop Confirm Modal */}
      {stopId && (
        <Modal open title="Stop Recurring Series" onClose={() => setStopId(null)} size="sm"
          footer={<><Button variant="secondary" onClick={() => setStopId(null)}>Cancel</Button>
            <Button variant="danger" loading={stopping} onClick={handleStop}>Stop Series</Button></>}>
          <p style={{ fontSize:14, color:'#344054', margin:0 }}>
            Are you sure you want to stop this recurring series? No future appointments will be auto-created.
          </p>
        </Modal>
      )}
    </PageWrapper>
  );
}
